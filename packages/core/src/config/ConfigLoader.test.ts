import { describe, test, expect } from "bun:test"
import { loadConfig, ConfigFileNotFoundError } from "./ConfigLoader"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"

describe("loadConfig", () => {
  test("loads and validates a zl.config.ts file", async () => {
    const tmpDir = join(import.meta.dir, "__test_tmp_valid__")
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, "zl.config.ts"),
      `export default {
        app: { name: "TestApp", bundleId: "com.test.app" },
        platforms: {
          ios: { steps: [] },
        },
        workflows: { ci: ["test"] },
      }`
    )

    const config = await loadConfig(tmpDir)

    expect(config.app.name).toBe("TestApp")
    expect(config.workflows.ci).toEqual(["test"])

    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("throws ConfigFileNotFoundError for missing config", async () => {
    expect(loadConfig("/nonexistent/path")).rejects.toThrow(ConfigFileNotFoundError)
  })

  test("throws on invalid config (missing app)", async () => {
    const tmpDir = join(import.meta.dir, "__test_tmp_invalid__")
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, "zl.config.ts"),
      `export default { workflows: {} }`
    )

    expect(loadConfig(tmpDir)).rejects.toThrow(/app/)

    rmSync(tmpDir, { recursive: true, force: true })
  })
})
