import { Context, Effect } from "effect"
import type { Platform } from "../config/ConfigTypes"

export type OS = "darwin" | "linux" | "win32"
export type Toolchain = "xcode" | "android-sdk" | "gradle"

export interface IPlatformService {
  readonly os: () => Effect.Effect<OS>
  readonly availableToolchains: () => Effect.Effect<ReadonlyArray<Toolchain>>
  readonly supports: (platform: Platform) => Effect.Effect<boolean>
}

export class PlatformService extends Context.Tag("PlatformService")<
  PlatformService,
  IPlatformService
>() {}
