import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { ShellService } from "../ports/ShellService"
import { LocalShellLive } from "./LocalShell"

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
})
