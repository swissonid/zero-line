import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ArtifactService, type Artifact } from "./ArtifactService"

describe("ArtifactService", () => {
  test("can store and retrieve artifacts", () => {
    const store = new Map<string, Artifact>()
    const testArtifacts = Layer.succeed(ArtifactService, {
      put: (key: string, artifact: Artifact) =>
        Effect.sync(() => { store.set(key, artifact) }),
      get: (key: string) =>
        Effect.sync(() => store.get(key)),
      list: () =>
        Effect.sync(() => Array.from(store.keys())),
    })

    const program = Effect.gen(function* () {
      const artifacts = yield* ArtifactService
      yield* artifacts.put("build", { type: "file", path: "/tmp/app.ipa" })
      const retrieved = yield* artifacts.get("build")
      return retrieved
    })

    const result = Effect.runSync(Effect.provide(program, testArtifacts))
    expect(result).toEqual({ type: "file", path: "/tmp/app.ipa" })
  })
})
