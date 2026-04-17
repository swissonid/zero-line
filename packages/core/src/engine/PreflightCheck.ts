/**
 * # Pipeline pre-flight check
 *
 * `preflightCheck` evaluates a workflow's aggregated step requirements
 * (secrets, toolchains, env vars — gathered via
 * {@link gatherRequirements}) against the live {@link ConfigService} and
 * {@link PlatformService}. It runs once, before any step executes, so a
 * missing secret or absent toolchain fails fast with a clear, actionable
 * error instead of surfacing mid-pipeline.
 *
 * Failure semantics: ALL missing items of a given category are collected
 * before failing (not first-only). The resulting {@link StepError} carries
 * one of the following codes and a message listing every missing key
 * annotated with the step that declared it:
 *
 * - `PREFLIGHT_MISSING_SECRETS`
 * - `PREFLIGHT_MISSING_TOOLCHAINS`
 * - `PREFLIGHT_MISSING_ENV`
 *
 * Categories are checked in order (secrets → toolchains → env); the first
 * category with any missing entries short-circuits. This keeps the error
 * output focused on one category at a time and avoids overwhelming the step
 * author with cascading failures (e.g. a missing toolchain often causes env
 * vars set by that toolchain to also be absent).
 *
 * Integration with the Pipeline (Task 12 / ZER-112) is out of scope here;
 * this module only exposes the pure check.
 */

import { Effect } from "effect"
import type { ResolvedStep } from "../step-loader/StepContract"
import {
  gatherRequirements,
  type RequirementEntry,
} from "../step-loader/StepRequirements"
import { StepError } from "./StepError"
import { ConfigService } from "../ports/ConfigService"
import { PlatformService } from "../ports/PlatformService"

function formatMissing(entries: ReadonlyArray<RequirementEntry>): string {
  return entries
    .map((e) => `  - ${e.key} (required by step '${e.stepName}')`)
    .join("\n")
}

/**
 * Verify that every declared step requirement is satisfied by the current
 * environment. Succeeds with `void` if all requirements are present;
 * otherwise fails with a {@link StepError} describing the missing items.
 *
 * @param steps - Workflow-resolved steps, in execution order. Function-valued
 *   requirements are evaluated against each step's bound options.
 * @returns An Effect that requires {@link ConfigService} and
 *   {@link PlatformService} and fails with {@link StepError} on any missing
 *   requirement.
 */
export function preflightCheck(
  steps: ReadonlyArray<ResolvedStep>
): Effect.Effect<void, StepError, ConfigService | PlatformService> {
  return Effect.gen(function* () {
    const requirements = gatherRequirements(steps)
    const config = yield* ConfigService
    const platform = yield* PlatformService

    // Secrets: probe each via ConfigService.secret; only the typed
    // SecretNotFoundError failure channel counts as "missing". Effect.either
    // keeps defects (infra crashes, network timeouts) propagating as defects
    // instead of silently misreporting them as missing secrets.
    const missingSecrets: RequirementEntry[] = []
    for (const entry of requirements.secrets) {
      const either = yield* Effect.either(config.secret(entry.key))
      if (either._tag === "Left") missingSecrets.push(entry)
    }
    if (missingSecrets.length > 0) {
      return yield* Effect.fail(
        new StepError({
          code: "PREFLIGHT_MISSING_SECRETS",
          message: `Missing required secrets:\n${formatMissing(missingSecrets)}`,
        })
      )
    }

    // Toolchains: single batched query against PlatformService, then set
    // membership against declared entries. Preserves declaration order in
    // error output.
    const availableToolchains = yield* platform.availableToolchains()
    const available: ReadonlySet<string> = new Set(availableToolchains)
    const missingToolchains = requirements.toolchains.filter(
      (t) => !available.has(t.key)
    )
    if (missingToolchains.length > 0) {
      return yield* Effect.fail(
        new StepError({
          code: "PREFLIGHT_MISSING_TOOLCHAINS",
          message: `Missing required toolchains:\n${formatMissing(missingToolchains)}`,
        })
      )
    }

    // Env vars: `ConfigService.env` returns `string | undefined` (never
    // fails), so absence is `undefined`, not a typed error.
    const missingEnv: RequirementEntry[] = []
    for (const entry of requirements.env) {
      const value = yield* config.env(entry.key)
      if (value === undefined) missingEnv.push(entry)
    }
    if (missingEnv.length > 0) {
      return yield* Effect.fail(
        new StepError({
          code: "PREFLIGHT_MISSING_ENV",
          message: `Missing required env vars:\n${formatMissing(missingEnv)}`,
        })
      )
    }
  })
}
