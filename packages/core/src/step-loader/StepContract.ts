/**
 * # Step contract and lifecycle
 *
 * A "step" is the unit of work zero-line executes inside a workflow. It travels
 * through three distinct shapes between a step author and the Pipeline:
 *
 * 1. **Authored** — the step author passes a {@link SimpleStepDef} (or
 *    {@link EffectStepDef}) literal to {@link defineStep} / {@link defineEffectStep}.
 *    This is the user-facing shape, with typed `run(opts, ctx)` and an optional
 *    {@link OptionsSchema} for options validation.
 *
 * 2. **Compiled** — `defineStep` returns a {@link SimplePluginStep} (or
 *    {@link EffectPluginStep}); together they form the {@link PluginStep} union.
 *    This is what a plugin npm package exports: a normalised, framework-visible
 *    contract with a `_tag` discriminator, a guaranteed `dependsOnSteps` array,
 *    and an `execute(opts, ctx)` / `run(opts)` surface invokable by the engine.
 *
 * 3. **Resolved** — a workflow references a plugin via a `StepInstance`
 *    (`{ name, options, alias?, dependsOnSteps? }`). The step-instance resolver
 *    pairs each instance with its {@link PluginStep} and produces a
 *    {@link ResolvedStep} — the pair of "which plugin to run" and "the bound
 *    options / workflow-local name / deps to run it with". The Pipeline iterates
 *    `ResolvedStep[]` at execution time.
 *
 * One {@link PluginStep} can back many {@link ResolvedStep}s (same plugin,
 * different options or aliases across workflows).
 *
 * See also: `docs/superpowers/notes/step-lifecycle.md` for a diagram.
 */

import { Effect } from "effect"

/**
 * A step-author–declared list of required external identifiers (secrets,
 * toolchains, or env-vars) a step needs to run.
 *
 * - The **static** form (`ReadonlyArray<string>`) lists fixed keys, known at
 *   authoring time — e.g. `["APPLE_API_KEY", "APPLE_ISSUER_ID"]`.
 * - The **dynamic** form (`(opts) => ReadonlyArray<string>`) lets the step
 *   author derive keys from the workflow-bound options, e.g.
 *   `(opts) => [\`APPLE_API_KEY_${opts.teamId}\`]`.
 *
 * Used by {@link SimpleStepDef} / {@link EffectStepDef} for `requiredSecrets`,
 * `requiredToolchains`, and `requiredEnv`. The requirements gatherer (Task 10)
 * collects these into a pipeline-wide summary; the pre-flight check (Task 11)
 * evaluates that summary against the configured environment before any step
 * runs.
 *
 * The `TOpts` parameter matches the step's options type in the authored defs;
 * it widens to `Record<string, unknown>` once the step is compiled into a
 * {@link PluginStep}.
 */
export type Requirement<TOpts> =
  | ReadonlyArray<string>
  | ((opts: TOpts) => ReadonlyArray<string>)

/**
 * A minimal, schema-agnostic validator for plugin options.
 *
 * Plugins declare one via `optionsSchema` on their step definition. The resolver
 * (or ConfigLoader) calls {@link OptionsSchema.decode} with the raw workflow
 * options and expects either a typed value back or a thrown error. This keeps
 * `@zl/core` independent of any specific validation library — adapters for
 * `effect/Schema`, `zod`, or plain functions all fit.
 */
export interface OptionsSchema<T> {
  readonly decode: (raw: unknown) => T
}

/**
 * Runtime services available to a step's `run` / `execute` body.
 *
 * A {@link StepContext} is constructed by the Pipeline for each step invocation
 * and bundles logging, config/env/secret access, platform detection, and the
 * artifact store. It is the only non-options input a step receives; steps are
 * otherwise pure with respect to their {@link OptionsSchema}-decoded options.
 */
export interface StepContext {
  readonly logger: {
    readonly info: (msg: string) => void
    readonly warn: (msg: string) => void
    readonly error: (msg: string) => void
    readonly debug: (msg: string) => void
  }
  readonly config: {
    readonly env: (key: string) => string | undefined
    readonly secret: (key: string) => string | undefined
  }
  readonly platform: {
    readonly os: () => string
    readonly availableToolchains: () => ReadonlyArray<string>
    readonly supports: (platform: string) => boolean
  }
  readonly artifacts: {
    readonly put: (key: string, artifact: unknown) => void
    readonly get: (key: string) => unknown | undefined
    readonly list: () => ReadonlyArray<string>
  }
}

