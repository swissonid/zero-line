import type { StepResult } from "@zl/core"

const PASS = "\x1b[32m✓\x1b[0m"
const FAIL = "\x1b[31m✗\x1b[0m"
const SKIP = "\x1b[33m○\x1b[0m"

export function renderStepResult(result: StepResult): string {
  const icon = result.status === "pass" ? PASS : result.status === "fail" ? FAIL : SKIP
  const duration = result.durationMs > 0 ? ` (${result.durationMs}ms)` : ""
  const error = result.error ? `\n    Error: ${result.error}` : ""
  return `  ${icon} ${result.name}${duration}${error}`
}

export function renderResults(results: ReadonlyArray<StepResult>): string {
  const lines = results.map(renderStepResult)
  const passed = results.filter((r) => r.status === "pass").length
  const failed = results.filter((r) => r.status === "fail").length
  const skipped = results.filter((r) => r.status === "skipped").length

  lines.push("")
  lines.push(`  ${passed} passed, ${failed} failed, ${skipped} skipped`)

  return lines.join("\n")
}
