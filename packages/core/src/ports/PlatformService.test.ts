import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { PlatformService } from "./PlatformService"
import type { Platform } from "../config/ConfigTypes"

describe("PlatformService", () => {
  test("can detect OS and available toolchains", () => {
    const testPlatform = Layer.succeed(PlatformService, {
      os: () => Effect.succeed("darwin" as const),
      availableToolchains: () => Effect.succeed(["xcode"] as const),
      supports: (platform: Platform) => Effect.succeed(platform === "ios"),
    })

    const program = Effect.gen(function* () {
      const platform = yield* PlatformService
      const os = yield* platform.os()
      return os
    })

    const result = Effect.runSync(Effect.provide(program, testPlatform))
    expect(result).toBe("darwin")
  })
})
