import { describe, test, expect } from "bun:test"
import { defineStep, type ZlConfig } from "@zl/core"
import { runWorkflow } from "./run"
import type { CliIO } from "../cli"

function makeIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return {
    io: {
      stdout: (m) => out.push(m),
      stderr: (m) => err.push(m),
    },
    out,
    err,
  }
}

const mkConfig = (workflows: Record<string, string[]>): ZlConfig => ({
  app: { name: "T", bundleId: "c.t" },
  platforms: {},
  workflows,
})

describe("runWorkflow", () => {
  test("returns false and reports when the workflow is not found", async () => {
    const { io, err } = makeIO()
    const result = await runWorkflow({
      workflowName: "missing",
      config: mkConfig({ ci: ["hello"] }),
      steps: [],
      io,
    })
    expect(result).toBe(false)
    expect(err.join("\n")).toContain("missing")
    expect(err.join("\n")).toContain("Available workflows")
  })

  test("returns true when all steps pass", async () => {
    const { io } = makeIO()
    const step = defineStep({ name: "ok", run: async () => ({}) })
    const result = await runWorkflow({
      workflowName: "ci",
      config: mkConfig({ ci: ["ok"] }),
      steps: [step],
      io,
    })
    expect(result).toBe(true)
  })

  test("returns false when a step fails", async () => {
    const { io } = makeIO()
    const step = defineStep({
      name: "boom",
      run: async () => {
        throw new Error("nope")
      },
    })
    const result = await runWorkflow({
      workflowName: "ci",
      config: mkConfig({ ci: ["boom"] }),
      steps: [step],
      io,
    })
    expect(result).toBe(false)
  })

  test("falls back to console IO when none provided", async () => {
    const origLog = console.log
    const origErr = console.error
    const logged: string[] = []
    const errored: string[] = []
    console.log = (m: string) => logged.push(String(m))
    console.error = (m: string) => errored.push(String(m))
    try {
      const notFound = await runWorkflow({
        workflowName: "absent",
        config: mkConfig({ ci: ["hello"] }),
        steps: [],
      })
      expect(notFound).toBe(false)
      expect(errored.some((m) => m.includes("absent"))).toBe(true)

      const step = defineStep({ name: "ok", run: async () => ({}) })
      const passed = await runWorkflow({
        workflowName: "ci",
        config: mkConfig({ ci: ["ok"] }),
        steps: [step],
      })
      expect(passed).toBe(true)
      expect(logged.some((m) => m.includes("Running workflow"))).toBe(true)
    } finally {
      console.log = origLog
      console.error = origErr
    }
  })
})
