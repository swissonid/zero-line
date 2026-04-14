import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { ConfigService } from "../ports/ConfigService"
import { makeFileConfigLayer } from "./FileConfig"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"

describe("FileConfig", () => {
  const tmpDir = join(import.meta.dir, "__test_tmp__")

  test("loads zl.config.ts from a given directory", async () => {
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, "zl.config.ts"),
      `export default {
        app: { name: "TestApp", bundleId: "com.test.app" },
        platforms: {},
        workflows: { ci: ["hello"] },
      }`
    )

    const layer = makeFileConfigLayer(tmpDir)

    const program = Effect.gen(function* () {
      const config = yield* ConfigService
      const loaded = yield* config.load()
      return loaded.app.name
    })

    const result = await Effect.runPromise(Effect.provide(program, layer))
    expect(result).toBe("TestApp")

    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("env reads from process.env", async () => {
    process.env.__ZL_TEST_KEY__ = "test-value"

    const layer = makeFileConfigLayer(".")

    const program = Effect.gen(function* () {
      const config = yield* ConfigService
      return yield* config.env("__ZL_TEST_KEY__")
    })

    const result = await Effect.runPromise(Effect.provide(program, layer))
    expect(result).toBe("test-value")

    delete process.env.__ZL_TEST_KEY__
  })
})
