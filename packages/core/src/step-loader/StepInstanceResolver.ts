/**
 * Step instance resolver — the "resolved" stage of the step lifecycle.
 *
 * Given a list of {@link StepInstance}s from a workflow config and a
 * {@link PluginLoader} (dynamic import by default, in-memory in tests),
 * produces `ReadonlyArray<{@link ResolvedStep}>` with each plugin paired
 * to its workflow-bound name and options.
 *
 * Effect-based so it composes with the rest of the runtime: failures flow
 * through the typed {@link StepError} channel (not JS exceptions), loader
 * I/O is interruptible, and per-instance resolution is parallel via
 * `Effect.all({ concurrency: "unbounded" })` — matching the prior
 * `Promise.all` behaviour.
 *
 * Loader failures map to `StepError({ code: "STEP_NOT_FOUND" })`; exports
 * that don't pass `validateStep` map to `StepError({ code: "INVALID_PLUGIN" })`.
 */

import { Effect } from "effect"
import { StepError } from "../engine/StepError"
import type { PluginStep, ResolvedStep } from "./StepContract"
import { validateStep } from "./StepLoader"
import type { StepInstance } from "../config/ConfigTypes"
import { unwrapDefaultExport } from "./unwrapDefaultExport"

/**
 * How a step name is turned into a raw plugin module. Returns the module's
 * default-or-namespace export as `unknown` — the resolver validates the shape.
 *
 * Kept `Promise`-valued at the boundary because `import()` is Promise-native;
 * the resolver wraps it in `Effect.tryPromise` internally so callers of
 * {@link resolveStepInstances} only see the Effect surface.
 */
export type PluginLoader = (name: string) => Promise<unknown>

/**
 * Default loader used by the CLI: performs a real `import(name)` and unwraps
 * the module's `default` export if present, falling back to the namespace.
 *
 * Kept trivial so tests can avoid it entirely by passing their own loader.
 */
export const defaultPluginLoader: PluginLoader = async (name: string) => {
  return unwrapDefaultExport(await import(name))
}

function resolveOne(
  instance: StepInstance,
  loader: PluginLoader
): Effect.Effect<ResolvedStep, StepError, never> {
  return Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => loader(instance.name),
      catch: (cause) =>
        new StepError({
          code: "STEP_NOT_FOUND",
          message: `Failed to load step plugin '${instance.name}'`,
          cause,
        }),
    })

    const validation = validateStep(raw)
    if (!validation.valid) {
      return yield* Effect.fail(
        new StepError({
          code: "INVALID_PLUGIN",
          message: `Plugin '${instance.name}' is not a valid step: ${
            validation.error ?? "unknown"
          }`,
        })
      )
    }

    const plugin = raw as PluginStep
    return {
      plugin,
      name: instance.name,
      dependsOnSteps: plugin.dependsOnSteps,
      options: instance.options,
    }
  })
}

/**
 * Resolve a workflow's {@link StepInstance} list into {@link ResolvedStep}s.
 *
 * For each instance, the loader is invoked with `instance.name`; on success
 * the result is validated as a {@link PluginStep} via {@link validateStep}
 * and paired with the instance's raw options into a `ResolvedStep`.
 *
 * Errors:
 * - Loader throws/rejects → {@link StepError} `STEP_NOT_FOUND` (cause preserved).
 * - Loaded export is not a valid plugin → {@link StepError} `INVALID_PLUGIN`
 *   (with the validator's error message).
 *
 * The first failure stops the walk; partial resolution is intentionally not
 * supported so config problems surface as a single predictable error.
 *
 * Options binding: the instance's `options` are passed through verbatim.
 * Decoding against `plugin.optionsSchema.decode` happens elsewhere
 * (validateStepOptions, or the step's `execute`/`run` at runtime) — this
 * resolver only pairs instances with plugins.
 */
export function resolveStepInstances(
  instances: ReadonlyArray<StepInstance>,
  loader: PluginLoader = defaultPluginLoader
): Effect.Effect<ReadonlyArray<ResolvedStep>, StepError, never> {
  return Effect.all(
    instances.map((instance) => resolveOne(instance, loader)),
    { concurrency: "unbounded" }
  )
}
