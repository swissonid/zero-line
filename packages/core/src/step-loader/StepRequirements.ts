/**
 * # Step requirements gathering
 *
 * A step author declares the external identifiers their step needs — secrets,
 * toolchains, env-vars — via `requiredSecrets` / `requiredToolchains` /
 * `requiredEnv` on their {@link SimpleStepDef} / {@link EffectStepDef}. Each
 * field is a {@link Requirement}: either a static `ReadonlyArray<string>` or a
 * function `(opts) => ReadonlyArray<string>` that derives keys from the
 * workflow-bound options.
 *
 * {@link gatherRequirements} walks a `ReadonlyArray<ResolvedStep>` (the
 * workflow's execution order, already paired with bound options) and produces
 * three flat, step-annotated lists. Downstream, the pre-flight check (Task 11 /
 * ZER-111) evaluates those lists against {@link ConfigService} /
 * {@link PlatformService} so a missing secret or toolchain fails before any
 * step runs.
 */

import type { ResolvedStep, Requirement } from "./StepContract"

/**
 * A single requirement entry — one declared key annotated with the step that
 * asked for it. The `stepName` is the {@link ResolvedStep.name} (workflow-bound,
 * possibly aliased), chosen so pre-flight error messages point at the
 * workflow-visible name a user sees in their config.
 */
export interface RequirementEntry {
  readonly stepName: string
  readonly key: string
}

/**
 * Pipeline-wide summary of every step's declared requirements, grouped by kind.
 *
 * Entries preserve the order of the input `steps` array; within a single step
 * they preserve the order of the declared {@link Requirement} array. This makes
 * pre-flight error output deterministic and easy for a user to correlate with
 * their workflow definition.
 */
export interface Requirements {
  readonly secrets: ReadonlyArray<RequirementEntry>
  readonly toolchains: ReadonlyArray<RequirementEntry>
  readonly env: ReadonlyArray<RequirementEntry>
}

/**
 * Resolve one {@link Requirement} slot against the step's bound options.
 *
 * - `undefined` → empty (the step declared nothing for this kind).
 * - function → invoked with the raw bound options; dynamic keys can reference
 *   option values (e.g. `APPLE_API_KEY_${opts.teamId}`).
 * - array → returned as-is.
 */
function resolveOne(
  req: Requirement<Record<string, unknown>> | undefined,
  options: Record<string, unknown>
): ReadonlyArray<string> {
  if (req === undefined) return []
  if (typeof req === "function") return req(options)
  return req
}

/**
 * Collect every step's declared requirements into three flat, step-annotated
 * lists.
 *
 * Static arrays are taken verbatim; function-valued requirements are invoked
 * with each step's bound options (from {@link ResolvedStep.options}). Each
 * emitted {@link RequirementEntry} is tagged with the step's workflow-bound
 * name so downstream consumers (pre-flight, diagnostics) can attribute a
 * missing key back to its declaring step.
 */
export function gatherRequirements(steps: ReadonlyArray<ResolvedStep>): Requirements {
  const secrets: RequirementEntry[] = []
  const toolchains: RequirementEntry[] = []
  const env: RequirementEntry[] = []

  for (const step of steps) {
    for (const key of resolveOne(step.plugin.requiredSecrets, step.options)) {
      secrets.push({ stepName: step.name, key })
    }
    for (const key of resolveOne(step.plugin.requiredToolchains, step.options)) {
      toolchains.push({ stepName: step.name, key })
    }
    for (const key of resolveOne(step.plugin.requiredEnv, step.options)) {
      env.push({ stepName: step.name, key })
    }
  }

  return { secrets, toolchains, env }
}
