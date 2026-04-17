import { Deferred, Duration, Effect, Fiber, Layer } from "effect"
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
 * Minimal, structural subset of `Bun.Subprocess` that {@link runWithProcess}
 * depends on. Pulling this out as an interface lets tests swap in a fake in
 * `LocalShell.test.ts` without spawning a real OS process — we only need to
 * observe `kill` calls and drive the lifecycle of `proc.exited` /
 * `proc.stdout` / `proc.stderr`.
 */
export interface SpawnedProcess {
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array>
  readonly exited: Promise<number>
  readonly kill: (signal: "SIGTERM" | "SIGKILL") => void
}

/**
 * Low-level primitive that drives an already-spawned process to completion
 * inside the Effect runtime.
 *
 * The outcome is gated by a single {@link Deferred} — Effect's single-shot
 * completion primitive — which replaces the ad-hoc `settled: boolean` flag
 * the original `Effect.async` implementation used to protect `resume` from a
 * multi-way race (process-exit / timeout / caller-interrupt).
 *
 * Cooperating fibers:
 *
 * 1. **Collect fiber** — awaits stdout/stderr/exit. On exit-0 it succeeds the
 *    deferred with a {@link ShellResult}; on any non-zero exit it fails with
 *    `ShellError("NON_ZERO_EXIT")`.
 * 2. **Timeout fiber** (only when `opts.timeoutMs` is set) — sleeps, then
 *    fails the deferred with `ShellError("TIMEOUT")` and forks the
 *    SIGTERM→SIGKILL escalation as a daemon.
 * 3. **Kill-escalation fiber** (forked on timeout or on caller interrupt) —
 *    sends SIGTERM, then waits for either `proc.exited` to resolve or the
 *    grace period to elapse. Only if the timer wins does it send SIGKILL.
 *    The escalation is forked as a daemon so it outlives the main fiber's
 *    interrupt finalizer, but lives inside {@link Effect.async} so the timer
 *    is still tracked by the Effect runtime (and cleaned up via the
 *    returned finalizer if the daemon itself is interrupted).
 *
 * `Effect.ensuring` interrupts the collect and timeout fibers once the main
 * fiber leaves (whether via success, failure, or interrupt), so no dangling
 * Effect work outlives the returned Effect.
 */
