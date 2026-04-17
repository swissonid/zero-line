import { Effect, Layer } from "effect"
import { LoggerService } from "../ports/LoggerService"

export const ConsoleLoggerLive = Layer.succeed(LoggerService, {
  info: (msg: string) => Effect.logInfo(msg),
  warn: (msg: string) => Effect.logWarning(msg),
  error: (msg: string) => Effect.logError(msg),
  debug: (msg: string) => Effect.logDebug(msg),
})
