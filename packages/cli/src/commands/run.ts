import { Pipeline } from "@zl/core"
import type { ResolvedStep, ZlConfig } from "@zl/core"
import { renderResults } from "../output/Renderer"

export interface RunOptions {
  readonly workflowName: string
  readonly config: ZlConfig
  readonly verbose?: boolean
  readonly steps: ReadonlyArray<ResolvedStep>
}

export async function runWorkflow(options: RunOptions): Promise<boolean> {
  const workflow = options.config.workflows[options.workflowName]
  if (!workflow) {
    console.error(`Workflow '${options.workflowName}' not found.`)
    console.error(`Available workflows: ${Object.keys(options.config.workflows).join(", ")}`)
    return false
  }

  console.log(`\nRunning workflow: ${options.workflowName}\n`)

  const pipeline = new Pipeline({
    steps: options.steps,
    workflow,
  })

  const results = await pipeline.execute()

  console.log(renderResults(results))

  return results.every((r) => r.status !== "fail")
}
