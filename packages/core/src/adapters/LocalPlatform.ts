import { Effect, Layer } from "effect"
import { PlatformService, type OS, type Toolchain } from "../ports/PlatformService"
import type { Platform } from "../config/ConfigTypes"

let cachedToolchains: ReadonlyArray<Toolchain> | null = null

export function detectToolchains(): ReadonlyArray<Toolchain> {
  if (cachedToolchains !== null) return cachedToolchains
  const toolchains: Toolchain[] = []
  try {
    const result = Bun.spawnSync(["xcodebuild", "-version"])
    if (result.exitCode === 0) toolchains.push("xcode")
  } catch {}
  const home = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
  if (home) toolchains.push("android-sdk")
  try {
    const result = Bun.spawnSync(["gradle", "--version"])
    if (result.exitCode === 0) toolchains.push("gradle")
  } catch {}
  cachedToolchains = Object.freeze(toolchains)
  return cachedToolchains
}

export function platformSupports(platform: string): boolean {
  if (platform === "ios") return process.platform === "darwin"
  if (platform === "android") return true
  return false
}

export const LocalPlatformLive = Layer.succeed(PlatformService, {
  os: () => Effect.succeed(process.platform as OS),

  availableToolchains: () => Effect.sync(() => detectToolchains()),

  supports: (platform: Platform) => Effect.sync(() => platformSupports(platform)),
})
