import { describe, test, expect } from "bun:test"
import { Pipeline, defineStep } from "@zl/core"

describe("E2E: full pipeline execution", () => {
  test("runs a workflow with multiple steps end-to-end", async () => {
    const log: string[] = []

    const greet = defineStep({
      name: "greet",
      run: async (opts, ctx) => {
        log.push("greet")
        ctx.logger.info("Greeting!")
        return { message: "hello" }
      },
    })

    const shout = defineStep({
      name: "shout",
      dependsOnSteps: ["greet"],
      run: async (opts, ctx) => {
        log.push("shout")
        ctx.logger.info("SHOUTING!")
        return { message: "HELLO" }
      },
    })

    const pipeline = new Pipeline({
      steps: [greet, shout],
      workflow: ["greet", "shout"],
    })

    const results = await pipeline.execute()

    expect(log).toEqual(["greet", "shout"])
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ name: "greet", status: "pass" })
    expect(results[1]).toMatchObject({ name: "shout", status: "pass" })
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0)
    expect(results[1].durationMs).toBeGreaterThanOrEqual(0)
  })

  test("handles step failure gracefully", async () => {
    const boom = defineStep({
      name: "boom",
      run: async () => {
        throw new Error("kaboom")
      },
    })

    const after = defineStep({
      name: "after",
      dependsOnSteps: ["boom"],
      run: async () => ({ ok: true }),
    })

    const pipeline = new Pipeline({
      steps: [boom, after],
      workflow: ["boom", "after"],
    })

    const results = await pipeline.execute()

    expect(results[0]).toMatchObject({ name: "boom", status: "fail", error: "kaboom" })
    expect(results[1]).toMatchObject({ name: "after", status: "skipped" })
  })
})
