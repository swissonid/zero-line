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

  test("warns when dependsOnSteps points outside the current workflow", () => {
    const steps = [
      { name: "upload", dependsOnSteps: ["sign"] },
      { name: "sign", dependsOnSteps: [] },
    ]
    const warnings: string[] = []

    const order = buildExecutionOrder(steps, ["upload"], (m) => warnings.push(m))

    expect(order).toEqual(["upload"])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("upload")
    expect(warnings[0]).toContain("sign")
    expect(warnings[0]).toContain("not in the current workflow")
  })

  test("default onWarn routes to console.warn", () => {
    const steps = [
      { name: "upload", dependsOnSteps: ["sign"] },
      { name: "sign", dependsOnSteps: [] },
    ]
    const original = console.warn
    const logged: string[] = []
    console.warn = (m: string) => logged.push(String(m))
    try {
      buildExecutionOrder(steps, ["upload"])
    } finally {
      console.warn = original
    }
    expect(logged).toHaveLength(1)
    expect(logged[0]).toContain("not in the current workflow")
  })
})
