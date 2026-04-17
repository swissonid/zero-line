import { Effect, Layer } from "effect"
import { existsSync } from "fs"
import { join } from "path"
import { ConfigService, ConfigLoadError, SecretNotFoundError } from "../ports/ConfigService"
import { validateConfig } from "../config/validateConfig"
import { unwrapDefaultExport } from "../step-loader/unwrapDefaultExport"

export function makeFileConfigLayer(projectDir: string) {
  return Layer.succeed(ConfigService, {
    load: () =>
      Effect.tryPromise({
        try: async () => {
          const configPath = join(projectDir, "zl.config.ts")
          if (!existsSync(configPath)) {
            throw new Error(`No zl.config.ts found in ${projectDir}`)
          }
          const mod = await import(configPath)
          return validateConfig(unwrapDefaultExport(mod))
        },
        catch: (err) =>
          new ConfigLoadError({
            message: err instanceof Error ? err.message : String(err),
          }),
      }),

    env: (key: string) => Effect.succeed(process.env[key]),

    // Env vars are the only source for now; OS-keychain fallback arrives
    // with ZER-122 (M-A2 Task 5 — SecretStore wiring).
    secret: (key: string) =>
      Effect.fromNullable(process.env[key]).pipe(
        Effect.mapError(
          () => new SecretNotFoundError({ key, message: `Secret not found: ${key}` })
        )
      ),
  })
}
