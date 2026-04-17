import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { defineStep, defineEffectStep } from "./StepContract"
import type { OptionsSchema } from "./StepContract"
import { LoggerService } from "../ports/LoggerService"

describe("defineStep", () => {
  test("accepts an optionsSchema and stores it on the plugin", () => {
    const schema: OptionsSchema<{ name: string }> = {
      decode: (raw) => {
        const r = raw as Record<string, unknown>
        if (typeof r.name !== "string") throw new Error("name must be a string")
        return { name: r.name }
      },
    }
    const step = defineStep({
      name: "greet",
      optionsSchema: schema,
      run: async (opts) => ({ greeted: opts.name }),
    })
    expect(step.optionsSchema).toBe(schema)
  })

  test("creates a valid step from async function", () => {
    const step = defineStep({
      name: "greet",
      run: async (_opts, _ctx) => {
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
      run: async (_opts, _ctx) => {
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
      run: (_opts: Record<string, unknown>) =>
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
