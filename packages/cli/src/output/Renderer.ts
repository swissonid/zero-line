import type { StepResult } from "@zl/core"

const PASS = "\x1b[32m✓\x1b[0m"
const FAIL = "\x1b[31m✗\x1b[0m"
const SKIP = "\x1b[33m○\x1b[0m"

export function renderStepResult(result: StepResult): string {
  const icon = result.status === "pass" ? PASS : result.status === "fail" ? FAIL : SKIP
  const duration = result.durationMs > 0 ? ` (${result.durationMs}ms)` : ""
  const error = result.error
    ? `\n    Error: ${result.code ? `[${result.code}] ` : ""}${result.error}`
    : ""
  return `  ${icon} ${result.name}${duration}${error}`
}

export function renderResults(results: ReadonlyArray<StepResult>): string {
  const lines: string[] = []
  let passed = 0, failed = 0, skipped = 0

  for (const result of results) {
    lines.push(renderStepResult(result))
    if (result.status === "pass") passed++
    else if (result.status === "fail") failed++
    else skipped++
  }

  lines.push("")
  lines.push(`  ${passed} passed, ${failed} failed, ${skipped} skipped`)

  return lines.join("\n")
}
