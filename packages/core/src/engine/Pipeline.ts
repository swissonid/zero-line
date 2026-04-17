import { Effect, Layer } from "effect"
import { buildExecutionOrder } from "./DependencyGraph"
import type { PluginStep, StepContext } from "../step-loader/StepContract"
import { ConsoleLoggerLive } from "../adapters/ConsoleLogger"
import { LocalPlatformLive, detectToolchains, platformSupports } from "../adapters/LocalPlatform"
import { MemoryArtifactStoreLive } from "../adapters/MemoryArtifactStore"
import { LocalEnvConfigLive } from "../adapters/LocalEnvConfig"

/**
 * Default runtime layer exported for CLI convenience. Includes logging,
 * local platform detection, an in-memory artifact store, and an env-backed
 * {@link ConfigService} so callers can resolve env vars and secrets without
 * a project-dir-bound config layer. Callers that need real config loading
 * (i.e. `config.load()`) compose `makeFileConfigLayer(projectDir)` on top
 * — its `ConfigService` wins thanks to Effect's last-layer-wins semantics.
 */
export const DefaultRuntimeLayer = Layer.mergeAll(
  ConsoleLoggerLive,
  LocalPlatformLive,
  MemoryArtifactStoreLive,
  LocalEnvConfigLive,
)

export interface StepResult {
  readonly name: string
  readonly status: "pass" | "fail" | "skipped"
  readonly durationMs: number
  readonly error?: string
  readonly output?: Record<string, unknown>
}

/**
 * Caller-supplied pipeline configuration.
 *
 * The `R` generic declares the service-requirement union the pipeline's steps
 * consume. The caller is attesting that every Effect-based step's `run` will
 * be provided at least these services via an `Effect.provide(..., layer)` at
 * the call site. The runtime layer no longer lives inside the pipeline — it
 * is supplied by whoever runs `pipeline.execute`.
 */
export interface PipelineConfig<R = never> {
  readonly steps: ReadonlyArray<PluginStep>
  readonly workflow: ReadonlyArray<string>
  readonly context?: Partial<StepContext>
  /** Unused — reserved so future R-inference helpers can key off it. */
  readonly _R?: R
}

export function makeDefaultContext(overrides?: Partial<StepContext>): StepContext {
  const artifactStore = new Map<string, unknown>()
  return {
    logger: {
      info: (msg) => console.log(`[INFO] ${msg}`),
      warn: (msg) => console.warn(`[WARN] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`),
      debug: (msg) => console.debug(`[DEBUG] ${msg}`),
    },
    config: {
      env: (key) => process.env[key],
      secret: (key) => process.env[key],
    },
    platform: {
      os: () => process.platform,
      availableToolchains: () => detectToolchains(),
      supports: (name) => platformSupports(name),
    },
    artifacts: {
      put: (key, artifact) => {
        artifactStore.set(key, artifact)
      },
      get: (key) => artifactStore.get(key),
      list: () => Array.from(artifactStore.keys()),
    },
    ...overrides,
  }
}

/**
 * A built pipeline. `execute` is an Effect value (not a function); the caller
 * provides the runtime layer for `R` and then runs it with their preferred
 * runtime (`Effect.runPromise`, `ManagedRuntime`, a top-level CLI program,
 * etc.).
 *
 * The error channel is `never`: individual step failures are caught and
 * surfaced in the returned `StepResult[]`, matching the original
 * Promise-based behaviour where `execute()` always resolved (never rejected).
 */
export interface Pipeline<R = never> {
  readonly execute: Effect.Effect<ReadonlyArray<StepResult>, never, R>
}

/**
 * Build a `Pipeline` from step definitions and an execution order.
 *
 * Preserves fail-stop semantics: execution halts at the first failed step and
 * remaining steps are reported as `"skipped"`.
 */
export function definePipeline<R = never>(
  config: PipelineConfig<R>
): Pipeline<R> {
  const context = makeDefaultContext(config.context)
  const stepMap = new Map(config.steps.map((s) => [s.name, s]))
  const executionOrder = buildExecutionOrder(
    Array.from(stepMap.values()),
    config.workflow
  )

  // Fold over the execution order, halting at the first failure. After a
  // failure, remaining steps are marked "skipped". Implemented via
  // Effect.reduce so the fold stays in-Effect and inherits the R channel
  // from `runOneStep`.
  const program = Effect.reduce(
    executionOrder,
    { results: [] as StepResult[], halted: false },
    (acc, name) => {
      if (acc.halted) {
        return Effect.succeed({
          results: [
            ...acc.results,
            { name, status: "skipped" as const, durationMs: 0 },
          ],
          halted: true,
        })
      }
      const step = stepMap.get(name)
      if (!step) {
        // Dependency graph guarantees every `name` resolves to a step; this
        // branch exists to narrow the `undefined` and surface a clear
        // diagnostic if the invariant is ever violated.
        return Effect.succeed({
          results: [
            ...acc.results,
            {
              name,
              status: "fail" as const,
              durationMs: 0,
              error: `Step '${name}' not found in pipeline`,
            },
          ],
          halted: true,
        })
      }
      return runOneStep<R>(step, context).pipe(
        Effect.map((result) => ({
          results: [...acc.results, result],
          halted: result.status === "fail",
        }))
      )
    }
  )

  return {
    execute: program.pipe(Effect.map((acc) => acc.results)),
  }
}

/**
 * Execute a single step and return its `StepResult`.
 *
 * The returned Effect never fails (errors are captured into the result).
 * The `R` channel reflects the caller-declared service union — the caller of
 * `definePipeline` attests via the generic that the layer they provide will
 * satisfy every step's Effect runtime requirements.
 *
 * Wrapped with {@link Effect.fn} so each per-step invocation creates a
 * `Pipeline.runOneStep` span; the step's own name is attached as an attribute
 * so span trees are easy to scan when a workflow runs dozens of steps.
 */
const runOneStep = Effect.fn("Pipeline.runOneStep")(function* <R>(
  step: PluginStep,
  context: StepContext
) {
  const start = performance.now()

  const either =
    step._tag === "simple"
      ? yield* Effect.either(
          Effect.tryPromise({
            try: () => step.execute({}, context),
            catch: (err) => err,
          })
        )
      : yield* Effect.either(
          // The compiled step surface erases R to `unknown`. We narrow it
          // to the pipeline's declared `R` so the effect flows through
          // without the caller having to cast. The caller is responsible
          // for providing a layer satisfying `R` before running.
          step.run({}) as Effect.Effect<Record<string, unknown>, unknown, R>
        )

  const durationMs = Math.round(performance.now() - start)

  if (either._tag === "Right") {
    const result: StepResult = {
      name: step.name,
      status: "pass",
      durationMs,
      output: either.right,
    }
    return result
  }
  const result: StepResult = {
    name: step.name,
    status: "fail",
    durationMs,
    error: either.left instanceof Error ? either.left.message : String(either.left),
  }
  return result
})
