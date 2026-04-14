import { describe, test, expect } from "bun:test"
import { Pipeline, type StepResult } from "./Pipeline"
import { defineStep } from "../step-loader/StepContract"

describe("Pipeline", () => {
  test("executes steps in dependency order", async () => {
    const executionLog: string[] = []

    const step1 = defineStep({
      name: "first",
      run: async () => {
        executionLog.push("first")
        return {}
      },
    })

    const step2 = defineStep({
      name: "second",
      dependsOnSteps: ["first"],
      run: async () => {
        executionLog.push("second")
        return {}
      },
    })

    const pipeline = new Pipeline({
      steps: [step1, step2],
      workflow: ["first", "second"],
    })

    const results = await pipeline.execute()

    expect(executionLog).toEqual(["first", "second"])
    expect(results.every((r) => r.status === "pass")).toBe(true)
  })

  test("stops execution on step failure", async () => {
    const executionLog: string[] = []

    const step1 = defineStep({
      name: "failing",
      run: async () => {
        executionLog.push("failing")
        throw new Error("step failed")
      },
    })

    const step2 = defineStep({
      name: "should-not-run",
      dependsOnSteps: ["failing"],
      run: async () => {
        executionLog.push("should-not-run")
        return {}
      },
    })

    const pipeline = new Pipeline({
      steps: [step1, step2],
      workflow: ["failing", "should-not-run"],
    })

    const results = await pipeline.execute()

    expect(executionLog).toEqual(["failing"])
    expect(results[0].status).toBe("fail")
    expect(results[0].error).toBeDefined()
  })

  test("reports step duration", async () => {
    const step = defineStep({
      name: "timed",
      run: async () => {
        await new Promise((r) => setTimeout(r, 50))
        return {}
      },
    })

    const pipeline = new Pipeline({
      steps: [step],
      workflow: ["timed"],
    })

    const results = await pipeline.execute()

    expect(results[0].durationMs).toBeGreaterThanOrEqual(40)
  })
})
