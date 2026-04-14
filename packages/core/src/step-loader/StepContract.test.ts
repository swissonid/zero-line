import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { defineStep, defineEffectStep } from "./StepContract"
import { LoggerService } from "../ports/LoggerService"

describe("defineStep", () => {
  test("creates a valid step from async function", () => {
    const step = defineStep({
      name: "greet",
      run: async (opts, ctx) => {
        return { message: "hello" }
      },
    })

    expect(step.name).toBe("greet")
    expect(step.dependsOnSteps).toEqual([])
    expect(step._tag).toBe("simple")
  })

  test("preserves dependsOnSteps", () => {
    const step = defineStep({
      name: "build",
      dependsOnSteps: ["sign"],
      run: async (opts, ctx) => {
        return {}
      },
    })

    expect(step.dependsOnSteps).toEqual(["sign"])
  })

  test("run function executes correctly", async () => {
    const step = defineStep({
      name: "greet",
      run: async (opts: { name: string }, _ctx) => {
        return { greeting: `hello ${opts.name}` }
      },
    })

    const result = await step.execute({ name: "world" }, {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      config: { env: () => undefined, secret: () => undefined },
      platform: { os: () => "darwin", availableToolchains: () => [], supports: () => true },
      artifacts: { put: () => {}, get: () => undefined, list: () => [] },
    } as any)

    expect(result).toEqual({ greeting: "hello world" })
  })
})

describe("defineEffectStep", () => {
  test("creates a valid step from Effect layer", () => {
    const step = defineEffectStep({
      name: "greet-effect",
      dependsOnSteps: ["sign"],
      run: (opts: Record<string, unknown>) =>
        Effect.gen(function* () {
          const logger = yield* LoggerService
          yield* logger.info("hello from effect step")
          return { message: "done" }
        }),
    })

    expect(step.name).toBe("greet-effect")
    expect(step.dependsOnSteps).toEqual(["sign"])
    expect(step._tag).toBe("effect")
  })
})
