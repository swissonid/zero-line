import { Context, Effect } from "effect"

export interface ILoggerService {
  readonly info: (msg: string) => Effect.Effect<void>
  readonly warn: (msg: string) => Effect.Effect<void>
  readonly error: (msg: string) => Effect.Effect<void>
  readonly debug: (msg: string) => Effect.Effect<void>
}

export class LoggerService extends Context.Tag("LoggerService")<
  LoggerService,
  ILoggerService
>() {}
