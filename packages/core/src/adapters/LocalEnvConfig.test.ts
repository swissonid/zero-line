import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { ConfigService } from "../ports/ConfigService"
import { LocalEnvConfigLive } from "./LocalEnvConfig"

const run = <A, E>(eff: Effect.Effect<A, E, ConfigService>) =>
  Effect.runPromiseExit(Effect.provide(eff, LocalEnvConfigLive))

describe("LocalEnvConfigLive", () => {
  test("env reads process.env", async () => {
    process.env.__ZL_ENV_TEST__ = "v"
    const exit = await run(
      Effect.gen(function* () {
        const c = yield* ConfigService
        return yield* c.env("__ZL_ENV_TEST__")
      })
    )
    expect(exit._tag).toBe("Success")
    if (exit._tag === "Success") expect(exit.value).toBe("v")
    delete process.env.__ZL_ENV_TEST__
  })

  test("env returns undefined when the key is missing", async () => {
    delete process.env.__ZL_ENV_ABSENT__
    const exit = await run(
      Effect.gen(function* () {
        const c = yield* ConfigService
        return yield* c.env("__ZL_ENV_ABSENT__")
      })
    )
    expect(exit._tag).toBe("Success")
    if (exit._tag === "Success") expect(exit.value).toBeUndefined()
  })

  test("secret returns env value when present", async () => {
    process.env.__ZL_SECRET_PRESENT__ = "shh"
    const exit = await run(
      Effect.gen(function* () {
        const c = yield* ConfigService
        return yield* c.secret("__ZL_SECRET_PRESENT__")
      })
    )
    expect(exit._tag).toBe("Success")
    if (exit._tag === "Success") expect(exit.value).toBe("shh")
    delete process.env.__ZL_SECRET_PRESENT__
  })

  test("secret fails with SecretNotFoundError when absent", async () => {
    delete process.env.__ZL_SECRET_ABSENT__
    const exit = await run(
      Effect.gen(function* () {
        const c = yield* ConfigService
        return yield* c.secret("__ZL_SECRET_ABSENT__")
      })
    )
    expect(exit._tag).toBe("Failure")
    expect(JSON.stringify(exit)).toContain("SecretNotFoundError")
    expect(JSON.stringify(exit)).toContain("__ZL_SECRET_ABSENT__")
  })

  test("load fails with descriptive ConfigLoadError directing to makeFileConfigLayer", async () => {
    const exit = await run(
      Effect.gen(function* () {
        const c = yield* ConfigService
        return yield* c.load()
      })
    )
    expect(exit._tag).toBe("Failure")
    expect(JSON.stringify(exit)).toContain("ConfigLoadError")
    expect(JSON.stringify(exit)).toContain("makeFileConfigLayer")
  })
})
