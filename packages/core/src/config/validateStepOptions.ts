import { Effect } from "effect"
import type { StepInstance, ZlConfig } from "./ConfigTypes"
import { ConfigValidationError } from "./validateConfig"

/**
 * Structural subset of a compiled plugin step that {@link validateStepOptions}
 * cares about. Kept narrow so custom loaders (stubs, registries, monorepo
 * lookups) can return lightweight objects.
 */
export interface PluginLike {
  readonly optionsSchema?: {
    readonly decode: (raw: unknown) => unknown
  }
}

/**
 * Resolves a plugin by the `name` of a {@link StepInstance}. Returning `null`
 * means "no plugin known for this name" — that instance's options are not
 * validated.
 */
export type PluginLoader = (stepName: string) => Promise<PluginLike | null>

type LabeledInstance = { readonly inst: StepInstance; readonly source: string }

/**
 * Validate one instance's options. Returns `Effect<void, string, never>`
 * where the `string` failure channel carries a single human-readable issue
 * line. {@link validateStepOptions} collects every issue across all
 * instances via `Effect.validateAll` before rejecting.
 */
function validateOne(
  { inst, source }: LabeledInstance,
  loader: PluginLoader
): Effect.Effect<void, string, never> {
  return Effect.gen(function* () {
    const plugin = yield* Effect.tryPromise({
      try: () => loader(inst.name),
      catch: (cause) =>
        `Plugin loader failed for step '${inst.name}' (${source}): ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
    })
    if (!plugin || !plugin.optionsSchema) return
    try {
      plugin.optionsSchema.decode(inst.options ?? {})
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      return yield* Effect.fail(
        `Invalid options for step '${inst.name}' (${source}): ${reason}`
      )
    }
  })
}

/**
 * Walk every {@link StepInstance} in `config` (top-level `steps` + every
 * per-platform `steps`), validating each step's raw options against its
 * resolved plugin's `optionsSchema.decode`. Collects ALL failures via
 * `Effect.validateAll` and, if any, rejects with a single
 * {@link ConfigValidationError} carrying the full list — so users see every
 * misconfigured step in one pass, not just the first.
 *
 * Rejections from `decode` are rewrapped so callers get a single predictable
 * error type regardless of how a step author implemented their schema
 * (Effect `Schema`, Zod, a plain function, etc.).
 */
export function validateStepOptions(
  config: ZlConfig,
  loader: PluginLoader
): Effect.Effect<void, ConfigValidationError, never> {
  const allInstances: ReadonlyArray<LabeledInstance> = [
    ...(config.steps ?? []).map((inst) => ({ inst, source: "top-level" })),
    ...Object.entries(config.platforms).flatMap(([platform, p]) =>
      (p?.steps ?? []).map((inst) => ({ inst, source: `platform: ${platform}` }))
    ),
  ]

  return Effect.validateAll(allInstances, (entry) => validateOne(entry, loader)).pipe(
    Effect.asVoid,
    Effect.mapError((issues) => new ConfigValidationError(Array.from(issues)))
  )
}
