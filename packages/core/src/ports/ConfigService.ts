import { Context, Effect } from "effect"
import type { ZlConfig } from "../config/ConfigTypes"

export interface IConfigService {
  readonly load: () => Effect.Effect<ZlConfig, ConfigLoadError>
  readonly env: (key: string) => Effect.Effect<string | undefined>
  readonly secret: (key: string) => Effect.Effect<string | undefined, SecretNotFoundError>
}

export class ConfigLoadError {
  readonly _tag = "ConfigLoadError"
  constructor(readonly message: string) {}
}

export class SecretNotFoundError {
  readonly _tag = "SecretNotFoundError"
  constructor(readonly key: string) {}
}

export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  IConfigService
>() {}
