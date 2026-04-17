import { Effect, Layer } from "effect"
import {
  ShellService,
  ShellError,
  type ShellResult,
  type ShellSpawnOptions,
} from "../ports/ShellService"

/**
 * Grace period (milliseconds) we grant a subprocess to exit cleanly after we
 * send SIGTERM before escalating to SIGKILL. One second is plenty for
 * well-behaved tools (`xcodebuild`, `gradle`, shell scripts) to flush output
 * and release locks, but short enough that an interrupted fiber still feels
 * responsive to the caller.
 */
const SIGTERM_GRACE_MS = 1_000

/**
 * Low-level primitive that wraps a single `Bun.spawn` invocation in an
 * `Effect.async`, threading cancellation and timeout handling through the
 * fiber.
 *
 * The effect completes in one of three ways:
 * 1. The subprocess exits on its own. Exit code 0 → `ShellResult`; any other
 *    code → `ShellError("NON_ZERO_EXIT")`.
 * 2. `opts.timeoutMs` elapses first. We SIGTERM (with a SIGKILL escalation
 *    after {@link SIGTERM_GRACE_MS}) and fail with
 *    `ShellError("TIMEOUT")`.
 * 3. The caller interrupts the fiber. Same SIGTERM→SIGKILL sequence; the
 *    fiber completes as an interrupt (no custom ShellError — Effect's own
 *    interrupt signal carries the meaning).
 *
 * `settled` is the single source of truth for "which path won the race"; it
 * prevents us from calling `resume` twice or killing a process that already
 * exited.
 */
function spawnEffect(
  opts: ShellSpawnOptions
): Effect.Effect<ShellResult, ShellError> {
  return Effect.async<ShellResult, ShellError>((resume) => {
    const [command, ...args] = opts.argv
    if (!command) {
      resume(
        Effect.fail(
          new ShellError({
            code: "EMPTY_ARGV",
            message: "argv must have at least one entry",
          })
        )
      )
      return
    }

    let settled = false
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    let killEscalationHandle: ReturnType<typeof setTimeout> | undefined

    const clearTimers = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle)
      if (killEscalationHandle) clearTimeout(killEscalationHandle)
    }

    let proc: ReturnType<typeof Bun.spawn<"ignore", "pipe", "pipe">>
    try {
      proc = Bun.spawn([command, ...args], {
        cwd: opts.cwd,
        env: opts.env,
        stdout: "pipe",
        stderr: "pipe",
      })
    } catch (err) {
      settled = true
      resume(
        Effect.fail(
          new ShellError({
            code: "SPAWN_FAILED",
            message: err instanceof Error ? err.message : String(err),
            cause: err,
          })
        )
      )
      return
    }

    Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
      .then(([stdout, stderr, exitCode]) => {
        if (settled) return
        settled = true
        clearTimers()
        if (exitCode === 0) {
          resume(Effect.succeed({ exitCode, stdout, stderr }))
        } else {
          resume(
            Effect.fail(
              new ShellError({
                code: "NON_ZERO_EXIT",
                message:
                  `Command '${opts.argv.join(" ")}' exited with ${exitCode}` +
                  (stderr ? `\nstderr: ${stderr}` : ""),
                exitCode,
              })
            )
          )
        }
      })
      .catch((err) => {
        if (settled) return
        settled = true
        clearTimers()
        resume(
          Effect.fail(
            new ShellError({
              code: "SPAWN_FAILED",
              message: err instanceof Error ? err.message : String(err),
              cause: err,
            })
          )
        )
      })

    if (opts.timeoutMs !== undefined) {
      timeoutHandle = setTimeout(() => {
        if (settled) return
        settled = true
        proc.kill("SIGTERM")
        killEscalationHandle = setTimeout(
          () => proc.kill("SIGKILL"),
          SIGTERM_GRACE_MS
        )
        resume(
          Effect.fail(
            new ShellError({
              code: "TIMEOUT",
              message: `Command '${opts.argv.join(" ")}' timed out after ${opts.timeoutMs}ms`,
            })
          )
        )
      }, opts.timeoutMs)
    }

    // Cancellation path: Effect calls this finalizer on interrupt. We signal
    // the subprocess with SIGTERM, schedule a SIGKILL escalation, and clear
    // any pending timeout timer so it can't fire after interrupt.
    return Effect.sync(() => {
      if (!settled) {
        settled = true
        proc.kill("SIGTERM")
        killEscalationHandle = setTimeout(
          () => proc.kill("SIGKILL"),
          SIGTERM_GRACE_MS
        )
      }
      if (timeoutHandle) clearTimeout(timeoutHandle)
    })
  })
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
 * - `opts.timeoutMs` elapses before exit → `ShellError("TIMEOUT")`. The
 *   subprocess receives SIGTERM immediately and SIGKILL after a
 *   {@link SIGTERM_GRACE_MS}ms grace period.
 *
 * Cancellation:
 * - On `Effect.interrupt` of the fiber running `spawn`, the subprocess is
 *   sent SIGTERM followed by SIGKILL after the same grace period. The fiber
 *   completes as an interrupt rather than a typed failure.
 */
export const LocalShellLive = Layer.succeed(ShellService, {
  spawn: (opts) => spawnEffect(opts),
})
