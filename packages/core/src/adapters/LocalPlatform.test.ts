import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { PlatformService } from "../ports/PlatformService"
import { LocalPlatformLive, platformSupports, detectToolchains } from "./LocalPlatform"

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

  test("supports resolves via the layer", async () => {
    const program = Effect.gen(function* () {
      const platform = yield* PlatformService
      return yield* platform.supports("android")
    })
    const result = await Effect.runPromise(Effect.provide(program, LocalPlatformLive))
    expect(result).toBe(true)
  })

  test("platformSupports covers ios, android, and unknown", () => {
    expect(platformSupports("ios")).toBe(process.platform === "darwin")
    expect(platformSupports("android")).toBe(true)
    expect(platformSupports("windows-phone")).toBe(false)
  })

  test("detectToolchains returns a Toolchain array", () => {
    const result = detectToolchains()
    expect(Array.isArray(result)).toBe(true)
  })
})
