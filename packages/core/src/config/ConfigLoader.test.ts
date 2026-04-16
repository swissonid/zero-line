import { describe, test, expect } from "bun:test"
import { loadConfig, ConfigFileNotFoundError } from "./ConfigLoader"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"

function withTmpProject(name: string, configSource: string): string {
  const dir = join(import.meta.dir, `__test_tmp_${name}__`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "zl.config.ts"), configSource)
  return dir
}

describe("loadConfig", () => {
  test("loads and validates a zl.config.ts file", async () => {
    const dir = withTmpProject(
      "valid",
      `export default {
        app: { name: "TestApp", bundleId: "com.test.app" },
        platforms: {
          ios: { steps: [] },
        },
        workflows: { ci: ["test"] },
      }`
    )
    try {
      const config = await loadConfig(dir)
      expect(config.app.name).toBe("TestApp")
      expect(config.workflows.ci).toEqual(["test"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("throws ConfigFileNotFoundError for missing config", async () => {
    expect(loadConfig("/nonexistent/path")).rejects.toThrow(ConfigFileNotFoundError)
  })

  test("throws on invalid config (missing app)", async () => {
    const dir = withTmpProject("invalid", `export default { workflows: {} }`)
    try {
      await expect(loadConfig(dir)).rejects.toThrow(/app/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("throws on invalid config (missing platforms)", async () => {
    const dir = withTmpProject(
      "no-platforms",
      `export default {
        app: { name: "T", bundleId: "c.t" },
        workflows: { ci: ["hello"] },
      }`
    )
    try {
      await expect(loadConfig(dir)).rejects.toThrow(/platforms/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("surfaces import errors instead of masking them as not-found", async () => {
    const dir = withTmpProject(
      "syntax",
      `export default { app: { name: "X", bundleId: "x" }, workflows: {} `
    )
    try {
      await expect(loadConfig(dir)).rejects.not.toThrow(ConfigFileNotFoundError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
