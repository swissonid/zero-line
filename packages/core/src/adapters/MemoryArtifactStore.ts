import { Effect, Layer } from "effect"
import { ArtifactService, type Artifact } from "../ports/ArtifactService"

export const MemoryArtifactStoreLive = Layer.effect(
  ArtifactService,
  Effect.sync(() => {
    const store = new Map<string, Artifact>()
    return {
      put: (key: string, artifact: Artifact) =>
        Effect.sync(() => { store.set(key, artifact) }),
      get: (key: string) =>
        Effect.sync(() => store.get(key)),
      list: () =>
        Effect.sync(() => Array.from(store.keys())),
    }
  })
)
