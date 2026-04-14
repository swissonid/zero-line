import { join } from "path"
import { existsSync } from "fs"
import type { ZlConfig } from "./ConfigTypes"

export class ConfigFileNotFoundError extends Error {
  constructor(readonly dir: string) {
    super(`No zl.config.ts found in ${dir}`)
    this.name = "ConfigFileNotFoundError"
  }
}

export class ConfigValidationError extends Error {
  constructor(readonly issues: ReadonlyArray<string>) {
    super(`Invalid config: ${issues.join(", ")}`)
    this.name = "ConfigValidationError"
  }
}

function validateConfig(raw: unknown): ZlConfig {
  const issues: string[] = []

  if (!raw || typeof raw !== "object") {
    throw new ConfigValidationError(["Config must be an object"])
  }

  const config = raw as Record<string, unknown>

  if (!config.app || typeof config.app !== "object") {
    issues.push("Missing 'app' configuration")
  } else {
    const app = config.app as Record<string, unknown>
    if (!app.name) issues.push("Missing 'app.name'")
    if (!app.bundleId) issues.push("Missing 'app.bundleId'")
  }

  if (!config.workflows || typeof config.workflows !== "object") {
    issues.push("Missing 'workflows' configuration")
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues)
  }

  return config as unknown as ZlConfig
}

export async function loadConfig(projectDir: string): Promise<ZlConfig> {
  const configPath = join(projectDir, "zl.config.ts")

  if (!existsSync(configPath)) {
    throw new ConfigFileNotFoundError(projectDir)
  }

  const mod = await import(`${configPath}?t=${Date.now()}`)
  const raw = mod.default ?? mod

  return validateConfig(raw)
}
