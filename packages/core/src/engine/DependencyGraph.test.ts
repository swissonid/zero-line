import { describe, test, expect } from "bun:test"
import { buildExecutionOrder, CyclicDependencyError } from "./DependencyGraph"

describe("buildExecutionOrder", () => {
  test("returns steps in dependency order", () => {
    const steps = [
      { name: "deploy", dependsOnSteps: ["build"] },
      { name: "build", dependsOnSteps: ["sign"] },
      { name: "sign", dependsOnSteps: [] },
      { name: "test", dependsOnSteps: [] },
    ]

    const order = buildExecutionOrder(steps, ["test", "sign", "build", "deploy"])

    const signIdx = order.indexOf("sign")
    const buildIdx = order.indexOf("build")
    const deployIdx = order.indexOf("deploy")

    expect(signIdx).toBeLessThan(buildIdx)
    expect(buildIdx).toBeLessThan(deployIdx)
  })

  test("filters to only workflow steps", () => {
    const steps = [
      { name: "build", dependsOnSteps: [] },
      { name: "test", dependsOnSteps: [] },
      { name: "deploy", dependsOnSteps: [] },
    ]

    const order = buildExecutionOrder(steps, ["test", "build"])
    expect(order).toHaveLength(2)
    expect(order).toContain("test")
    expect(order).toContain("build")
    expect(order).not.toContain("deploy")
  })

  test("throws on cyclic dependency", () => {
    const steps = [
      { name: "a", dependsOnSteps: ["b"] },
      { name: "b", dependsOnSteps: ["a"] },
    ]

    expect(() => buildExecutionOrder(steps, ["a", "b"])).toThrow(CyclicDependencyError)
  })

  test("throws on missing step reference in workflow", () => {
    const steps = [{ name: "build", dependsOnSteps: [] }]

    expect(() => buildExecutionOrder(steps, ["build", "nonexistent"])).toThrow(/not found/)
  })
})
