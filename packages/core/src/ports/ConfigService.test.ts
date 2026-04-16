import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ConfigService, ConfigLoadError, SecretNotFoundError } from "./ConfigService"
import type { ZlConfig } from "../config/ConfigTypes"

describe("ConfigService", () => {
  test("can load config and read values", () => {
    const mockConfig: ZlConfig = {
      app: { name: "TestApp", bundleId: "com.test.app" },
      platforms: {},
      workflows: { test: ["hello"] },
    }

    const testConfigLayer = Layer.succeed(ConfigService, {
      load: () => Effect.succeed(mockConfig),
      env: (key: string) => Effect.succeed(process.env[key]),
      secret: (key: string) => Effect.succeed(`secret-${key}`),
    })

    const program = Effect.gen(function* () {
      const config = yield* ConfigService
      const loaded = yield* config.load()
      return loaded.app.name
    })

    const result = Effect.runSync(Effect.provide(program, testConfigLayer))
    expect(result).toBe("TestApp")
  })

  test("ConfigLoadError carries a message and _tag", () => {
    const err = new ConfigLoadError("broken")
    expect(err.message).toBe("broken")
    expect(err._tag).toBe("ConfigLoadError")
  })

  test("SecretNotFoundError carries a key and _tag", () => {
    const err = new SecretNotFoundError("API_KEY")
    expect(err.key).toBe("API_KEY")
    expect(err._tag).toBe("SecretNotFoundError")
  })
})
