import { Effect, Layer } from "effect"
import { buildExecutionOrder } from "./DependencyGraph"
import { preflightCheck } from "./PreflightCheck"
import { StepError } from "./StepError"
import type { ResolvedStep, StepContext } from "../step-loader/StepContract"
import { ConsoleLoggerLive } from "../adapters/ConsoleLogger"
import { LocalPlatformLive, detectToolchains, platformSupports } from "../adapters/LocalPlatform"
import { MemoryArtifactStoreLive } from "../adapters/MemoryArtifactStore"
import { LocalEnvConfigLive } from "../adapters/LocalEnvConfig"
import { ConfigService } from "../ports/ConfigService"
import { PlatformService } from "../ports/PlatformService"

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
  /** Human-readable error message; present when `status === "fail"`. */
  readonly error?: string
  /**
   * Machine-readable error code, populated when the failure carried a
   * {@link StepError} (e.g. `PREFLIGHT_MISSING_SECRETS` from pre-flight, or
   * a step-author-invented code from a failed step). Plain `Error`s and
   * unknown thrown values leave this undefined so the renderer can fall
   * back to `Error: <message>`.
   */
  readonly code?: string
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
 *
 * Post-ZER-112, `steps` is `ReadonlyArray<ResolvedStep>` — each step carries
 * its workflow-bound `options` and (possibly aliased) `name`, and execution
 * threads those options to `plugin.execute(options, ctx)` / `plugin.run(options)`.
 */
