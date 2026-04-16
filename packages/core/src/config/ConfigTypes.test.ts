import { describe, test, expect } from "bun:test"
import { defineConfig } from "./ConfigTypes"

describe("defineConfig", () => {
  test("returns the config it was given", () => {
    const input = {
      app: { name: "TestApp", bundleId: "com.test" },
      platforms: {},
      workflows: { ci: ["hello"] },
    }
    expect(defineConfig(input)).toBe(input)
  })
})
