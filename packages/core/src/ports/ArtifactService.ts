import { Context, Effect } from "effect"

export interface Artifact {
  readonly type: string
  readonly path: string
  readonly [key: string]: unknown
}

export interface IArtifactService {
  readonly put: (key: string, artifact: Artifact) => Effect.Effect<void>
  readonly get: (key: string) => Effect.Effect<Artifact | undefined>
  readonly list: () => Effect.Effect<ReadonlyArray<string>>
}

export class ArtifactService extends Context.Tag("ArtifactService")<
  ArtifactService,
  IArtifactService
>() {}
