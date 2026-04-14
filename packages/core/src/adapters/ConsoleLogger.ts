import { Effect, Layer } from "effect"
import { LoggerService } from "../ports/LoggerService"

export const ConsoleLoggerLive = Layer.succeed(LoggerService, {
  info: (msg: string) => Effect.sync(() => console.log(`[INFO] ${msg}`)),
  warn: (msg: string) => Effect.sync(() => console.warn(`[WARN] ${msg}`)),
  error: (msg: string) => Effect.sync(() => console.error(`[ERROR] ${msg}`)),
  debug: (msg: string) => Effect.sync(() => console.debug(`[DEBUG] ${msg}`)),
})
