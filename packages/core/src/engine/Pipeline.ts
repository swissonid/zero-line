import { Effect, Layer } from "effect"
import { buildExecutionOrder } from "./DependencyGraph"
import type { ResolvedStep, StepContext } from "../step-loader/StepContract"
import { ConsoleLoggerLive } from "../adapters/ConsoleLogger"
import { LocalPlatformLive, detectToolchains, platformSupports } from "../adapters/LocalPlatform"
import { MemoryArtifactStoreLive } from "../adapters/MemoryArtifactStore"

export const DefaultRuntimeLayer = Layer.mergeAll(
  ConsoleLoggerLive,
  LocalPlatformLive,
  MemoryArtifactStoreLive,
)

export interface StepResult {
  readonly name: string
  readonly status: "pass" | "fail" | "skipped"
  readonly durationMs: number
  readonly error?: string
  readonly output?: Record<string, unknown>
}

export interface PipelineConfig {
  readonly steps: ReadonlyArray<ResolvedStep>
  readonly workflow: ReadonlyArray<string>
  readonly context?: Partial<StepContext>
  readonly runtimeLayer?: Layer.Layer<any, any, never>
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

export class Pipeline {
  private readonly steps: ReadonlyArray<ResolvedStep>
  private readonly workflow: ReadonlyArray<string>
  private readonly context: StepContext
  private readonly runtimeLayer: Layer.Layer<any, any, never>

  private readonly stepMap: Map<string, ResolvedStep>

  constructor(config: PipelineConfig) {
    this.steps = config.steps
    this.workflow = config.workflow
    this.context = makeDefaultContext(config.context)
    this.runtimeLayer = config.runtimeLayer ?? DefaultRuntimeLayer
    this.stepMap = new Map(this.steps.map((s) => [s.name, s]))
  }

  async execute(): Promise<ReadonlyArray<StepResult>> {
    const executionOrder = buildExecutionOrder(this.steps, this.workflow)

    const results: StepResult[] = []

    for (const name of executionOrder) {
      const step = this.stepMap.get(name)!
      const start = performance.now()

      try {
        let output: Record<string, unknown>
        if (step._tag === "simple") {
          output = await step.execute({}, this.context)
        } else {
          const provided = Effect.provide(
            step.run({}),
            this.runtimeLayer
          ) as Effect.Effect<Record<string, unknown>, unknown, never>
          output = await Effect.runPromise(provided)
        }

        results.push({
          name,
          status: "pass",
          durationMs: Math.round(performance.now() - start),
          output,
        })
      } catch (err) {
        results.push({
          name,
          status: "fail",
          durationMs: Math.round(performance.now() - start),
          error: err instanceof Error ? err.message : String(err),
        })
        break
      }
    }

    const executed = new Set(results.map((r) => r.name))
    for (const name of executionOrder) {
      if (!executed.has(name)) {
        results.push({ name, status: "skipped", durationMs: 0 })
      }
    }

    return results
  }
}
