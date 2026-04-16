import { existsSync } from "fs"
import { join } from "path"
import type { ZlConfig } from "./ConfigTypes"
import { validateConfig, ConfigValidationError } from "./validateConfig"

export { ConfigValidationError }

export class ConfigFileNotFoundError extends Error {
  constructor(readonly dir: string) {
    super(`No zl.config.ts found in ${dir}`)
    this.name = "ConfigFileNotFoundError"
  }
}

export async function loadConfig(projectDir: string): Promise<ZlConfig> {
  const configPath = join(projectDir, "zl.config.ts")

  if (!existsSync(configPath)) {
    throw new ConfigFileNotFoundError(projectDir)
  }

  const mod = (await import(configPath)) as Record<string, unknown>
  const raw = mod.default ?? mod
  return validateConfig(raw)
}
