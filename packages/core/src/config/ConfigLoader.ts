import { existsSync } from "fs"
import { join } from "path"
import type { StepInstance, ZlConfig } from "./ConfigTypes"
import { validateConfig, ConfigValidationError } from "./validateConfig"

export { ConfigValidationError }

/**
 * Thrown when `zl.config.ts` is missing in the target project directory.
 */
export class ConfigFileNotFoundError extends Error {
  constructor(readonly dir: string) {
    super(`No zl.config.ts found in ${dir}`)
    this.name = "ConfigFileNotFoundError"
  }
}

/**
 * Minimal loader contract used by {@link loadConfig} to resolve a plugin for
 * a step name. Returning `null` means "no plugin known for this name" and
 * causes options-schema validation to be skipped for that step instance.
 *
 * Kept inline (rather than imported from `StepInstanceResolver`) so that
 * `ConfigLoader` has no runtime dependency on the resolver; the resolver —
 * once it lands — can re-export a compatible type.
 */
export type PluginLoader = (stepName: string) => Promise<PluginLike | null>

/**
 * Structural subset of a compiled plugin step that {@link loadConfig} cares
 * about: only the `optionsSchema` (optional) is consulted. Kept narrow to
 * avoid coupling `ConfigLoader` to the full `PluginStep` union shape and to
 * allow alternative loaders (stubs, registries) to return lightweight objects.
 */
export interface PluginLike {
  readonly optionsSchema?: {
    readonly decode: (raw: unknown) => unknown
  }
}

/**
 * Options accepted by {@link loadConfig}.
 *
 * - `loader`: when provided, `loadConfig` resolves each step instance via the
 *   loader and runs its `optionsSchema.decode` against the step's raw options.
 *   Any thrown error is rewrapped as {@link ConfigValidationError} so a
 *   misconfigured step fails fast at config-load time rather than mid-pipeline.
 *   When omitted, `loadConfig` stays strictly backwards-compatible.
 */
export interface LoadConfigOptions {
  readonly loader?: PluginLoader
}

/**
 * Load, parse, and validate a project's `zl.config.ts`.
 *
 * When `options.loader` is provided, the step author's `optionsSchema.decode`
 * function is invoked against each step instance's raw options, and any
 * thrown error is surfaced as a {@link ConfigValidationError} keyed to the
 * step name. When the loader returns `null` for a step (plugin not known) or
 * the resolved plugin has no `optionsSchema`, validation is skipped for that
 * step.
 */
export async function loadConfig(
  projectDir: string,
  options: LoadConfigOptions = {}
): Promise<ZlConfig> {
  const configPath = join(projectDir, "zl.config.ts")

  if (!existsSync(configPath)) {
    throw new ConfigFileNotFoundError(projectDir)
  }

  const mod = (await import(configPath)) as Record<string, unknown>
  const raw = mod.default ?? mod
  const config = validateConfig(raw)

  if (options.loader) {
    await validateStepOptions(config, options.loader)
  }

  return config
}

/**
 * Walk every {@link StepInstance} in `config` (top-level `steps` + every
 * per-platform `steps`) and validate its raw options against the plugin's
 * `optionsSchema.decode`, if the loader can resolve a plugin that exposes one.
 *
 * Any failure is rewrapped as {@link ConfigValidationError} so callers get a
 * single predictable error type regardless of how a step author implemented
 * their schema (Effect `Schema`, Zod, a plain function, etc.).
 */
async function validateStepOptions(
  config: ZlConfig,
  loader: PluginLoader
): Promise<void> {
  type LabeledInstance = { readonly inst: StepInstance; readonly source: string }

  const allInstances: ReadonlyArray<LabeledInstance> = [
    ...(config.steps ?? []).map((inst) => ({ inst, source: "top-level" })),
    ...Object.entries(config.platforms).flatMap(([platform, p]) =>
      (p?.steps ?? []).map((inst) => ({ inst, source: `platform: ${platform}` }))
    ),
  ]

  const errors: string[] = []
  for (const { inst, source } of allInstances) {
    const plugin = await loader(inst.name)
    if (!plugin || !plugin.optionsSchema) continue
    try {
      plugin.optionsSchema.decode(inst.options ?? {})
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      errors.push(`Invalid options for step '${inst.name}' (${source}): ${reason}`)
    }
  }
  if (errors.length > 0) {
    throw new ConfigValidationError(errors)
  }
}