export interface PipelineConfig<R = never> {
  readonly steps: ReadonlyArray<ResolvedStep>
  readonly workflow: ReadonlyArray<string>
  readonly context?: Partial<StepContext>
  /**
   * When `true`, skip the {@link preflightCheck} step. Useful for tests and
   * for callers that have already validated requirements out-of-band (e.g.
   * a `zl doctor` preceding the run). Default: `false`.
   */
  readonly skipPreflight?: boolean
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
 * The error channel is `never`: individual step failures (and pre-flight
 * failures) are caught and surfaced in the returned `StepResult[]`, matching
 * the original Promise-based behaviour where `execute()` always resolved.
 *
 * The `R` channel reflects the caller-declared service union *plus*
 * {@link ConfigService} and {@link PlatformService} — those are always
 * required internally for the pre-flight check, even if no step consumes
 * them directly. `DefaultRuntimeLayer` provides both out of the box.
 */
export interface Pipeline<R = never> {
  readonly execute: Effect.Effect<ReadonlyArray<StepResult>, never, R | ConfigService | PlatformService>
}

/**
 * Build a `Pipeline` from workflow-bound step definitions and an execution
 * order.
 *
 * Preserves fail-stop semantics: execution halts at the first failed step and
 * remaining steps are reported as `"skipped"`. Pre-flight runs once before
 * the first step; on failure, the first workflow step is marked `"fail"` with
 * the preflight's {@link StepError.code} surfaced on
 * {@link StepResult.code}, and every subsequent step is `"skipped"`.
 */
export function definePipeline<R = never>(
  config: PipelineConfig<R>
): Pipeline<R> {
  const context = makeDefaultContext(config.context)
  const stepMap = new Map(config.steps.map((s) => [s.name, s]))
  const executionOrder = buildExecutionOrder(
    Array.from(stepMap.values()).map((s) => ({
      name: s.name,
      dependsOnSteps: s.dependsOnSteps,
    })),
    config.workflow
  )

  // Resolved steps in execution order. Used by preflight (which needs the
  // `plugin` to read `requiredSecrets` / etc.) and by the step runner.
  const orderedSteps = executionOrder
    .map((name) => stepMap.get(name))
    .filter((s): s is ResolvedStep => s !== undefined)

  // Preflight: returns either a typed StepError ("preflight failed — here's
  // which category + keys are missing") or void. We fold the result into the
  // StepResult[] shape the pipeline already guarantees.
  const preflightProgram: Effect.Effect<StepError | null, never, ConfigService | PlatformService> = config.skipPreflight
    ? Effect.succeed(null)
    : preflightCheck(orderedSteps).pipe(
        Effect.as<StepError | null>(null),
        // Recover the typed StepError from the error channel into the success
        // channel so the pipeline can decide fail-vs-skip without bubbling
        // the error out of the overall `Effect<..., never, R>` surface.
        Effect.catchAll((err) => Effect.succeed(err as StepError)),
        // Defensive: if preflight dies (shouldn't happen — `preflightCheck`
        // has a typed E channel), turn the defect into a synthetic
        // PREFLIGHT_FAILED error so the pipeline still produces a
        // StepResult[] instead of crashing.
        Effect.catchAllDefect((defect) =>
          Effect.succeed(
            new StepError({
              code: "PREFLIGHT_FAILED",
              message: `Pre-flight check crashed: ${defectMessage(defect)}`,
              cause: defect,
            })
          )
        )
      )

  // Build the step-execution fold. Folded over `executionOrder` with an
  // accumulator that tracks results and whether we've halted (fail-stop).
  const stepsProgram = Effect.reduce(
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
              code: "STEP_NOT_FOUND",
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

  // Thread the preflight result into the step-execution fold. If preflight
  // failed, synthesize a StepResult[] directly (first step = fail, rest =
  // skipped) and short-circuit the per-step loop.
  const program: Effect.Effect<
    ReadonlyArray<StepResult>,
    never,
    R | ConfigService | PlatformService
  > = preflightProgram.pipe(
    Effect.flatMap((preflightErr) => {
      if (preflightErr) {
        const results: StepResult[] = executionOrder.map((name, idx) =>
          idx === 0
            ? {
                name,
                status: "fail" as const,
                durationMs: 0,
                error: preflightErr.message,
                code: preflightErr.code,
              }
            : { name, status: "skipped" as const, durationMs: 0 }
        )
        return Effect.succeed(results as ReadonlyArray<StepResult>)
      }
      return stepsProgram.pipe(Effect.map((acc) => acc.results))
    })
  )

  return {
    execute: program,
  }
}

function defectMessage(defect: unknown): string {
  if (defect instanceof Error) return defect.message
  return String(defect)
}

/**
 * Extract a human-readable error payload (and, when applicable, a
 * documented failure `code`) from a step's failure cause.
 *
 * Only {@link StepError} contributes a `code` — plain `Error`s and arbitrary
 * thrown values surface a message only, with `code` omitted. This matches
 * the contract the Renderer relies on: `[CODE] message` only when the
 * failure carried a documented code to look up.
 */
function extractStepFailure(err: unknown): { error: string; code?: string } {
  if (err instanceof StepError) {
    return { error: err.message, code: err.code }
  }
  if (err instanceof Error) {
    return { error: err.message }
  }
  return { error: String(err) }
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
 *
 * The step's bound `options` (not `{}`) are forwarded to `plugin.execute` /
 * `plugin.run` — this is the ZER-112 behaviour. Before ZER-112 the pipeline
 * passed `{}`, losing any workflow-bound options.
 */
const runOneStep = Effect.fn("Pipeline.runOneStep")(function* <R>(
  step: ResolvedStep,
  context: StepContext
) {
  const start = performance.now()

  // Narrow the plugin once so both branches see the resolved _tag. This
  // also lets the simple branch call `.execute` without a redundant tag
  // check inside the `tryPromise` `try` thunk.
  const plugin = step.plugin
  const either =
    plugin._tag === "simple"
      ? yield* Effect.either(
          Effect.tryPromise({
            try: () => plugin.execute(step.options, context),
            catch: (err) => err,
          })
        )
      : yield* Effect.either(
          // The compiled step surface erases R to `unknown`. We narrow it
          // to the pipeline's declared `R` so the effect flows through
          // without the caller having to cast. The caller is responsible
          // for providing a layer satisfying `R` before running.
          plugin.run(step.options) as Effect.Effect<
            Record<string, unknown>,
            unknown,
            R
          >
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
  const failure = extractStepFailure(either.left)
  const result: StepResult = {
    name: step.name,
    status: "fail",
    durationMs,
    error: failure.error,
    // Only set `code` when the underlying error carried one — keeps the
    // result shape aligned with the "code optional, absent for generic
    // Errors" contract the Renderer depends on.
    ...(failure.code !== undefined ? { code: failure.code } : {}),
  }
  return result
})

