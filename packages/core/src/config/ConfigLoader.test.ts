import { describe, test, expect } from "bun:test"
import { Schema } from "effect"
import { loadConfig, ConfigFileNotFoundError, ConfigValidationError } from "./ConfigLoader"
import { defineStep } from "../step-loader/StepContract"
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

  test("rejects a StepInstance whose options fail the plugin's optionsSchema", async () => {
    const good = defineStep({
      name: "build-ios",
      optionsSchema: { decode: Schema.decodeUnknownSync(Schema.Struct({ scheme: Schema.String })) },
      run: async () => ({}),
    })
    const dir = withTmpProject(
      "opt-invalid",
      `export default {
        app: { name: "T", bundleId: "c.t" },
        platforms: { ios: { steps: [{ name: "build-ios", options: { scheme: 42 } }] } },
        workflows: { ci: ["build-ios"] },
      }`
    )
    try {
      await expect(
        loadConfig(dir, {
          loader: async (n) => (n === "build-ios" ? good : null),
        })
      ).rejects.toThrow(/scheme/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("throws ConfigValidationError (not a bare Error) when step options are invalid", async () => {
    const good = defineStep({
      name: "build-ios",
      optionsSchema: {
        decode: (raw) => {
          const r = raw as Record<string, unknown>
          if (typeof r.scheme !== "string") throw new Error("scheme must be a string")
          return r
        },
      },
      run: async () => ({}),
    })
    const dir = withTmpProject(
      "opt-invalid-class",
      `export default {
        app: { name: "T", bundleId: "c.t" },
        platforms: { ios: { steps: [{ name: "build-ios", options: { scheme: 42 } }] } },
        workflows: { ci: ["build-ios"] },
      }`
    )
    try {
      await expect(
        loadConfig(dir, {
          loader: async (n) => (n === "build-ios" ? good : null),
        })
      ).rejects.toBeInstanceOf(ConfigValidationError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("loads cleanly when a loader is provided and all step options are valid", async () => {
    const good = defineStep({
      name: "build-ios",
      optionsSchema: {
        decode: (raw) => {
          const r = raw as Record<string, unknown>
          if (typeof r.scheme !== "string") throw new Error("scheme must be a string")
          return r
        },
      },
      run: async () => ({}),
    })
    const dir = withTmpProject(
      "opt-valid-loader",
      `export default {
        app: { name: "T", bundleId: "c.t" },
        platforms: { ios: { steps: [{ name: "build-ios", options: { scheme: "App" } }] } },
        workflows: { ci: ["build-ios"] },
      }`
    )
    try {
      const config = await loadConfig(dir, {
        loader: async (n) => (n === "build-ios" ? good : null),
      })
      expect(config.app.name).toBe("T")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("skips optionsSchema validation when the loader returns null for a step", async () => {
    const dir = withTmpProject(
      "opt-unknown-step",
      `export default {
        app: { name: "T", bundleId: "c.t" },
        platforms: { ios: { steps: [{ name: "unknown-step", options: { anything: 1 } }] } },
        workflows: { ci: ["unknown-step"] },
      }`
    )
    try {
      // Loader returns null → no schema to validate against, config loads fine.
      const config = await loadConfig(dir, { loader: async () => null })
      expect(config.platforms.ios?.steps[0]?.name).toBe("unknown-step")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("skips optionsSchema validation when the resolved plugin has no optionsSchema", async () => {
    const good = defineStep({
      name: "no-schema",
      run: async () => ({}),
    })
    const dir = withTmpProject(
      "opt-no-schema",
      `export default {
        app: { name: "T", bundleId: "c.t" },
        platforms: { ios: { steps: [{ name: "no-schema", options: { anything: 1 } }] } },
        workflows: { ci: ["no-schema"] },
      }`
    )
    try {
      const config = await loadConfig(dir, {
        loader: async (n) => (n === "no-schema" ? good : null),
      })
      expect(config.platforms.ios?.steps[0]?.name).toBe("no-schema")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("validates optionsSchema for top-level steps (not just per-platform)", async () => {
    const good = defineStep({
      name: "top-level",
      optionsSchema: {
        decode: (raw) => {
          const r = raw as Record<string, unknown>
          if (typeof r.scheme !== "string") throw new Error("scheme must be a string")
          return r
        },
      },
      run: async () => ({}),
    })
    const dir = withTmpProject(
      "opt-top-level",
      `export default {
        app: { name: "T", bundleId: "c.t" },
        platforms: { ios: { steps: [] } },
        steps: [{ name: "top-level", options: { scheme: 42 } }],
        workflows: { ci: ["top-level"] },
      }`
    )
    try {
      await expect(
        loadConfig(dir, {
          loader: async (n) => (n === "top-level" ? good : null),
        })
      ).rejects.toThrow(/scheme/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("remains backwards-compatible when no loader is provided", async () => {
    const dir = withTmpProject(
      "no-loader",
      `export default {
        app: { name: "T", bundleId: "c.t" },
        platforms: { ios: { steps: [{ name: "anything", options: { junk: true } }] } },
        workflows: { ci: ["anything"] },
      }`
    )
    try {
      const config = await loadConfig(dir)
      expect(config.app.name).toBe("T")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
