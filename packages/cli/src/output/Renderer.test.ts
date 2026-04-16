import { describe, test, expect } from "bun:test"
import { renderResults, renderStepResult } from "./Renderer"
import type { StepResult } from "@zl/core"

describe("Renderer", () => {
  test("renders passing results", () => {
    const results: StepResult[] = [
      { name: "test", status: "pass", durationMs: 120 },
      { name: "build", status: "pass", durationMs: 3400 },
    ]

    const output = renderResults(results)
    expect(output).toContain("test")
    expect(output).toContain("build")
    expect(output).toContain("2 passed, 0 failed, 0 skipped")
  })

  test("renders failures with error message", () => {
    const results: StepResult[] = [
      { name: "test", status: "fail", durationMs: 50, error: "Tests failed" },
      { name: "build", status: "skipped", durationMs: 0 },
    ]

    const output = renderResults(results)
    expect(output).toContain("Tests failed")
    expect(output).toContain("0 passed, 1 failed, 1 skipped")
  })

  test("renderStepResult omits duration when zero", () => {
    const out = renderStepResult({ name: "skipped-step", status: "skipped", durationMs: 0 })
    expect(out).not.toContain("(0ms)")
    expect(out).toContain("skipped-step")
  })
})
