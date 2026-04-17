import { describe, test, expect } from "bun:test"
import { defineStep } from "./StepContract"
import { resolveStepInstances } from "./StepInstanceResolver"
import type { StepInstance } from "../config/ConfigTypes"

const hello = defineStep({
  name: "hello",
  run: async (opts: { who?: string }) => ({ greeted: opts.who ?? "world" }),
})

describe("resolveStepInstances", () => {
  test("returns ResolvedStep[] with bound options using an injected loader", async () => {
    const loader = async (name: string) => {
      if (name === "hello") return hello
      throw new Error(`not found: ${name}`)
    }

    const instances: ReadonlyArray<StepInstance> = [
      { name: "hello", options: { who: "zl" } },
    ]

    const resolved = await resolveStepInstances(instances, loader)

    expect(resolved).toHaveLength(1)
    expect(resolved[0].name).toBe("hello")
    expect(resolved[0].options).toEqual({ who: "zl" })
    expect(resolved[0].plugin).toBe(hello)
  })

  test("fails with STEP_NOT_FOUND StepError when loader rejects", async () => {
    const loader = async (_name: string): Promise<never> => {
      throw new Error("module not found")
    }
    const instances: ReadonlyArray<StepInstance> = [{ name: "missing", options: {} }]

    await expect(resolveStepInstances(instances, loader)).rejects.toMatchObject({
      _tag: "StepError",
      code: "STEP_NOT_FOUND",
    })
  })

  test("fails with INVALID_PLUGIN when the loaded export is not a valid plugin", async () => {
    const loader = async (_name: string) => ({ nope: true } as any)
    const instances: ReadonlyArray<StepInstance> = [{ name: "broken", options: {} }]

    await expect(resolveStepInstances(instances, loader)).rejects.toMatchObject({
      _tag: "StepError",
      code: "INVALID_PLUGIN",
    })
  })

  test("preserves the workflow-bound instance name even when it differs from plugin.name", async () => {
    // Plugin identifies itself as "hello"; workflow references it as "@org/hello-plugin".
    const loader = async (_name: string) => hello
    const instances: ReadonlyArray<StepInstance> = [
      { name: "@org/hello-plugin", options: { who: "aliased" } },
    ]

    const resolved = await resolveStepInstances(instances, loader)

    expect(resolved[0].name).toBe("@org/hello-plugin")
    expect(resolved[0].plugin.name).toBe("hello")
  })
})
