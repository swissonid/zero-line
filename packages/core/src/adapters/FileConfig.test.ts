import { describe, test, expect } from "bun:test"
import { Cause, Effect, Exit, Option } from "effect"
import { ConfigService, ConfigLoadError, SecretNotFoundError } from "../ports/ConfigService"
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

  test("load fails with ConfigLoadError when the config is malformed", async () => {
    const malformedDir = join(import.meta.dir, "__test_tmp_malformed__")
    mkdirSync(malformedDir, { recursive: true })
    writeFileSync(
      join(malformedDir, "zl.config.ts"),
      `export default { workflows: {}, platforms: {} }`
    )

    try {
      const layer = makeFileConfigLayer(malformedDir)
      const program = Effect.gen(function* () {
        const config = yield* ConfigService
        return yield* config.load()
      })

      const exit = await Effect.runPromise(Effect.exit(Effect.provide(program, layer)))
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        const cause = exit.cause
        const failures = Array.from(Cause.failures(cause))
        expect(failures.some(f => (f as { _tag?: string })._tag === "ConfigLoadError")).toBe(true)
        expect(failures.some(f => (f as { message?: string }).message?.includes("app"))).toBe(true)
      }
    } finally {
      rmSync(malformedDir, { recursive: true, force: true })
    }
  })

  test("load fails with ConfigLoadError when the config file is missing", async () => {
    const missingDir = join(import.meta.dir, "__does_not_exist__")
    const layer = makeFileConfigLayer(missingDir)

    const program = Effect.gen(function* () {
      const config = yield* ConfigService
      return yield* config.load()
    })

    const exit = await Effect.runPromise(Effect.exit(Effect.provide(program, layer)))
    expect(exit._tag).toBe("Failure")
  })

  test("secret reads from process.env when present", async () => {
    process.env.__ZL_SECRET_TEST__ = "shh"
    const layer = makeFileConfigLayer(".")

    const program = Effect.gen(function* () {
      const config = yield* ConfigService
      return yield* config.secret("__ZL_SECRET_TEST__")
    })

    const result = await Effect.runPromise(Effect.provide(program, layer))
    expect(result).toBe("shh")
    delete process.env.__ZL_SECRET_TEST__
  })

  test("secret fails with SecretNotFoundError when the key is missing", async () => {
    const layer = makeFileConfigLayer(".")

    const program = Effect.gen(function* () {
      const config = yield* ConfigService
      return yield* config.secret("__ZL_SECRET_ABSENT__")
    })

    const exit = await Effect.runPromise(Effect.exit(Effect.provide(program, layer)))
    expect(exit._tag).toBe("Failure")
    const failure = Cause.failureOption((exit as Exit.Failure<string, SecretNotFoundError>).cause)
    expect(Option.isSome(failure)).toBe(true)
    expect(Option.getOrThrow(failure)._tag).toBe("SecretNotFoundError")
    expect(Option.getOrThrow(failure).key).toBe("__ZL_SECRET_ABSENT__")
  })

  test("ConfigLoadError constructs with a message", () => {
    const err = new ConfigLoadError("boom")
    expect(err.message).toBe("boom")
    expect(err._tag).toBe("ConfigLoadError")
  })
})
