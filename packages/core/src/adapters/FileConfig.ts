import { Effect, Layer } from "effect"
import { join } from "path"
import { ConfigService, ConfigLoadError } from "../ports/ConfigService"
import { validateConfig } from "../config/validateConfig"

export function makeFileConfigLayer(projectDir: string) {
  return Layer.succeed(ConfigService, {
    load: () =>
      Effect.tryPromise({
        try: async () => {
          const configPath = join(projectDir, "zl.config.ts")
          const mod = await import(configPath)
          return validateConfig(mod.default ?? mod)
        },
        catch: (err) =>
          new ConfigLoadError(
            `Failed to load zl.config.ts: ${err instanceof Error ? err.message : String(err)}`
          ),
      }),

    env: (key: string) => Effect.succeed(process.env[key]),

    secret: (key: string) =>
      Effect.sync(() => {
        const envValue = process.env[key]
        if (envValue !== undefined) return envValue
        // TODO: OS keychain lookup (separate task)
        return undefined
      }),
  })
}
