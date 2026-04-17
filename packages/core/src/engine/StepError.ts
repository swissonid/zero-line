import { Data } from "effect"

export interface StepErrorInit {
  readonly code: string
  readonly message: string
  readonly cause?: unknown
}

/**
 * Typed engine-layer error for step resolution, pre-flight checks, and
 * pipeline execution failures.
 *
 * Built on `Data.TaggedError` so it participates in Effect's structural
 * equality (enabling `Cause` deduplication) and exposes an enumerable
 * `.message` property that survives `JSON.stringify`. `.cause` is
 * optional — when provided, it preserves the original underlying error for
 * diagnostics.
 *
 * The `code` field is intentionally a plain `string` rather than a union:
 * step authors invent their own codes (e.g. `STEP_NOT_FOUND`,
 * `PREFLIGHT_MISSING_SECRETS`) so the engine can't enumerate them upfront.
 */
export class StepError extends Data.TaggedError("StepError")<{
  readonly code: string
  readonly message: string
  readonly cause?: unknown
}> {}
