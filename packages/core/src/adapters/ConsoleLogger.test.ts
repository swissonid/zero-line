import { describe, test, expect } from "bun:test"
import { Effect, Layer, Logger, LogLevel } from "effect"
import { LoggerService } from "../ports/LoggerService"
import { ConsoleLoggerLive } from "./ConsoleLogger"

/**
 * Build a layer that:
 *  - replaces Effect's default logger with a capturing one (so tests don't
 *    depend on whether the default logger writes to stdout vs stderr, or on
 *    its exact format),
 *  - sets the minimum log level to Debug so `Effect.logDebug` isn't filtered,
 *  - provides `ConsoleLoggerLive` on top.
 *
 * The captured messages include the level and the rendered message payload
 * (e.g. `INFO: hello world`).
 */
function makeCapturingLayer(messages: string[]) {
  const testLogger = Logger.make(({ logLevel, message }) => {
    const payload = Array.isArray(message) ? message.join(" ") : String(message)
    messages.push(`${logLevel.label}: ${payload}`)
  })

  return Layer.provideMerge(
    ConsoleLoggerLive,
    Layer.mergeAll(Logger.replace(Logger.defaultLogger, testLogger), Logger.minimumLogLevel(LogLevel.Debug)),
  )
}

describe("ConsoleLogger", () => {
  test("info delegates to Effect.logInfo", () => {
    const messages: string[] = []

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.info("hello world")
    })

    Effect.runSync(Effect.provide(program, makeCapturingLayer(messages)))

    expect(messages.some((m) => m.includes("INFO") && m.includes("hello world"))).toBe(true)
  })

  test("warn delegates to Effect.logWarning", () => {
    const messages: string[] = []

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.warn("careful")
    })

    Effect.runSync(Effect.provide(program, makeCapturingLayer(messages)))

    expect(messages.some((m) => m.includes("WARN") && m.includes("careful"))).toBe(true)
  })

  test("error delegates to Effect.logError", () => {
    const messages: string[] = []

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.error("something broke")
    })

    Effect.runSync(Effect.provide(program, makeCapturingLayer(messages)))

    expect(messages.some((m) => m.includes("ERROR") && m.includes("something broke"))).toBe(true)
  })

  test("debug delegates to Effect.logDebug", () => {
    const messages: string[] = []

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.debug("noise")
    })

    Effect.runSync(Effect.provide(program, makeCapturingLayer(messages)))

    expect(messages.some((m) => m.includes("DEBUG") && m.includes("noise"))).toBe(true)
  })

  test("Effect.log from arbitrary code composes through the same logger", () => {
    // This is the whole point of delegating: calls to Effect.logInfo (or any
    // plugin using Effect.log) should flow through the same fibre-level logger
    // as `ctx.logger.info(...)`.
    const messages: string[] = []

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.info("via adapter")
      yield* Effect.logInfo("via Effect directly")
    })

    Effect.runSync(Effect.provide(program, makeCapturingLayer(messages)))

    expect(messages.some((m) => m.includes("via adapter"))).toBe(true)
    expect(messages.some((m) => m.includes("via Effect directly"))).toBe(true)
  })
})
