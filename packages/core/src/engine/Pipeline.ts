import { buildExecutionOrder } from "./DependencyGraph"
import type { ResolvedStep, StepContext } from "../step-loader/StepContract"

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
}

function makeDefaultContext(overrides?: Partial<StepContext>): StepContext {
  return {
    logger: {
      info: (msg) => console.log(`[INFO] ${msg}`),
      warn: (msg) => console.warn(`[WARN] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`),
      debug: () => {},
    },
    config: {
      env: (key) => process.env[key],
      secret: () => undefined,
    },
    platform: {
      os: () => process.platform,
      availableToolchains: () => [],
      supports: () => true,
    },
    artifacts: {
      put: () => {},
      get: () => undefined,
      list: () => [],
    },
    ...overrides,
  }
}

export class Pipeline {
  private readonly steps: ReadonlyArray<ResolvedStep>
  private readonly workflow: ReadonlyArray<string>
  private readonly context: StepContext

  constructor(config: PipelineConfig) {
    this.steps = config.steps
    this.workflow = config.workflow
    this.context = makeDefaultContext(config.context)
  }

  async execute(): Promise<ReadonlyArray<StepResult>> {
    const executionOrder = buildExecutionOrder(this.steps, this.workflow)
    const stepMap = new Map<string, ResolvedStep>()
    for (const step of this.steps) {
      stepMap.set(step.name, step)
    }

    const results: StepResult[] = []

    for (const name of executionOrder) {
      const step = stepMap.get(name)!
      const start = performance.now()

      try {
        let output: Record<string, unknown>
        if (step._tag === "simple") {
          output = await step.execute({}, this.context)
        } else {
          const { Effect } = await import("effect")
          output = await Effect.runPromise(step.run({}))
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

    // Mark remaining unexecuted steps as skipped
    const executed = new Set(results.map((r) => r.name))
    for (const name of executionOrder) {
      if (!executed.has(name)) {
        results.push({ name, status: "skipped", durationMs: 0 })
      }
    }

    return results
  }
}
