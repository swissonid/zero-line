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
  test("accepts an optionsSchema and stores it on the plugin", () => {
    const schema: OptionsSchema<{ count: number }> = {
      decode: (raw) => {
        const r = raw as Record<string, unknown>
        if (typeof r.count !== "number") throw new Error("count must be a number")
        return { count: r.count }
      },
    }
    const step = defineEffectStep({
      name: "count-effect",
      optionsSchema: schema,
      run: (_opts) => Effect.succeed({ done: true }),
    })
    expect(step.optionsSchema).toBe(schema)
  })

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

describe("step requirements", () => {
  test("defineStep accepts static requiredSecrets array", () => {
    const step = defineStep({
      name: "sign-ios",
      requiredSecrets: ["APPLE_API_KEY", "APPLE_ISSUER_ID"],
      run: async () => ({}),
    })
    expect(step.requiredSecrets).toEqual(["APPLE_API_KEY", "APPLE_ISSUER_ID"])
  })

  test("defineStep accepts dynamic requiredSecrets function", () => {
    const step = defineStep<{ teamId: string }>({
      name: "sign-ios",
      requiredSecrets: (opts) => [`APPLE_API_KEY_${opts.teamId}`],
      run: async () => ({}),
    })
    expect(typeof step.requiredSecrets).toBe("function")
    const fn = step.requiredSecrets as (o: Record<string, unknown>) => ReadonlyArray<string>
    expect(fn({ teamId: "XYZ" })).toEqual(["APPLE_API_KEY_XYZ"])
  })

  test("defineStep accepts requiredToolchains and requiredEnv", () => {
    const step = defineStep({
      name: "build-ios",
      requiredToolchains: ["xcode"],
      requiredEnv: ["CI"],
      run: async () => ({}),
    })
    expect(step.requiredToolchains).toEqual(["xcode"])
    expect(step.requiredEnv).toEqual(["CI"])
  })

  test("defineEffectStep accepts static requiredSecrets array", () => {
    const step = defineEffectStep({
      name: "sign-ios-effect",
      requiredSecrets: ["APPLE_API_KEY"],
      run: () => Effect.succeed({}),
    })
    expect(step.requiredSecrets).toEqual(["APPLE_API_KEY"])
  })

  test("defineEffectStep accepts dynamic requiredSecrets function", () => {
    const step = defineEffectStep<{ teamId: string }>({
      name: "sign-ios-effect",
      requiredSecrets: (opts) => [`APPLE_API_KEY_${opts.teamId}`],
      run: () => Effect.succeed({}),
    })
    expect(typeof step.requiredSecrets).toBe("function")
    const fn = step.requiredSecrets as (o: Record<string, unknown>) => ReadonlyArray<string>
    expect(fn({ teamId: "ABC" })).toEqual(["APPLE_API_KEY_ABC"])
  })

  test("defineEffectStep accepts requiredToolchains and requiredEnv", () => {
    const step = defineEffectStep({
      name: "build-ios-effect",
      requiredToolchains: ["xcode"],
      requiredEnv: ["CI"],
      run: () => Effect.succeed({}),
    })
    expect(step.requiredToolchains).toEqual(["xcode"])
    expect(step.requiredEnv).toEqual(["CI"])
  })

  test("defineStep omits requirement fields when not provided", () => {
    const step = defineStep({
      name: "bare",
      run: async () => ({}),
    })
    expect(step.requiredSecrets).toBeUndefined()
    expect(step.requiredToolchains).toBeUndefined()
    expect(step.requiredEnv).toBeUndefined()
  })

  test("defineEffectStep omits requirement fields when not provided", () => {
    const step = defineEffectStep({
      name: "bare-effect",
      run: () => Effect.succeed({}),
    })
    expect(step.requiredSecrets).toBeUndefined()
    expect(step.requiredToolchains).toBeUndefined()
    expect(step.requiredEnv).toBeUndefined()
  })
})
