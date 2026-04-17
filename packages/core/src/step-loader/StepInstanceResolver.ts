/**
 * # Step instance resolver
 *
 * Pairs each {@link StepInstance} from a workflow config with its compiled
 * {@link PluginStep} and produces a {@link ResolvedStep} — the "bound"
 * lifecycle stage the Pipeline iterates at execution time.
 *
 * This module is the **resolved** stage of the step lifecycle documented in
 * {@link ./StepContract}. The flow is:
 *
 * 1. The caller hands in `ReadonlyArray<StepInstance>` (from a
 *    `zl.config.ts` workflow) plus a {@link PluginLoader} that knows how to
 *    fetch a plugin module by its `name`.
 * 2. For each instance the resolver calls the loader, validates the result
 *    with {@link validateStep}, and constructs a {@link ResolvedStep} pairing
 *    the compiled plugin with the instance's raw options (and any authored
 *    defaults like `dependsOnSteps`).
 * 3. The returned array preserves input order so dependency-graph building
 *    downstream is deterministic.
 *
 * Injecting the loader (rather than hard-coding `import(name)`) keeps this
 * module test-friendly: unit tests pass a synchronous in-memory loader; the
 * CLI passes {@link defaultPluginLoader} which does a real dynamic import.
 */

import { StepError } from "../engine/StepError"
import type { PluginStep, ResolvedStep } from "./StepContract"
import { validateStep } from "./StepLoader"
import type { StepInstance } from "../config/ConfigTypes"

/**
 * Pluggable module resolver: given a plugin package name (as it appears in a
 * step instance's `name` field), return the raw module export. Throwing (or
 * rejecting) signals "no such plugin" and is surfaced as
 * {@link StepError} `STEP_NOT_FOUND`.
 *
 * The type intentionally returns `unknown`: the resolver runs
 * {@link validateStep} against whatever the loader returns, so custom loaders
 * (stubs, registries, monorepo lookups) don't have to understand the full
 * {@link PluginStep} shape themselves.
 *
 * Compatible-by-shape with `ConfigLoader`'s `PluginLoader` (which returns
 * `PluginLike | null` for the options-schema-only path). We keep the types
 * independent so neither module imports the other.
 */
export type PluginLoader = (name: string) => Promise<unknown>

/**
 * Default loader used by the CLI: performs a real `import(name)` and unwraps
 * the module's `default` export if present, falling back to the namespace.
 *
 * Kept trivial so tests can avoid it entirely by passing their own loader.
 */
export const defaultPluginLoader: PluginLoader = async (name: string) => {
  const mod = (await import(name)) as Record<string, unknown>
  return (mod.default ?? mod) as unknown
}

/**
 * Resolve a workflow's {@link StepInstance} list into {@link ResolvedStep}s.
 *
 * For each instance, the loader is invoked with `instance.name`; on success
 * the result is validated as a {@link PluginStep} via {@link validateStep}
 * and paired with the instance's raw options into a `ResolvedStep`.
 *
 * Errors:
 * - Loader throws/rejects → {@link StepError} `STEP_NOT_FOUND` (cause
 *   preserved).
 * - Loaded export is not a valid plugin → {@link StepError} `INVALID_PLUGIN`
 *   (with the validator's error message).
 *
 * The first failure stops the walk; partial resolution is intentionally not
 * supported so config problems surface as a single predictable error.
 *
 * Options binding: the instance's `options` (defaulting to `{}`) are passed
 * through verbatim. Decoding against `plugin.optionsSchema.decode` happens
 * elsewhere (ConfigLoader, or the step's `execute`/`run` at runtime) — this
 * resolver only pairs instances with plugins.
 */
export async function resolveStepInstances(
  instances: ReadonlyArray<StepInstance>,
  loader: PluginLoader = defaultPluginLoader
): Promise<ReadonlyArray<ResolvedStep>> {
  const resolved: ResolvedStep[] = []
  for (const instance of instances) {
    let raw: unknown
    try {
      raw = await loader(instance.name)
    } catch (cause) {
      throw new StepError({
        code: "STEP_NOT_FOUND",
        message: `Failed to load step plugin '${instance.name}'`,
        cause,
      })
    }

    const validation = validateStep(raw)
    if (!validation.valid) {
      throw new StepError({
        code: "INVALID_PLUGIN",
        message: `Plugin '${instance.name}' is not a valid step: ${
          validation.error ?? "unknown"
        }`,
      })
    }

    const plugin = raw as PluginStep
    resolved.push({
      plugin,
      name: plugin.name,
      dependsOnSteps: plugin.dependsOnSteps,
      options: instance.options ?? {},
    })
  }
  return resolved
}
