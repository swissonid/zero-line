import { describe, test, expect } from "bun:test"
import helloStep from "./index"

describe("@zl/step-hello", () => {
  test("has correct name", () => {
    expect(helloStep.name).toBe("hello")
  })

  test("has no dependencies", () => {
    expect(helloStep.dependsOnSteps).toEqual([])
  })

  test("run returns a greeting", async () => {
    const ctx = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      config: { env: () => undefined, secret: () => undefined },
      platform: { os: () => "darwin", availableToolchains: () => [], supports: () => true },
      artifacts: { put: () => {}, get: () => undefined, list: () => [] },
    } as any

    const result = await helloStep.execute({ name: "world" }, ctx)
    expect(result).toEqual({ greeting: "Hello, world!" })
  })

  test("defaults name to 'zero-line'", async () => {
    const ctx = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      config: { env: () => undefined, secret: () => undefined },
      platform: { os: () => "darwin", availableToolchains: () => [], supports: () => true },
      artifacts: { put: () => {}, get: () => undefined, list: () => [] },
    } as any

    const result = await helloStep.execute({}, ctx)
    expect(result).toEqual({ greeting: "Hello, zero-line!" })
  })
})
