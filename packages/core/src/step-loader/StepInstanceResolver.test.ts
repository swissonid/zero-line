import { describe, test, expect } from "bun:test"
import { Cause, Effect, Exit, Option } from "effect"
import { defineStep } from "./StepContract"
import { resolveStepInstances } from "./StepInstanceResolver"
import { StepError } from "../engine/StepError"
import type { StepInstance } from "../config/ConfigTypes"

// Unwrap the first typed failure out of an Exit and assert it is a StepError.
function expectStepError(exit: Exit.Exit<unknown, unknown>): StepError {
  if (!Exit.isFailure(exit)) throw new Error("expected Exit.Failure")
  const maybe = Cause.failureOption(exit.cause)
  if (Option.isNone(maybe)) throw new Error("expected typed failure, got defect")
  const err = maybe.value
  expect(err).toBeInstanceOf(StepError)
  return err as StepError
}

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
    const resolved = await Effect.runPromise(resolveStepInstances(instances, loader))
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
    const exit = await Effect.runPromiseExit(resolveStepInstances(instances, loader))
    const err = expectStepError(exit)
    expect(err.code).toBe("STEP_NOT_FOUND")
    expect(err.message).toContain("missing")
  })

  test("fails with INVALID_PLUGIN when the loaded export is not a valid plugin", async () => {
    const loader = async (_name: string) => ({ nope: true } as any)
    const instances: ReadonlyArray<StepInstance> = [{ name: "broken", options: {} }]
    const exit = await Effect.runPromiseExit(resolveStepInstances(instances, loader))
    const err = expectStepError(exit)
    expect(err.code).toBe("INVALID_PLUGIN")
  })

  test("preserves the workflow-bound instance name even when it differs from plugin.name", async () => {
    // Plugin identifies itself as "hello"; workflow references it as "@org/hello-plugin".
    const loader = async (_name: string) => hello
    const instances: ReadonlyArray<StepInstance> = [
      { name: "@org/hello-plugin", options: { who: "aliased" } },
    ]
    const resolved = await Effect.runPromise(resolveStepInstances(instances, loader))
    expect(resolved[0].name).toBe("@org/hello-plugin")
    expect(resolved[0].plugin.name).toBe("hello")
  })
})
