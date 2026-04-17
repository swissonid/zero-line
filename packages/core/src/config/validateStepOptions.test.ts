import { describe, test, expect } from "bun:test"
import { Cause, Effect, Exit, Option } from "effect"
import { validateStepOptions } from "./validateStepOptions"
import { ConfigValidationError } from "./validateConfig"
import type { ZlConfig } from "./ConfigTypes"

function expectValidationError(
  exit: Exit.Exit<unknown, unknown>
): ConfigValidationError {
  if (!Exit.isFailure(exit)) throw new Error("expected Exit.Failure")
  const maybe = Cause.failureOption(exit.cause)
  if (Option.isNone(maybe)) throw new Error("expected typed failure, got defect")
  const err = maybe.value
  expect(err).toBeInstanceOf(ConfigValidationError)
  return err as ConfigValidationError
}

const goodPlugin = {
  optionsSchema: {
    decode: (raw: unknown) => {
      const r = raw as Record<string, unknown>
      if (typeof r.scheme !== "string") throw new Error("scheme must be a string")
      return r
    },
  },
}

const baseConfig: ZlConfig = {
  app: { name: "T", bundleId: "c.t" },
  platforms: {},
  workflows: { ci: ["build"] },
}

describe("validateStepOptions", () => {
  test("succeeds when every plugin.decode accepts its instance.options", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      platforms: { ios: { steps: [{ name: "build", options: { scheme: "App" } }] } },
    }
    const loader = async () => goodPlugin
    await Effect.runPromise(validateStepOptions(config, loader))
  })

  test("fails with ConfigValidationError listing every invalid step", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      steps: [{ name: "build", options: { scheme: 1 } }],
      platforms: {
        ios: { steps: [{ name: "build", options: { scheme: 2 } }] },
      },
    }
    const loader = async () => goodPlugin
    const exit = await Effect.runPromiseExit(validateStepOptions(config, loader))
    const err = expectValidationError(exit)
    expect(err.issues).toHaveLength(2)
    expect(err.issues.some((i) => i.includes("top-level"))).toBe(true)
    expect(err.issues.some((i) => i.includes("platform: ios"))).toBe(true)
    expect(err.issues.every((i) => i.includes("build"))).toBe(true)
  })

  test("fails with a typed ConfigValidationError", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      platforms: { ios: { steps: [{ name: "build", options: { scheme: 42 } }] } },
    }
    const loader = async () => goodPlugin
    const exit = await Effect.runPromiseExit(validateStepOptions(config, loader))
    expectValidationError(exit)
  })

  test("skips steps whose loader returns null", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      platforms: { ios: { steps: [{ name: "unknown", options: { anything: 1 } }] } },
    }
    const loader = async () => null
    await Effect.runPromise(validateStepOptions(config, loader))
  })

  test("skips plugins with no optionsSchema", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      platforms: { ios: { steps: [{ name: "noop", options: { anything: 1 } }] } },
    }
    const loader = async () => ({})
    await Effect.runPromise(validateStepOptions(config, loader))
  })

  test("surfaces loader rejections as ConfigValidationError issues", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      platforms: {
        ios: { steps: [{ name: "explodes", options: {} }] },
      },
    }
    const loader = async () => {
      throw new Error("boom")
    }
    const exit = await Effect.runPromiseExit(validateStepOptions(config, loader))
    const err = expectValidationError(exit)
    expect(err.issues).toHaveLength(1)
    expect(err.issues[0]).toContain("Plugin loader failed for step 'explodes'")
    expect(err.issues[0]).toContain("boom")
  })
})
