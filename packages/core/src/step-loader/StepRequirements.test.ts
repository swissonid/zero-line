import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { defineStep, defineEffectStep } from "./StepContract"
import { gatherRequirements } from "./StepRequirements"
import type { PluginStep, ResolvedStep } from "./StepContract"

const toResolved = (
  plugin: PluginStep,
  options: Record<string, unknown> = {}
): ResolvedStep => ({
  plugin,
  name: plugin.name,
  dependsOnSteps: plugin.dependsOnSteps,
  options,
})

describe("gatherRequirements", () => {
  test("collects static requirements across multiple steps", () => {
    const s1 = defineStep({
      name: "a",
      requiredSecrets: ["KEY_A"],
      requiredToolchains: ["xcode"],
      run: async () => ({}),
    })
    const s2 = defineStep({
      name: "b",
      requiredSecrets: ["KEY_B"],
      requiredEnv: ["CI"],
      run: async () => ({}),
    })

    const reqs = gatherRequirements([toResolved(s1), toResolved(s2)])
    expect(reqs.secrets).toEqual([
      { stepName: "a", key: "KEY_A" },
      { stepName: "b", key: "KEY_B" },
    ])
    expect(reqs.toolchains).toEqual([{ stepName: "a", key: "xcode" }])
    expect(reqs.env).toEqual([{ stepName: "b", key: "CI" }])
  })

  test("evaluates function-valued requirements against bound options", () => {
    const step = defineStep<{ teamId: string }>({
      name: "sign",
      requiredSecrets: (opts) => [`APPLE_API_KEY_${opts.teamId}`],
      run: async () => ({}),
    })
    const resolved = toResolved(step, { teamId: "XYZ" })
    const reqs = gatherRequirements([resolved])
    expect(reqs.secrets).toEqual([{ stepName: "sign", key: "APPLE_API_KEY_XYZ" }])
  })

  test("returns empty lists for an empty pipeline", () => {
    expect(gatherRequirements([])).toEqual({
      secrets: [],
      toolchains: [],
      env: [],
    })
  })

  test("handles EffectPluginStep alongside SimplePluginStep", () => {
    const simple = defineStep({
      name: "build-ios",
      requiredSecrets: ["APPLE_API_KEY"],
      run: async () => ({}),
    })
    const effect = defineEffectStep({
      name: "build-android",
      requiredToolchains: ["gradle"],
      requiredEnv: ["ANDROID_HOME"],
      run: () => Effect.succeed({}),
    })
    const reqs = gatherRequirements([toResolved(simple), toResolved(effect)])
    expect(reqs.secrets).toEqual([{ stepName: "build-ios", key: "APPLE_API_KEY" }])
    expect(reqs.toolchains).toEqual([{ stepName: "build-android", key: "gradle" }])
    expect(reqs.env).toEqual([{ stepName: "build-android", key: "ANDROID_HOME" }])
  })
})
