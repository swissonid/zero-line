import { Context, Data, Effect } from "effect"
import type { ZlConfig } from "../config/ConfigTypes"

export interface IConfigService {
  readonly load: () => Effect.Effect<ZlConfig, ConfigLoadError>
  readonly env: (key: string) => Effect.Effect<string | undefined>
  readonly secret: (key: string) => Effect.Effect<string, SecretNotFoundError>
}

/**
 * Typed failure raised when {@link IConfigService.load} cannot parse or
 * validate the project's `zl.config.ts`.
 *
 * Built on `Data.TaggedError` for structural equality and enumerable
 * fields. `.message` survives `JSON.stringify` without a custom
 * `toJSON()`.
 */
export class ConfigLoadError extends Data.TaggedError("ConfigLoadError")<{
  readonly message: string
}> {}

/**
 * Typed failure raised when {@link IConfigService.secret} is asked for a
 * key that no configured secret source can resolve. The `.key` field
 * names the offending secret so diagnostics (and pre-flight checks) can
 * list every missing secret.
 */
export class SecretNotFoundError extends Data.TaggedError(
  "SecretNotFoundError"
)<{
  readonly key: string
}> {}

export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  IConfigService
>() {}
