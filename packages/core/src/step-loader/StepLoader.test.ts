import { describe, test, expect } from "bun:test"
import { loadSteps, validateStep } from "./StepLoader"
import { defineStep } from "./StepContract"

describe("validateStep", () => {
  test("accepts a valid simple step", () => {
    const step = defineStep({
      name: "hello",
      run: async () => ({ message: "hi" }),
    })
    const result = validateStep(step)
    expect(result.valid).toBe(true)
  })

  test("rejects step without name", () => {
    const step = { _tag: "simple", dependsOnSteps: [], execute: async () => ({}) } as any
    const result = validateStep(step)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("name")
  })

  test("rejects step without run/execute", () => {
    const step = { _tag: "simple", name: "broken", dependsOnSteps: [] } as any
    const result = validateStep(step)
    expect(result.valid).toBe(false)
  })

  test("rejects step with unknown _tag", () => {
    const step = { _tag: "custom", name: "weird", execute: async () => ({}) } as any
    const result = validateStep(step)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("_tag")
  })

  test("rejects step without _tag", () => {
    const step = { name: "no-tag", execute: async () => ({}) } as any
    const result = validateStep(step)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("_tag")
  })

  test("rejects non-object values", () => {
    expect(validateStep(null).valid).toBe(false)
    expect(validateStep("not a step" as any).valid).toBe(false)
    expect(validateStep(42 as any).valid).toBe(false)
  })

  test("rejects an object with a non-string name", () => {
    const result = validateStep({ _tag: "simple", execute: async () => ({}) } as any)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("name")
  })

  test("rejects an effect step missing run", () => {
    const result = validateStep({ _tag: "effect", name: "broken" } as any)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("run")
  })
})

describe("loadSteps", () => {
  test("loads steps from an array of resolved steps", () => {
    const step1 = defineStep({ name: "hello", run: async () => ({}) })
    const step2 = defineStep({ name: "world", dependsOnSteps: ["hello"], run: async () => ({}) })

    const result = loadSteps([step1, step2])

    expect(result.steps.length).toBe(2)
    expect(result.errors.length).toBe(0)
    expect(result.steps[0].name).toBe("hello")
    expect(result.steps[1].name).toBe("world")
  })

  test("returns errors for invalid steps", () => {
    const valid = defineStep({ name: "hello", run: async () => ({}) })
    const invalid = { name: "" } as any

    const result = loadSteps([valid, invalid])

    expect(result.steps.length).toBe(1)
    expect(result.errors.length).toBe(1)
  })
})
