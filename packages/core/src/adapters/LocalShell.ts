import { Effect, Layer } from "effect"
import {
  ShellService,
  ShellError,
  type ShellResult,
  type ShellSpawnOptions,
} from "../ports/ShellService"

/**
 * Run a single subprocess once, collecting its stdout, stderr, and exit code.
 *
 * Uses Bun.spawn directly (not Node's child_process) so that `@zl/core` stays
 * a Bun-native runtime. The caller is expected to have already validated that
 * `opts.argv` is non-empty; we double-check here and throw a typed
 * {@link ShellError} if the invariant is violated so the Effect wrapper can
 * forward it untouched.
 */
async function runOnce(opts: ShellSpawnOptions): Promise<ShellResult> {
  const [command, ...args] = opts.argv
  if (!command) {
    throw new ShellError({
      code: "EMPTY_ARGV",
      message: "argv must have at least one entry",
    })
  }
  const proc = Bun.spawn([command, ...args], {
    cwd: opts.cwd,
    env: opts.env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { exitCode, stdout, stderr }
}

/**
 * `LocalShellLive` — the local-process implementation of the
 * {@link ShellService} port.
 *
 * Happy-path behaviour:
 * - Spawns `opts.argv[0]` with the remaining entries as arguments.
 * - Streams stdout/stderr into in-memory strings (suitable for short-lived
 *   step commands; long-running interactive processes are out of scope for
 *   M-A1).
 * - Returns a {@link ShellResult} on a zero exit code.
 *
 * Failure modes:
 * - Empty `argv` → `ShellError("EMPTY_ARGV")`.
 * - Process spawn throws (e.g. binary not found) → `ShellError("SPAWN_FAILED")`.
 * - Process exits non-zero → `ShellError("NON_ZERO_EXIT")` with the exit code
 *   attached.
 *
 * Cancellation and timeout handling are intentionally deferred to Task 8 of
 * the M-A1 core hardening plan.
 */
export const LocalShellLive = Layer.succeed(ShellService, {
  spawn: (opts) =>
    Effect.tryPromise({
      try: () => runOnce(opts),
      catch: (err) =>
        err instanceof ShellError
          ? err
          : new ShellError({
              code: "SPAWN_FAILED",
              message: err instanceof Error ? err.message : String(err),
              cause: err,
            }),
    }).pipe(
      Effect.flatMap((result) =>
        result.exitCode === 0
          ? Effect.succeed(result)
          : Effect.fail(
              new ShellError({
                code: "NON_ZERO_EXIT",
                message: `Command '${opts.argv.join(" ")}' exited with ${result.exitCode}`,
                exitCode: result.exitCode,
              })
            )
      )
    ),
})
