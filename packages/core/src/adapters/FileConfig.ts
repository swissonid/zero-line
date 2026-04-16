import { Effect, Layer } from "effect"
import { join } from "path"
import { ConfigService, ConfigLoadError, SecretNotFoundError } from "../ports/ConfigService"
import type { ZlConfig } from "../config/ConfigTypes"

export function makeFileConfigLayer(projectDir: string) {
  return Layer.succeed(ConfigService, {
    load: () =>
      Effect.tryPromise({
        try: async () => {
          const configPath = join(projectDir, "zl.config.ts")
          const mod = await import(configPath)
          return (mod.default ?? mod) as ZlConfig
        },
        catch: (err) =>
          new ConfigLoadError(
            `Failed to load zl.config.ts: ${err instanceof Error ? err.message : String(err)}`
          ),
      }),

    env: (key: string) => Effect.succeed(process.env[key]),

    secret: (key: string) =>
      Effect.suspend(() => {
        const envValue = process.env[key]
        if (envValue !== undefined) return Effect.succeed(envValue)
        // TODO: OS keychain lookup (separate task)
        return Effect.fail(new SecretNotFoundError(key))
      }),
  })
}
