import { Effect, Layer } from "effect"
import {
  ConfigService,
  ConfigLoadError,
  SecretNotFoundError,
} from "../ports/ConfigService"

/**
 * Lightweight {@link ConfigService} adapter that provides `env` and `secret`
 * from `process.env` without requiring a project directory. Intended to be
 * baked into the module-level `DefaultRuntimeLayer` so services like
 * `preflightCheck` can resolve secrets and env vars without the caller
 * having to construct a project-dir-bound layer.
 *
 * `load()` intentionally fails with a descriptive {@link ConfigLoadError}:
 * this adapter has no project directory, so it cannot parse a
 * `zl.config.ts`. The error message points the caller at
 * {@link makeFileConfigLayer} which is the correct adapter for real
 * configuration loading.
 */
export const LocalEnvConfigLive = Layer.succeed(ConfigService, {
  load: () =>
    Effect.fail(
      new ConfigLoadError({
        message:
          "LocalEnvConfigLive does not support load(); use makeFileConfigLayer(projectDir) to load zl.config.ts",
      })
    ),

  env: (key: string) => Effect.succeed(process.env[key]),

  // Env vars are the only source for now; OS-keychain fallback arrives
  // with ZER-122 (M-A2 Task 5 — SecretStore wiring).
  secret: (key: string) =>
    Effect.fromNullable(process.env[key]).pipe(
      Effect.mapError(
        () =>
          new SecretNotFoundError({
            key,
            message: `Secret not found: ${key}`,
          })
      )
    ),
})
