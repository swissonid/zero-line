import type { ResolvedStep } from "./StepContract"

export interface ValidationResult {
  readonly valid: boolean
  readonly error?: string
}

export interface LoadResult {
  readonly steps: ReadonlyArray<ResolvedStep>
  readonly errors: ReadonlyArray<string>
}

export function validateStep(step: unknown): ValidationResult {
  if (!step || typeof step !== "object") {
    return { valid: false, error: "Step must be an object" }
  }

  const s = step as Record<string, unknown>

  if (!s.name || typeof s.name !== "string") {
    return { valid: false, error: "Step must have a non-empty 'name' string" }
  }

  if (s._tag === "simple" && typeof s.execute !== "function") {
    return { valid: false, error: `Step '${s.name}' is a simple step but has no 'execute' function` }
  }

  if (s._tag === "effect" && typeof s.run !== "function") {
    return { valid: false, error: `Step '${s.name}' is an effect step but has no 'run' function` }
  }

  if (!s._tag) {
    return { valid: false, error: `Step '${s.name}' has no _tag (use defineStep or defineEffectStep)` }
  }

  return { valid: true }
}

export function loadSteps(rawSteps: ReadonlyArray<unknown>): LoadResult {
  const steps: ResolvedStep[] = []
  const errors: string[] = []

  for (const raw of rawSteps) {
    const validation = validateStep(raw)
    if (validation.valid) {
      steps.push(raw as ResolvedStep)
    } else {
      errors.push(validation.error!)
    }
  }

  return { steps, errors }
}
