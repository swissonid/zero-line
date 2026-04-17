import { Schema } from "effect"

/**
 * Runtime schemas for `zl.config.ts`.
 *
 * Keeping schemas and types colocated in a single module means the inferred
 * TypeScript types (`Schema.Schema.Type<typeof X>`) are always in sync with
 * the decoder. The surface exported below (`AppConfig`, `PlatformConfig`,
 * `StepInstance`, `WorkflowConfig`, `ZlConfig`) is unchanged so consumers
 * don't care that the types are now schema-derived.
 *
 * All structs use `effect/Schema`'s default excess-property behaviour
 * (silently strip unknown keys). See
 * `docs/superpowers/decisions/2026-04-16-options-schema-library.md` — a
 * `strict` mode is a deliberate v1.1 consideration, not part of this ticket.
 */

export const StepInstanceSchema = Schema.Struct({
  name: Schema.String,
  options: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
})

export const PlatformConfigSchema = Schema.Struct({
  steps: Schema.Array(StepInstanceSchema),
})

export const AppConfigSchema = Schema.Struct({
  name: Schema.String,
  bundleId: Schema.String,
})

export const WorkflowConfigSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Array(Schema.String),
})

export const ZlConfigSchema = Schema.Struct({
  app: AppConfigSchema,
  platforms: Schema.partial(
    Schema.Struct({
      ios: PlatformConfigSchema,
      android: PlatformConfigSchema,
    })
  ),
  steps: Schema.optional(Schema.Array(StepInstanceSchema)),
  workflows: WorkflowConfigSchema,
})

export type AppConfig = Schema.Schema.Type<typeof AppConfigSchema>

export type Platform = "ios" | "android"

export type PlatformConfig = Schema.Schema.Type<typeof PlatformConfigSchema>

export type StepInstance = Schema.Schema.Type<typeof StepInstanceSchema>

export type WorkflowConfig = Schema.Schema.Type<typeof WorkflowConfigSchema>

export type ZlConfig = Schema.Schema.Type<typeof ZlConfigSchema>

export function defineConfig(config: ZlConfig): ZlConfig {
  return config
}
