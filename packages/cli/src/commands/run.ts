import { Effect } from "effect"
import { definePipeline, DefaultRuntimeLayer } from "@zl/core"
import type { ResolvedStep, ZlConfig } from "@zl/core"
import { renderResults } from "../output/Renderer"
import { defaultIO, type CliIO } from "../io"

export interface RunOptions {
  readonly workflowName: string
  readonly config: ZlConfig
  /**
   * Workflow-bound steps ready for execution. Callers must pre-resolve their
   * `StepInstance[]` → `ResolvedStep[]` via `resolveStepInstances` so bound
   * options reach the pipeline (ZER-112). Passing raw `PluginStep[]` with
   * empty options was the pre-ZER-112 behaviour and would now fail typing.
   */
  readonly steps: ReadonlyArray<ResolvedStep>
  readonly io?: CliIO
  /**
   * Propagated to the pipeline — useful for `zl doctor` or integration tests
   * where requirement validation happens out-of-band. Default: `false`.
   */
  readonly skipPreflight?: boolean
}

/**
 * Run a workflow and return whether it succeeded (no step failures).
 *
 * Returns an Effect so it composes into the CLI's top-level Effect program
 * without re-introducing `runPromise` boundaries. The `R` channel is
 * satisfied by {@link DefaultRuntimeLayer}, which is provided internally so
 * callers don't need to know which services the steps consume.
 */
export function runWorkflow(
  options: RunOptions
): Effect.Effect<boolean, never, never> {
  const io = options.io ?? defaultIO

  const workflow = options.config.workflows[options.workflowName]
  if (!workflow) {
    return Effect.sync(() => {
      io.stderr(`Workflow '${options.workflowName}' not found.`)
      io.stderr(
        `Available workflows: ${Object.keys(options.config.workflows).join(", ")}`
      )
      return false
    })
  }

  return Effect.gen(function* () {
    io.stdout(`\nRunning workflow: ${options.workflowName}\n`)

    const pipeline = definePipeline({
      steps: options.steps,
      workflow,
      skipPreflight: options.skipPreflight,
    })

    const results = yield* Effect.provide(pipeline.execute, DefaultRuntimeLayer)

    io.stdout(renderResults(results))

    return results.every((r) => r.status !== "fail")
  })
}