/**
 * Step author's input shape for {@link defineStep} (async/Promise-based steps).
 *
 * This is the **authored** stage of the step lifecycle. Step authors write this
 * literal and pass it to `defineStep(...)`, which returns a compiled
 * {@link SimplePluginStep}.
 *
 * @example
 * ```ts
 * export default defineStep({
 *   name: "hello",
 *   optionsSchema: { decode: (raw) => raw as { greeting?: string } },
 *   run: async (opts, ctx) => {
 *     ctx.logger.info(opts.greeting ?? "hello")
 *     return { done: true }
 *   },
 * })
 * ```
 */
export interface SimpleStepDef<TOpts = Record<string, unknown>> {
  readonly name: string
  readonly dependsOnSteps?: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<TOpts>
  /** Secrets (e.g. `APPLE_API_KEY`) this step needs from the secret store. See {@link Requirement}. */
  readonly requiredSecrets?: Requirement<TOpts>
  /** Toolchains (e.g. `xcode`, `gradle`) this step needs on PATH. See {@link Requirement}. */
  readonly requiredToolchains?: Requirement<TOpts>
  /** Environment variables this step needs to be set. See {@link Requirement}. */
  readonly requiredEnv?: Requirement<TOpts>
  readonly run: (opts: TOpts, ctx: StepContext) => Promise<Record<string, unknown>>
}

/**
 * Step author's input shape for {@link defineEffectStep} (Effect-based steps).
 *
 * Use this when you want to express dependencies as Effect services (e.g.
 * consume `LoggerService` or `ShellService`) rather than reach into a
 * {@link StepContext}. The `run` callback returns an `Effect`; the Pipeline
 * provides the runtime layer at execution time.
 */
export interface EffectStepDef<TOpts = Record<string, unknown>> {
  readonly name: string
  readonly dependsOnSteps?: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<TOpts>
  /** Secrets this step needs from the secret store. See {@link Requirement}. */
  readonly requiredSecrets?: Requirement<TOpts>
  /** Toolchains this step needs on PATH. See {@link Requirement}. */
  readonly requiredToolchains?: Requirement<TOpts>
  /** Environment variables this step needs to be set. See {@link Requirement}. */
  readonly requiredEnv?: Requirement<TOpts>
  readonly run: (opts: TOpts) => Effect.Effect<Record<string, unknown>, unknown, unknown>
}

/**
 * Compiled Promise-based plugin step — the output of {@link defineStep}.
 *
 * This is the **compiled** stage: a normalised, framework-visible contract that
 * a plugin package exports. Key differences from {@link SimpleStepDef}:
 * - `_tag: "simple"` discriminator for the {@link PluginStep} union
 * - `dependsOnSteps` always present (defaulted to `[]`)
 * - `execute(opts, ctx)` wraps the author's `run`; the engine calls this
 */
export interface SimplePluginStep {
  readonly _tag: "simple"
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<unknown>
  /** See {@link SimpleStepDef.requiredSecrets}. Widened to opaque options at the compiled stage. */
  readonly requiredSecrets?: Requirement<Record<string, unknown>>
  /** See {@link SimpleStepDef.requiredToolchains}. Widened to opaque options at the compiled stage. */
  readonly requiredToolchains?: Requirement<Record<string, unknown>>
  /** See {@link SimpleStepDef.requiredEnv}. Widened to opaque options at the compiled stage. */
  readonly requiredEnv?: Requirement<Record<string, unknown>>
  readonly execute: (opts: Record<string, unknown>, ctx: StepContext) => Promise<Record<string, unknown>>
}

/**
 * Compiled Effect-based plugin step — the output of {@link defineEffectStep}.
 *
 * Parallel to {@link SimplePluginStep} but carries an Effect-valued `run`
 * rather than `execute`. The Pipeline dispatches on `_tag` to call the right
 * one.
 */
