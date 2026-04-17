import { describe, test, expect } from "bun:test"
import { ConfigValidationError, validateConfig } from "./validateConfig"

function expectConfigValidationError(fn: () => unknown): ConfigValidationError {
  try {
    fn()
  } catch (err) {
    if (err instanceof ConfigValidationError) return err
    throw new Error(
      `Expected ConfigValidationError, got ${err instanceof Error ? err.name : typeof err}`
    )
  }
  throw new Error("Expected ConfigValidationError, but no error was thrown")
}

describe("validateConfig", () => {
  test("returns a typed ZlConfig for a valid input", () => {
    const raw = {
      app: { name: "MyApp", bundleId: "com.example.app" },
      platforms: {
        ios: { steps: [{ name: "build", options: { scheme: "App" } }] },
      },
      workflows: { ci: ["build"] },
    }
    const config = validateConfig(raw)
    expect(config.app.name).toBe("MyApp")
    expect(config.app.bundleId).toBe("com.example.app")
    expect(config.platforms.ios?.steps[0]?.name).toBe("build")
    expect(config.workflows.ci).toEqual(["build"])
  })

  test("accepts a config with both top-level steps and per-platform steps", () => {
    const raw = {
      app: { name: "A", bundleId: "c.a" },
      platforms: {
        ios: { steps: [{ name: "ios-step", options: {} }] },
        android: { steps: [{ name: "android-step", options: {} }] },
      },
      steps: [{ name: "shared-step", options: { k: 1 } }],
      workflows: { ci: ["shared-step", "ios-step"] },
    }
    const config = validateConfig(raw)
    expect(config.steps?.[0]?.name).toBe("shared-step")
    expect(config.platforms.android?.steps[0]?.name).toBe("android-step")
  })

  test("accepts a config with empty platforms object", () => {
    const raw = {
      app: { name: "A", bundleId: "c.a" },
      platforms: {},
      workflows: {},
    }
    const config = validateConfig(raw)
    expect(config.platforms.ios).toBeUndefined()
    expect(config.platforms.android).toBeUndefined()
  })

  test("omits optional top-level steps when absent", () => {
    const raw = {
      app: { name: "A", bundleId: "c.a" },
      platforms: {},
      workflows: {},
    }
    const config = validateConfig(raw)
    expect(config.steps).toBeUndefined()
  })

  test("rejects non-object inputs", () => {
    const err = expectConfigValidationError(() => validateConfig(null))
    expect(err.issues).toHaveLength(1)
    expect(err.issues[0]).toBeString()
  })

  test("rejects primitives", () => {
    const err = expectConfigValidationError(() => validateConfig("not a config"))
    expect(err).toBeInstanceOf(ConfigValidationError)
  })

  test("rejects a config missing the 'app' field with a path that mentions 'app'", () => {
    const err = expectConfigValidationError(() =>
      validateConfig({ platforms: {}, workflows: {} })
    )
    expect(err.issues[0]).toContain("app")
  })

  test("rejects a config missing 'app.name' with a path that mentions 'name'", () => {
    const err = expectConfigValidationError(() =>
      validateConfig({
        app: { bundleId: "c.a" },
        platforms: {},
        workflows: {},
      })
    )
    // TreeFormatter renders nested paths like ["app"] > ["name"].
    expect(err.issues[0]).toContain("name")
  })

  test("rejects a config missing 'app.bundleId'", () => {
    const err = expectConfigValidationError(() =>
      validateConfig({ app: { name: "A" }, platforms: {}, workflows: {} })
    )
    expect(err.issues[0]).toContain("bundleId")
  })

  test("rejects a config where 'workflows' is missing", () => {
    const err = expectConfigValidationError(() =>
      validateConfig({ app: { name: "A", bundleId: "c.a" }, platforms: {} })
    )
    expect(err.issues[0]).toContain("workflows")
  })

  test("rejects a config where 'platforms' is missing", () => {
    const err = expectConfigValidationError(() =>
      validateConfig({ app: { name: "A", bundleId: "c.a" }, workflows: {} })
    )
    expect(err.issues[0]).toContain("platforms")
  })

  test("rejects a config where 'app.name' has the wrong type", () => {
    const err = expectConfigValidationError(() =>
      validateConfig({
        app: { name: 123, bundleId: "c.a" },
        platforms: {},
        workflows: {},
      })
    )
    expect(err.issues[0]).toContain("name")
    expect(err.issues[0]).toContain("string")
  })

  test("rejects a config with a nested wrong type inside platforms.ios.steps", () => {
    const err = expectConfigValidationError(() =>
      validateConfig({
        app: { name: "A", bundleId: "c.a" },
        platforms: { ios: { steps: [{ name: 42, options: {} }] } },
        workflows: {},
      })
    )
    // Tree should reference both the path (platforms/ios/steps/0/name)
    // and the type it expected.
    expect(err.issues[0]).toContain("name")
  })

  test("rejects a config where workflow value is not an array of strings", () => {
    const err = expectConfigValidationError(() =>
      validateConfig({
        app: { name: "A", bundleId: "c.a" },
        platforms: {},
        workflows: { ci: [1, 2, 3] },
      })
    )
    expect(err.issues[0]).toContain("workflows")
  })

  test("ConfigValidationError exposes an 'issues' array and joins it into the message", () => {
    const err = expectConfigValidationError(() => validateConfig(null))
    expect(Array.isArray(err.issues)).toBe(true)
    expect(err.message.startsWith("Invalid config:")).toBe(true)
  })

  test("ConfigValidationError is a subclass of Error with the right name", () => {
    const err = expectConfigValidationError(() => validateConfig(null))
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("ConfigValidationError")
  })

  test("renders nested errors with tree-structured paths (TreeFormatter)", () => {
    const err = expectConfigValidationError(() =>
      validateConfig({
        app: { name: "A", bundleId: "c.a" },
        platforms: { ios: { steps: [{ name: 42, options: {} }] } },
        workflows: {},
      })
    )
    const tree = err.issues[0]!
    // TreeFormatter uses box-drawing characters to render the parse issue
    // path; we rely on that visual shape in CLI output so a regression
    // here would degrade error legibility.
    expect(tree).toContain("└─")
    expect(tree).toContain("[\"platforms\"]")
    expect(tree).toContain("[\"ios\"]")
    expect(tree).toContain("[\"steps\"]")
    expect(tree).toContain("[\"name\"]")
  })
})
