import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { PlatformService } from "../ports/PlatformService"
import { LocalPlatformLive } from "./LocalPlatform"

describe("LocalPlatform", () => {
  test("os returns the current platform", async () => {
    const program = Effect.gen(function* () {
      const platform = yield* PlatformService
      return yield* platform.os()
    })

    const result = await Effect.runPromise(Effect.provide(program, LocalPlatformLive))
    expect(["darwin", "linux", "win32"]).toContain(result)
  })

  test("availableToolchains returns an array", async () => {
    const program = Effect.gen(function* () {
      const platform = yield* PlatformService
      return yield* platform.availableToolchains()
    })

    const result = await Effect.runPromise(Effect.provide(program, LocalPlatformLive))
    expect(Array.isArray(result)).toBe(true)
  })
})
