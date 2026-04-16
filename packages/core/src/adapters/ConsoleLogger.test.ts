import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { LoggerService } from "../ports/LoggerService"
import { ConsoleLoggerLive } from "./ConsoleLogger"

describe("ConsoleLogger", () => {
  test("info writes to stdout", () => {
    const messages: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => messages.push(String(args[0]))

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.info("hello world")
    })

    Effect.runSync(Effect.provide(program, ConsoleLoggerLive))
    console.log = originalLog

    expect(messages.some((m) => m.includes("hello world"))).toBe(true)
  })

  test("error writes with ERROR prefix", () => {
    const messages: string[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => messages.push(String(args[0]))

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.error("something broke")
    })

    Effect.runSync(Effect.provide(program, ConsoleLoggerLive))
    console.error = originalError

    expect(messages.some((m) => m.includes("something broke"))).toBe(true)
  })

  test("warn writes with WARN prefix", () => {
    const messages: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => messages.push(String(args[0]))

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.warn("careful")
    })

    Effect.runSync(Effect.provide(program, ConsoleLoggerLive))
    console.warn = originalWarn

    expect(messages.some((m) => m.includes("careful"))).toBe(true)
  })

  test("debug writes with DEBUG prefix", () => {
    const messages: string[] = []
    const originalDebug = console.debug
    console.debug = (...args: unknown[]) => messages.push(String(args[0]))

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.debug("noise")
    })

    Effect.runSync(Effect.provide(program, ConsoleLoggerLive))
    console.debug = originalDebug

    expect(messages.some((m) => m.includes("noise"))).toBe(true)
  })
})