export interface EffectPluginStep {
  readonly _tag: "effect"
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<unknown>
  /** See {@link EffectStepDef.requiredSecrets}. Widened to opaque options at the compiled stage. */
  readonly requiredSecrets?: Requirement<Record<string, unknown>>
  /** See {@link EffectStepDef.requiredToolchains}. Widened to opaque options at the compiled stage. */
  readonly requiredToolchains?: Requirement<Record<string, unknown>>
  /** See {@link EffectStepDef.requiredEnv}. Widened to opaque options at the compiled stage. */
  readonly requiredEnv?: Requirement<Record<string, unknown>>
  readonly run: (opts: Record<string, unknown>) => Effect.Effect<Record<string, unknown>, unknown, unknown>
}

/**
 * Union of both compiled plugin step variants.
 *
 * A plugin package's default export is (conventionally) a {@link PluginStep}.
 * Consumers — validator, loader, resolver, Pipeline — work against this union
 * and dispatch on `_tag`.
 */
export type PluginStep = SimplePluginStep | EffectPluginStep

/**
 * Workflow-bound step ready for execution — the **resolved** stage.
 *
 * Produced by the step-instance resolver (Task 12 / ZER-96) by pairing a
 * `StepInstance` from config with its matching {@link PluginStep} from the
 * plugin catalog. The Pipeline iterates `ResolvedStep[]` and calls
 * `step.plugin.execute(step.options, ctx)` (or `plugin.run(step.options)` for
 * Effect steps).
 *
 * A single {@link PluginStep} can appear in many `ResolvedStep`s when a workflow
 * uses the same plugin multiple times with different options or aliases.
 */
export interface ResolvedStep {
  readonly plugin: PluginStep
  /** Workflow-bound name; may differ from `plugin.name` when aliased in config. */
  readonly name: string
  /** Workflow-bound dep list; may differ from `plugin.dependsOnSteps`. */
  readonly dependsOnSteps: ReadonlyArray<string>
  /** Raw workflow-bound options as provided in config; decoded by `plugin.optionsSchema.decode` at execution time. */
  readonly options: Record<string, unknown>
}

/**
 * Compile a {@link SimpleStepDef} into a {@link SimplePluginStep}.
 *
 * Normalises `dependsOnSteps` to an array, tags the result with `_tag: "simple"`,
 * and wraps the author's typed `run(opts, ctx)` behind an `execute(opts, ctx)`
 * that accepts opaque `Record<string, unknown>` — the contract the engine calls.
 *
 * The returned value is the plugin's public export; downstream consumers see it
 * as a {@link PluginStep}.
 */
export function defineStep<TOpts = Record<string, unknown>>(
  def: SimpleStepDef<TOpts>
): SimplePluginStep {
  return {
    _tag: "simple",
    name: def.name,
    dependsOnSteps: def.dependsOnSteps ?? [],
    optionsSchema: def.optionsSchema as OptionsSchema<unknown> | undefined,
    requiredSecrets: def.requiredSecrets as Requirement<Record<string, unknown>> | undefined,
    requiredToolchains: def.requiredToolchains as Requirement<Record<string, unknown>> | undefined,
    requiredEnv: def.requiredEnv as Requirement<Record<string, unknown>> | undefined,
    execute: (opts, ctx) => def.run(opts as TOpts, ctx),
  }
}

/**
 * Compile an {@link EffectStepDef} into an {@link EffectPluginStep}.
 *
 * Parallel to {@link defineStep} but preserves the Effect-valued `run`. The
 * Pipeline runs Effect steps through a `ManagedRuntime` at execution time.
 */
export function defineEffectStep<TOpts = Record<string, unknown>>(
  def: EffectStepDef<TOpts>
): EffectPluginStep {
  return {
    _tag: "effect",
    name: def.name,
    dependsOnSteps: def.dependsOnSteps ?? [],
    optionsSchema: def.optionsSchema as OptionsSchema<unknown> | undefined,
    requiredSecrets: def.requiredSecrets as Requirement<Record<string, unknown>> | undefined,
    requiredToolchains: def.requiredToolchains as Requirement<Record<string, unknown>> | undefined,
    requiredEnv: def.requiredEnv as Requirement<Record<string, unknown>> | undefined,
    run: (opts) => def.run(opts as TOpts),
  }
}
