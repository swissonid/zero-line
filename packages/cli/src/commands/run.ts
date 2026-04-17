import { definePipeline } from "@zl/core"
import type { PluginStep, ZlConfig } from "@zl/core"
import { renderResults } from "../output/Renderer"
import { defaultIO, type CliIO } from "../io"

export interface RunOptions {
  readonly workflowName: string
  readonly config: ZlConfig
  readonly steps: ReadonlyArray<PluginStep>
  readonly io?: CliIO
}

export async function runWorkflow(options: RunOptions): Promise<boolean> {
  const io = options.io ?? defaultIO

  const workflow = options.config.workflows[options.workflowName]
  if (!workflow) {
    io.stderr(`Workflow '${options.workflowName}' not found.`)
    io.stderr(`Available workflows: ${Object.keys(options.config.workflows).join(", ")}`)
    return false
  }

  io.stdout(`\nRunning workflow: ${options.workflowName}\n`)

  const pipeline = definePipeline({
    steps: options.steps,
    workflow,
  })

  const results = await pipeline.execute()

  io.stdout(renderResults(results))

  return results.every((r) => r.status !== "fail")
}
