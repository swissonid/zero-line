import { describe, test, expect } from "bun:test"
import { Effect, Exit } from "effect"
import { validateStepOptions } from "./validateStepOptions"
import { ConfigValidationError } from "./validateConfig"
import type { ZlConfig } from "./ConfigTypes"

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
    expect(Exit.isFailure(exit)).toBe(true)
    const json = JSON.stringify(exit)
    expect(json).toContain("top-level")
    expect(json).toContain("platform: ios")
    expect(json).toContain("build")
  })

  test("fails with a typed ConfigValidationError", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      platforms: { ios: { steps: [{ name: "build", options: { scheme: 42 } }] } },
    }
    const loader = async () => goodPlugin
    const exit = await Effect.runPromiseExit(validateStepOptions(config, loader))
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error("expected failure")
    const cause = exit.cause
    expect(JSON.stringify(cause)).toContain("ConfigValidationError")
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
    expect(Exit.isFailure(exit)).toBe(true)
    const json = JSON.stringify(exit)
    expect(json).toContain("Plugin loader failed for step 'explodes'")
    expect(json).toContain("boom")
  })
})
