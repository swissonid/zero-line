import { Effect } from "effect"

export interface OptionsSchema<T> {
  readonly decode: (raw: unknown) => T
}

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

export interface SimpleStepDef<TOpts = Record<string, unknown>> {
  readonly name: string
  readonly dependsOnSteps?: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<TOpts>
  readonly run: (opts: TOpts, ctx: StepContext) => Promise<Record<string, unknown>>
}

export interface EffectStepDef<TOpts = Record<string, unknown>> {
  readonly name: string
  readonly dependsOnSteps?: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<TOpts>
  readonly run: (opts: TOpts) => Effect.Effect<Record<string, unknown>, unknown, unknown>
}

export interface SimplePluginStep {
  readonly _tag: "simple"
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<unknown>
  readonly execute: (opts: Record<string, unknown>, ctx: StepContext) => Promise<Record<string, unknown>>
}

export interface EffectPluginStep {
  readonly _tag: "effect"
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<unknown>
  readonly run: (opts: Record<string, unknown>) => Effect.Effect<Record<string, unknown>, unknown, unknown>
}

export type PluginStep = SimplePluginStep | EffectPluginStep

export interface ResolvedStep {
  readonly plugin: PluginStep
  /** Workflow-bound name; may differ from `plugin.name` when aliased in config. */
  readonly name: string
  /** Workflow-bound dep list; may differ from `plugin.dependsOnSteps`. */
  readonly dependsOnSteps: ReadonlyArray<string>
  readonly options: Record<string, unknown>
}

export function defineStep<TOpts = Record<string, unknown>>(
  def: SimpleStepDef<TOpts>
): SimplePluginStep {
  return {
    _tag: "simple",
    name: def.name,
    dependsOnSteps: def.dependsOnSteps ?? [],
    optionsSchema: def.optionsSchema as OptionsSchema<unknown> | undefined,
    execute: (opts, ctx) => def.run(opts as TOpts, ctx),
  }
}

export function defineEffectStep<TOpts = Record<string, unknown>>(
  def: EffectStepDef<TOpts>
): EffectPluginStep {
  return {
    _tag: "effect",
    name: def.name,
    dependsOnSteps: def.dependsOnSteps ?? [],
    optionsSchema: def.optionsSchema as OptionsSchema<unknown> | undefined,
    run: (opts) => def.run(opts as TOpts),
  }
}