export const runWithProcess = Effect.fn("LocalShell.runWithProcess")(
  function* (opts: ShellSpawnOptions, proc: SpawnedProcess) {
    const deferred = yield* Deferred.make<ShellResult, ShellError>()

    /**
     * Sends SIGTERM, waits for either `proc.exited` to resolve or the grace
     * period to expire, and (only in the latter case) escalates to SIGKILL.
     *
     * We could not model the "race between process-exit and grace period"
     * with `Effect.race` / `Effect.timeout` here: observation shows those
     * primitives do not reliably fire their sleep branch inside a daemon
     * fiber once the main Bun test fiber has completed. `Effect.async`
     * hand-rolls the equivalent race via a native `setTimeout` + a `.then()`
     * subscription on `proc.exited`, but crucially the timer is scoped to
     * the Effect: if this fiber is interrupted, the returned finalizer
     * clears the timer — no leaked `setTimeout` like the pre-refactor
     * implementation had.
     */
    const killEscalation = Effect.gen(function* () {
      try {
        proc.kill("SIGTERM")
      } catch {
        // process already exited / reaped (ESRCH) — nothing to do
      }

      const exitedCleanly = yield* Effect.async<boolean>((resume) => {
        let done = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const finishWith = (exited: boolean) => {
          if (done) return
          done = true
          if (timer !== undefined) clearTimeout(timer)
          resume(Effect.succeed(exited))
        }
        proc.exited.then(
          () => finishWith(true),
          () => finishWith(true)
        )
        timer = setTimeout(() => finishWith(false), SIGTERM_GRACE_MS)
        return Effect.sync(() => {
          if (done) return
          done = true
          if (timer !== undefined) clearTimeout(timer)
        })
      })

      if (!exitedCleanly) {
        try {
          proc.kill("SIGKILL")
        } catch {
          // process already exited / reaped (ESRCH) — nothing to do
        }
      }
    })

    const collectFiber = yield* Effect.fork(
      Effect.tryPromise({
        try: () =>
          Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
          ]),
        catch: (err) =>
          new ShellError({
            code: "SPAWN_FAILED",
            message: err instanceof Error ? err.message : String(err),
            cause: err,
          }),
      }).pipe(
        Effect.flatMap(([stdout, stderr, exitCode]) =>
          exitCode === 0
            ? Deferred.succeed(deferred, { exitCode, stdout, stderr })
            : Deferred.fail(
                deferred,
                new ShellError({
                  code: "NON_ZERO_EXIT",
                  message:
                    `Command '${opts.argv.join(" ")}' exited with ${exitCode}` +
                    (stderr ? `\nstderr: ${stderr}` : ""),
                  exitCode,
                })
              )
        ),
        Effect.catchAll((err) => Deferred.fail(deferred, err))
      )
    )

    const timeoutFiber =
      opts.timeoutMs !== undefined
        ? yield* Effect.fork(
            Effect.sleep(Duration.millis(opts.timeoutMs)).pipe(
              Effect.andThen(
                Effect.all([
                  Deferred.fail(
                    deferred,
                    new ShellError({
                      code: "TIMEOUT",
                      message: `Command '${opts.argv.join(" ")}' timed out after ${opts.timeoutMs}ms`,
                    })
                  ),
                  // Daemon so the kill escalation survives this fiber being
                  // interrupted by the `ensuring` block once the main await
                  // resolves with TIMEOUT.
                  Effect.forkDaemon(killEscalation),
                ])
              )
            )
          )
        : undefined

    const result = yield* Deferred.await(deferred).pipe(
      Effect.onInterrupt(() =>
        // On caller-interrupt we fork the escalation as a daemon — the
        // current fiber is being torn down so a plain `fork` would be
        // interrupted immediately along with its parent.
        Effect.forkDaemon(killEscalation).pipe(Effect.asVoid)
      ),
      Effect.ensuring(
        Effect.all([
          Fiber.interrupt(collectFiber),
          timeoutFiber ? Fiber.interrupt(timeoutFiber) : Effect.void,
        ])
      )
    )

    return result
  }
)

/**
 * Validates `opts.argv`, spawns the subprocess via `Bun.spawn`, then hands
 * off to {@link runWithProcess}. Exposed separately so tests can exercise
 * the post-spawn logic against a fake {@link SpawnedProcess} without
 * actually forking an OS process.
 */
const spawnEffect = Effect.fn("LocalShell.spawn")(function* (
  opts: ShellSpawnOptions
) {
  const [command, ...args] = opts.argv
  if (!command) {
    return yield* Effect.fail(
      new ShellError({
        code: "EMPTY_ARGV",
        message: "argv must have at least one entry",
      })
    )
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
    return yield* Effect.fail(
      new ShellError({
        code: "SPAWN_FAILED",
        message: err instanceof Error ? err.message : String(err),
        cause: err,
      })
    )
  }

  return yield* runWithProcess(opts, proc)
})

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
 *   {@link SIGTERM_GRACE_MS}ms grace period — but the SIGKILL is skipped if
 *   the process exits cleanly inside that window.
 *
 * Cancellation:
 * - On `Effect.interrupt` of the fiber running `spawn`, the subprocess is
 *   sent SIGTERM followed by SIGKILL after the same grace period (same
 *   clean-exit skip). The fiber completes as an interrupt rather than a
 *   typed failure.
 */
export const LocalShellLive = Layer.succeed(ShellService, {
  spawn: (opts) => spawnEffect(opts),
})
