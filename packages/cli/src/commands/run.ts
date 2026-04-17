import { Effect } from "effect"
import { definePipeline, DefaultRuntimeLayer } from "@zl/core"
import type { PluginStep, ZlConfig } from "@zl/core"
import { renderResults } from "../output/Renderer"
import { defaultIO, type CliIO } from "../io"

export interface RunOptions {
  readonly workflowName: string
  readonly config: ZlConfig
  readonly steps: ReadonlyArray<PluginStep>
  readonly io?: CliIO
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
    })

    const results = yield* Effect.provide(pipeline.execute, DefaultRuntimeLayer)

    io.stdout(renderResults(results))

    return results.every((r) => r.status !== "fail")
  })
}
