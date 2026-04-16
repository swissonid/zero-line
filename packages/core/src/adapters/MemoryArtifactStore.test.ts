import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { ArtifactService } from "../ports/ArtifactService"
import { MemoryArtifactStoreLive } from "./MemoryArtifactStore"

describe("MemoryArtifactStore", () => {
  test("stores and retrieves artifacts", async () => {
    const program = Effect.gen(function* () {
      const artifacts = yield* ArtifactService
      yield* artifacts.put("ipa", { type: "file", path: "/tmp/app.ipa" })
      yield* artifacts.put("apk", { type: "file", path: "/tmp/app.apk" })
      const ipa = yield* artifacts.get("ipa")
      const keys = yield* artifacts.list()
      return { ipa, keys }
    })

    const result = await Effect.runPromise(Effect.provide(program, MemoryArtifactStoreLive))
    expect(result.ipa).toEqual({ type: "file", path: "/tmp/app.ipa" })
    expect(result.keys).toEqual(["ipa", "apk"])
  })

  test("get returns undefined for missing key", async () => {
    const program = Effect.gen(function* () {
      const artifacts = yield* ArtifactService
      return yield* artifacts.get("nonexistent")
    })

    const result = await Effect.runPromise(Effect.provide(program, MemoryArtifactStoreLive))
    expect(result).toBeUndefined()
  })
})
