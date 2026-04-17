import { Context, Effect } from "effect"

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

// Plain class (not Data.TaggedError) for consistency with existing errors.
// code is intentionally `string`, not a union — plugins define their own
// error codes (e.g. "XCODEBUILD_FAILED", "GRADLE_TIMEOUT") so the port
// can't enumerate them upfront.
export class ShellError {
  readonly _tag = "ShellError"
  readonly code: string
  readonly message: string
  readonly exitCode?: number
  readonly cause?: unknown

  constructor(init: {
    code: string
    message: string
    exitCode?: number
    cause?: unknown
  }) {
    this.code = init.code
    this.message = init.message
    this.exitCode = init.exitCode
    this.cause = init.cause
  }
}

export interface IShellService {
  readonly spawn: (
    opts: ShellSpawnOptions
  ) => Effect.Effect<ShellResult, ShellError>
}

export class ShellService extends Context.Tag("ShellService")<
  ShellService,
  IShellService
>() {}
