import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { SecretStore, SecretStoreError } from "./SecretStore"

describe("SecretStore port", () => {
  test("SecretStore is an Effect Context.Tag", () => {
    expect(SecretStore.key).toBe("SecretStore")
  })

  test("can be constructed and invoked via Effect (get/set/list/delete roundtrip)", async () => {
    const store = new Map<string, string>()
    store.set("present", "value")

    const testStore = Layer.succeed(SecretStore, {
      set: (key: string, value: string) =>
        Effect.sync(() => {
          store.set(key, value)
        }),
      get: (key: string) => {
        const v = store.get(key)
        return v === undefined
          ? Effect.fail(
              new SecretStoreError({
                code: "NOT_FOUND",
                message: `no such key: ${key}`,
              })
            )
          : Effect.succeed(v)
      },
      list: () => Effect.succeed([...store.keys()]),
      delete: (key: string) =>
        Effect.sync(() => {
          store.delete(key)
        }),
    })

    const program = Effect.gen(function* () {
      const secrets = yield* SecretStore
      yield* secrets.set("new-key", "new-value")
      const keys = yield* secrets.list()
      const got = yield* secrets.get("present")
      yield* secrets.delete("present")
      const afterDelete = yield* secrets.list()
      return { got, keys, afterDelete }
    })

    const result = await Effect.runPromise(Effect.provide(program, testStore))
    expect(result.got).toBe("value")
    expect(result.keys).toContain("present")
    expect(result.keys).toContain("new-key")
    expect(result.afterDelete).not.toContain("present")
    expect(result.afterDelete).toContain("new-key")
  })

  test("SecretStoreError carries _tag, code, message, cause", () => {
    const underlying = new Error("errSecDuplicateItem")
    const err = new SecretStoreError({
      code: "WRITE_FAILED",
      message: "permission denied",
      cause: underlying,
    })
    expect(err._tag).toBe("SecretStoreError")
    expect(err.code).toBe("WRITE_FAILED")
    expect(err.message).toBe("permission denied")
    expect(err.cause).toBe(underlying)
  })

  test("SecretStoreError fails Effects with a typed channel", async () => {
    const program = Effect.gen(function* () {
      return yield* Effect.fail(
        new SecretStoreError({ code: "NOT_FOUND", message: "missing" })
      )
    })

    const exit = await Effect.runPromiseExit(program)
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const failure = exit.cause
      // Structural: Data.TaggedError roundtrips through Cause.
      const json = JSON.stringify(failure)
      expect(json).toContain("SecretStoreError")
      expect(json).toContain("NOT_FOUND")
      expect(json).toContain("missing")
    }
  })
})
