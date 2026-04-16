import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { LoggerService } from "./LoggerService"

describe("LoggerService", () => {
  test("can be used in an Effect program", () => {
    const testLogger = Layer.succeed(LoggerService, {
      info: (_msg: string) => Effect.void,
      warn: (_msg: string) => Effect.void,
      error: (_msg: string) => Effect.void,
      debug: (_msg: string) => Effect.void,
    })

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.info("test message")
      return "ok"
    })

    const result = Effect.runSync(Effect.provide(program, testLogger))
    expect(result).toBe("ok")
  })
})
