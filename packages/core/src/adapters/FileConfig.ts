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
          new ConfigLoadError(err instanceof Error ? err.message : String(err)),
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
