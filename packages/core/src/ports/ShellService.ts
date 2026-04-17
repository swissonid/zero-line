import { Context, Data, Effect } from "effect"

export interface ShellSpawnOptions {
  readonly argv: ReadonlyArray<string>
  readonly cwd?: string
  readonly env?: Record<string, string>
  readonly timeoutMs?: number
}

export interface ShellResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

/**
 * Typed failure produced by a {@link ShellService} invocation.
 *
 * Built on `Data.TaggedError` for structural equality (Cause
 * deduplication) and an enumerable `.message` that survives
 * `JSON.stringify`. `code` is intentionally `string`, not a union — step
 * authors invent their own codes (e.g. "XCODEBUILD_FAILED",
 * "GRADLE_TIMEOUT") so the port can't enumerate them upfront.
 */
export class ShellError extends Data.TaggedError("ShellError")<{
  readonly code: string
  readonly message: string
  readonly exitCode?: number
  readonly cause?: unknown
}> {}

export interface IShellService {
  readonly spawn: (
    opts: ShellSpawnOptions
  ) => Effect.Effect<ShellResult, ShellError>
}

export class ShellService extends Context.Tag("ShellService")<
  ShellService,
  IShellService
>() {}
