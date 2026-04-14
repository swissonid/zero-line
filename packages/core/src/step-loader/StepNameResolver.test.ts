import { describe, test, expect } from "bun:test"
import { resolveShortName, detectCollisions, type StepRegistration } from "./StepNameResolver"

describe("resolveShortName", () => {
  test("@zl/step-build resolves to short name 'build'", () => {
    expect(resolveShortName("@zl/step-build")).toBe("build")
  })

  test("@zl/step-build-ios resolves to 'build-ios'", () => {
    expect(resolveShortName("@zl/step-build-ios")).toBe("build-ios")
  })

  test("@acme/zl-step-screenshot resolves to 'acme/screenshot'", () => {
    expect(resolveShortName("@acme/zl-step-screenshot")).toBe("acme/screenshot")
  })

  test("plain name passes through", () => {
    expect(resolveShortName("hello")).toBe("hello")
  })
})

describe("detectCollisions", () => {
  test("no collision for unique names", () => {
    const steps: StepRegistration[] = [
      { packageName: "@zl/step-build", shortName: "build" },
      { packageName: "@zl/step-sign", shortName: "sign" },
    ]
    const result = detectCollisions(steps)
    expect(result).toEqual([])
  })

  test("detects collision when two steps share a short name", () => {
    const steps: StepRegistration[] = [
      { packageName: "@zl/step-build", shortName: "build" },
      { packageName: "@acme/zl-step-build", shortName: "build" },
    ]
    const result = detectCollisions(steps)
    expect(result.length).toBe(1)
    expect(result[0].shortName).toBe("build")
    expect(result[0].packages).toEqual(["@zl/step-build", "@acme/zl-step-build"])
  })

  test("@zl scoped steps take priority", () => {
    const steps: StepRegistration[] = [
      { packageName: "@zl/step-build", shortName: "build", isOfficial: true },
      { packageName: "@acme/zl-step-build", shortName: "build", isOfficial: false },
    ]
    const result = detectCollisions(steps)
    expect(result.length).toBe(1)
    expect(result[0].resolution).toBe(
      "Use 'build' for @zl/step-build (official) and 'acme/build' for @acme/zl-step-build"
    )
  })
})
