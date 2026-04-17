import { describe, test, expect } from "bun:test"
import { defineStep } from "../step-loader/StepContract"
import { buildSubcommandRegistry } from "./SubcommandRegistry"
import type { PluginStep, ResolvedStep } from "../step-loader/StepContract"

const toResolved = (plugin: PluginStep): ResolvedStep => ({
  plugin,
  name: plugin.name,
  dependsOnSteps: plugin.dependsOnSteps,
  options: {},
})

describe("buildSubcommandRegistry", () => {
  test("flattens step subcommands into a 'step:sub' keyed map", async () => {
    const a = defineStep({
      name: "sign-ios",
      subcommands: {
        init: async () => 0,
        doctor: async () => 42,
      },
      run: async () => ({}),
    })
    const b = defineStep({
      name: "build-ios",
      subcommands: { clean: async () => 7 },
      run: async () => ({}),
    })

    const registry = buildSubcommandRegistry([toResolved(a), toResolved(b)])
    expect(await registry.get("sign-ios:init")!([])).toBe(0)
    expect(await registry.get("sign-ios:doctor")!([])).toBe(42)
    expect(await registry.get("build-ios:clean")!([])).toBe(7)
    expect(registry.get("sign-ios:unknown")).toBeUndefined()
  })

  test("lists all keys from multiple steps", () => {
    const a = defineStep({
      name: "x",
      subcommands: { one: async () => 0, two: async () => 0 },
      run: async () => ({}),
    })
    const b = defineStep({
      name: "y",
      subcommands: { three: async () => 0 },
      run: async () => ({}),
    })
    const registry = buildSubcommandRegistry([toResolved(a), toResolved(b)])
    expect(Array.from(registry.keys()).sort()).toEqual(["x:one", "x:two", "y:three"])
  })

  test("skips steps with no subcommands", () => {
    const withSubs = defineStep({
      name: "sign",
      subcommands: { init: async () => 0 },
      run: async () => ({}),
    })
    const withoutSubs = defineStep({
      name: "build",
      run: async () => ({}),
    })
    const registry = buildSubcommandRegistry([toResolved(withSubs), toResolved(withoutSubs)])
    expect(Array.from(registry.keys())).toEqual(["sign:init"])
  })

  test("returns an empty map for no steps", () => {
    const registry = buildSubcommandRegistry([])
    expect(registry.size).toBe(0)
  })

  test("preserves step.name when it contains dashes or other colon-safe chars", async () => {
    const a = defineStep({
      name: "sign-ios",
      subcommands: { "doctor-v2": async () => 99 },
      run: async () => ({}),
    })
    const registry = buildSubcommandRegistry([toResolved(a)])
    expect(registry.has("sign-ios:doctor-v2")).toBe(true)
    expect(await registry.get("sign-ios:doctor-v2")!([])).toBe(99)
  })

  test("forwards argv to the handler", async () => {
    let received: ReadonlyArray<string> | undefined
    const a = defineStep({
      name: "x",
      subcommands: {
        echo: async (argv) => {
          received = argv
          return 0
        },
      },
      run: async () => ({}),
    })
    const registry = buildSubcommandRegistry([toResolved(a)])
    await registry.get("x:echo")!(["--flag", "value"])
    expect(received).toEqual(["--flag", "value"])
  })
})
