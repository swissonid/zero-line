import type { ZlConfig } from "./ConfigTypes"

export class ConfigValidationError extends Error {
  constructor(readonly issues: ReadonlyArray<string>) {
    super(`Invalid config: ${issues.join(", ")}`)
    this.name = "ConfigValidationError"
  }
}

export function validateConfig(raw: unknown): ZlConfig {
  if (!raw || typeof raw !== "object") {
    throw new ConfigValidationError(["Config must be an object"])
  }

  const config = raw as Record<string, unknown>
  const issues: string[] = []

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

  if (!config.platforms || typeof config.platforms !== "object") {
    issues.push("Missing 'platforms' configuration")
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues)
  }

  return config as unknown as ZlConfig
}
