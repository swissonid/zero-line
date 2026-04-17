import { describe, test, expect } from "bun:test"
import { defineStep } from "./StepContract"
import { gatherRequirements } from "./StepRequirements"
import type { ResolvedStep } from "./StepContract"

const toResolved = (
  plugin: ReturnType<typeof defineStep>,
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
})
