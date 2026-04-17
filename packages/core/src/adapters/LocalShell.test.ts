import { describe, test, expect } from "bun:test"
import { Effect, Fiber } from "effect"
import { ShellService } from "../ports/ShellService"
import { LocalShellLive, runWithProcess, type SpawnedProcess } from "./LocalShell"

const runWithShell = <A, E>(eff: Effect.Effect<A, E, ShellService>) =>
  Effect.runPromise(Effect.provide(eff, LocalShellLive))

describe("LocalShell", () => {
  test("spawns a successful command and returns stdout", async () => {
    const result = await runWithShell(
      Effect.gen(function* () {
        const sh = yield* ShellService
        return yield* sh.spawn({ argv: ["echo", "hello"] })
      })
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("hello")
  })

  test("fails with NON_ZERO_EXIT on a failing command", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const sh = yield* ShellService
          return yield* sh.spawn({ argv: ["false"] })
        }),
        LocalShellLive
      )
    )
    expect(exit._tag).toBe("Failure")
    const text = JSON.stringify(exit)
    expect(text).toContain("NON_ZERO_EXIT")
  })

  test("streams stderr content back in the result", async () => {
    const result = await runWithShell(
      Effect.gen(function* () {
        const sh = yield* ShellService
        return yield* sh.spawn({
          argv: ["sh", "-c", "echo out; echo err 1>&2"],
        })
      })
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("out")
    expect(result.stderr.trim()).toBe("err")
  })

  test("fails with EMPTY_ARGV when argv is empty", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const sh = yield* ShellService
          return yield* sh.spawn({ argv: [] })
        }),
        LocalShellLive
      )
    )
    expect(exit._tag).toBe("Failure")
    const text = JSON.stringify(exit)
    expect(text).toContain("EMPTY_ARGV")
  })

  test("fails with SPAWN_FAILED when the binary cannot be executed", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const sh = yield* ShellService
          return yield* sh.spawn({
            argv: ["/nonexistent/binary/path-zl-localshell-test"],
          })
        }),
        LocalShellLive
      )
    )
    expect(exit._tag).toBe("Failure")
    const text = JSON.stringify(exit)
    expect(text).toContain("SPAWN_FAILED")
  })

  test("respects cwd when provided", async () => {
    const result = await runWithShell(
      Effect.gen(function* () {
        const sh = yield* ShellService
        return yield* sh.spawn({ argv: ["pwd"], cwd: "/" })
      })
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("/")
  })

  test("passes env vars through to the subprocess", async () => {
    const result = await runWithShell(
      Effect.gen(function* () {
        const sh = yield* ShellService
        return yield* sh.spawn({
          argv: ["sh", "-c", "echo $ZL_SHELL_TEST_VAR"],
          env: { ZL_SHELL_TEST_VAR: "zl-value-42", PATH: process.env.PATH ?? "" },
        })
      })
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("zl-value-42")
  })

  test("honours Effect.interrupt by killing the subprocess (SIGTERM)", async () => {
    const program = Effect.gen(function* () {
      const sh = yield* ShellService
      return yield* sh.spawn({ argv: ["sleep", "10"] })
    })

    const start = Date.now()
    const fiber = Effect.runFork(Effect.provide(program, LocalShellLive))
    // 100 ms is a heuristic: gives the Bun subprocess time to reach the kernel
    // `sleep` syscall and for the Effect finalizer to register before we
    // interrupt. On very slow hosts this may need to be increased. A fully
    // robust version would pipe a ready-signal out of the subprocess, but
    // that adds stream-handling complexity for a test-only concern.
    await new Promise((r) => setTimeout(r, 100))
    const exit = await Effect.runPromise(Fiber.interrupt(fiber))
    const elapsed = Date.now() - start
    // exit should come quickly (under 2s), not wait for sleep 10 to finish
    expect(exit._tag).toBe("Failure")
    expect(elapsed).toBeLessThan(2000)
  })

  test("times out after timeoutMs with structured error", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const sh = yield* ShellService
          return yield* sh.spawn({ argv: ["sleep", "5"], timeoutMs: 250 })
        }),
        LocalShellLive
      )
    )
    expect(exit._tag).toBe("Failure")
    expect(JSON.stringify(exit)).toContain("TIMEOUT")
  })

  /**
   * A manually-controllable fake {@link SpawnedProcess}. The test resolves
   * `exitedResolve(code)` when it wants the "process" to exit, and inspects
   * `killCalls` to assert which signals were delivered.
   *
   * `stdout` / `stderr` are empty streams that close immediately — we only
   * care about the exit/kill lifecycle for these tests.
   */
  function makeFakeProc(): {
    proc: SpawnedProcess
    killCalls: Array<"SIGTERM" | "SIGKILL">
    exitedResolve: (code: number) => void
  } {
    const killCalls: Array<"SIGTERM" | "SIGKILL"> = []
    let exitedResolve!: (code: number) => void
    const exited = new Promise<number>((resolve) => {
      exitedResolve = resolve
    })
    const emptyStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close()
        },
      })
    const proc: SpawnedProcess = {
      stdout: emptyStream(),
      stderr: emptyStream(),
      exited,
      kill: (signal) => {
        killCalls.push(signal)
      },
    }
    return { proc, killCalls, exitedResolve }
  }

  test("SIGKILL escalation is interrupted when the process exits cleanly inside the grace period", async () => {
    const { proc, killCalls, exitedResolve } = makeFakeProc()

    const fiber = Effect.runFork(runWithProcess({ argv: ["fake"] }, proc))

    // Give the Effect runtime a moment to reach `Deferred.await` and
    // register the `onInterrupt` hook before we pull the interrupt.
    await new Promise((r) => setTimeout(r, 50))

    // Interrupt: this runs `onInterrupt`, which forks the kill-escalation
    // daemon. The daemon synchronously sends SIGTERM, then waits up to
    // SIGTERM_GRACE_MS for `proc.exited` to resolve before escalating.
    const exitPromise = Effect.runPromise(Fiber.interrupt(fiber))

    // Wait long enough for SIGTERM to be delivered, but comfortably inside
    // the 1_000ms grace period.
    await new Promise((r) => setTimeout(r, 200))
    expect(killCalls).toEqual(["SIGTERM"])

    // Process exits cleanly mid-grace-period. The daemon's exit
    // subscription fires, the escalation finishes without ever sending
    // SIGKILL, and the `setTimeout` it scheduled is cleared by the
    // `Effect.async` cleanup.
    exitedResolve(0)

    await exitPromise

    // Wait past the full grace period to confirm the SIGKILL branch was
    // genuinely skipped (not just delayed).
    await new Promise((r) => setTimeout(r, 1_200))

    expect(killCalls).toEqual(["SIGTERM"])
    expect(killCalls).not.toContain("SIGKILL")
  })

  test("SIGKILL escalation still fires when the process hangs past the grace period", async () => {
    const { proc, killCalls, exitedResolve } = makeFakeProc()

    const fiber = Effect.runFork(runWithProcess({ argv: ["fake"] }, proc))
    await new Promise((r) => setTimeout(r, 50))

    const exitPromise = Effect.runPromise(Fiber.interrupt(fiber))

    // Wait past the 1_000ms grace period. The process hasn't exited, so
    // the escalation's timer fires and SIGKILL is delivered.
    await new Promise((r) => setTimeout(r, 1_200))

    expect(killCalls).toEqual(["SIGTERM", "SIGKILL"])

    // Let the fake process exit so the main fiber's interrupt finalizers
    // can complete and the test can clean up.
    exitedResolve(143)
    await exitPromise
  })
})
