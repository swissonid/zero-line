import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ShellService, ShellError, type ShellResult } from "../ports/ShellService"
import { SecretStore } from "../ports/SecretStore"
import { MacOSKeychainSecretStoreLive } from "./MacOSKeychainSecretStore"

/**
 * Stub `ShellService` layer used by every test here. The handler is a plain
 * function that maps the invoked argv to either a synthetic {@link ShellResult}
 * (success path) or a {@link ShellError} (failure path). Returning a
 * `ShellError` lets tests exercise `Effect.mapError` in the adapter without
 * spawning the real `security(1)` binary — the whole point of this file is to
 * keep CI off the developer's keychain.
 */
const stubShell = (
  handler: (argv: ReadonlyArray<string>) => ShellResult | ShellError
) =>
  Layer.succeed(ShellService, {
    spawn: (opts) => {
      const out = handler(opts.argv)
      return out instanceof ShellError
        ? Effect.fail(out)
        : Effect.succeed(out)
    },
  })

describe("MacOSKeychainSecretStoreLive", () => {
  test("set() calls `security add-generic-password -s zl -a <key> -w <value> -U`", async () => {
    let seen: ReadonlyArray<string> = []
    const shell = stubShell((argv) => {
      seen = argv
      return { exitCode: 0, stdout: "", stderr: "" }
    })
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      yield* store.set("APPLE_API_KEY", "secret-value")
    })
    await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(seen).toEqual([
      "security",
      "add-generic-password",
      "-s",
      "zl",
      "-a",
      "APPLE_API_KEY",
      "-w",
      "secret-value",
      "-U",
    ])
  })

  test("set() maps a `security` failure to WRITE_FAILED", async () => {
    const shell = stubShell(
      () =>
        new ShellError({
          code: "NON_ZERO_EXIT",
          message: "security: SecKeychainItemCreateFromContent: permission denied",
          exitCode: 45,
        })
    )
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      yield* store.set("APPLE_API_KEY", "v")
    })
    const exit = await Effect.runPromiseExit(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("WRITE_FAILED")
    }
  })

  test("get() returns the keychain value verbatim, stripping a trailing newline", async () => {
    const shell = stubShell(() => ({
      exitCode: 0,
      stdout: "my-secret-value\n",
      stderr: "",
    }))
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.get("APPLE_API_KEY")
    })
    const value = await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(value).toBe("my-secret-value")
  })

  test("get() calls `security find-generic-password -s zl -a <key> -w`", async () => {
    let seen: ReadonlyArray<string> = []
    const shell = stubShell((argv) => {
      seen = argv
      return { exitCode: 0, stdout: "x\n", stderr: "" }
    })
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.get("APPLE_API_KEY")
    })
    await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(seen).toEqual([
      "security",
      "find-generic-password",
      "-s",
      "zl",
      "-a",
      "APPLE_API_KEY",
      "-w",
    ])
  })

  test("get() maps a 'could not be found' shell error to NOT_FOUND", async () => {
    const shell = stubShell(
      () =>
        new ShellError({
          code: "NON_ZERO_EXIT",
          message:
            "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.",
          exitCode: 44,
        })
    )
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.get("missing")
    })
    const exit = await Effect.runPromiseExit(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const json = JSON.stringify(exit.cause)
      expect(json).toContain("NOT_FOUND")
      expect(json).not.toContain("READ_FAILED")
    }
  })

  test("get() maps a generic shell error (not a missing item) to READ_FAILED", async () => {
    const shell = stubShell(
      () =>
        new ShellError({
          code: "NON_ZERO_EXIT",
          message: "security: user interaction not allowed",
          exitCode: 36,
        })
    )
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.get("APPLE_API_KEY")
    })
    const exit = await Effect.runPromiseExit(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("READ_FAILED")
    }
  })

  test("delete() calls `security delete-generic-password` and succeeds on exit 0", async () => {
    let seen: ReadonlyArray<string> = []
    const shell = stubShell((argv) => {
      seen = argv
      return { exitCode: 0, stdout: "", stderr: "" }
    })
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      yield* store.delete("APPLE_API_KEY")
    })
    await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(seen).toEqual([
      "security",
      "delete-generic-password",
      "-s",
      "zl",
      "-a",
      "APPLE_API_KEY",
    ])
  })

  test("delete() maps a 'could not be found' shell error to NOT_FOUND", async () => {
    const shell = stubShell(
      () =>
        new ShellError({
          code: "NON_ZERO_EXIT",
          message:
            "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.",
          exitCode: 44,
        })
    )
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      yield* store.delete("missing")
    })
    const exit = await Effect.runPromiseExit(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("NOT_FOUND")
    }
  })

  test("list() parses `security dump-keychain` and returns zl-scoped account names", async () => {
    const dump = `
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="other"
    "acct"<blob>="ignored"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="zl"
    "acct"<blob>="APPLE_API_KEY"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="zl"
    "acct"<blob>="PLAY_SERVICE_ACCOUNT"
`
    const shell = stubShell(() => ({ exitCode: 0, stdout: dump, stderr: "" }))
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.list()
    })
    const keys = await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect([...keys].sort()).toEqual(["APPLE_API_KEY", "PLAY_SERVICE_ACCOUNT"])
  })

  test("list() returns an empty array when no zl-scoped entries are present", async () => {
    const dump = `
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="other"
    "acct"<blob>="ignored"
`
    const shell = stubShell(() => ({ exitCode: 0, stdout: dump, stderr: "" }))
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.list()
    })
    const keys = await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect([...keys]).toEqual([])
  })

  test("list() deduplicates repeated (svce,acct) pairs", async () => {
    const dump = `
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="zl"
    "acct"<blob>="APPLE_API_KEY"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="zl"
    "acct"<blob>="APPLE_API_KEY"
`
    const shell = stubShell(() => ({ exitCode: 0, stdout: dump, stderr: "" }))
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.list()
    })
    const keys = await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect([...keys]).toEqual(["APPLE_API_KEY"])
  })

  test("list() maps a shell failure to LIST_FAILED", async () => {
    const shell = stubShell(
      () =>
        new ShellError({
          code: "NON_ZERO_EXIT",
          message: "security: could not open keychain",
          exitCode: 1,
        })
    )
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.list()
    })
    const exit = await Effect.runPromiseExit(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("LIST_FAILED")
    }
  })
})
