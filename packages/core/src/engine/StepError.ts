export interface StepErrorInit {
  readonly code: string
  readonly message: string
  readonly cause?: unknown
}

// Plain class (not Data.TaggedError) for consistency with existing errors
// (ConfigLoadError, SecretNotFoundError). Revisit if Effect-native equality
// or Cause deduplication becomes needed post-v1.0.
export class StepError extends Error {
  readonly _tag = "StepError"
  readonly code: string

  constructor(init: StepErrorInit) {
    super(init.message, { cause: init.cause })
    this.name = "StepError"
    this.code = init.code
  }
}
