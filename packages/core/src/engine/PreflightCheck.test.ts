import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { defineStep } from "../step-loader/StepContract"
import type { ResolvedStep } from "../step-loader/StepContract"
import { preflightCheck } from "./PreflightCheck"
import { ConfigService, SecretNotFoundError } from "../ports/ConfigService"
import { PlatformService } from "../ports/PlatformService"
import type { IPlatformService, Toolchain } from "../ports/PlatformService"
import type { IConfigService } from "../ports/ConfigService"

const toResolved = (
  plugin: ReturnType<typeof defineStep>,
  options: Record<string, unknown> = {}
): ResolvedStep => ({
  plugin,
  name: plugin.name,
  dependsOnSteps: plugin.dependsOnSteps,
  options,
})

const stubConfig = (
  secrets: Record<string, string>,
  env: Record<string, string> = {}
): IConfigService => ({
  load: () => Effect.die("not used"),
  env: (k) => Effect.succeed(env[k]),
  secret: (k) =>
    k in secrets
      ? Effect.succeed(secrets[k]!)
      : Effect.fail(new SecretNotFoundError(k)),
})

const stubPlatform = (toolchains: ReadonlyArray<string>): IPlatformService => ({
  os: () => Effect.succeed("darwin"),
  availableToolchains: () =>
    Effect.succeed(toolchains as ReadonlyArray<Toolchain>),
  supports: () => Effect.succeed(true),
})

describe("preflightCheck", () => {
  test("passes when every declared requirement is present", async () => {
    const step = defineStep({
      name: "sign",
      requiredSecrets: ["API_KEY"],
      requiredToolchains: ["xcode"],
      run: async () => ({}),
    })
    const layer = Layer.mergeAll(
      Layer.succeed(ConfigService, stubConfig({ API_KEY: "v" })),
      Layer.succeed(PlatformService, stubPlatform(["xcode"]))
    )
    const exit = await Effect.runPromiseExit(
      Effect.provide(preflightCheck([toResolved(step)]), layer)
    )
    expect(exit._tag).toBe("Success")
  })

  test("fails listing every missing secret and step that declared it", async () => {
    const step1 = defineStep({
      name: "a",
      requiredSecrets: ["MISSING_1"],
      run: async () => ({}),
    })
    const step2 = defineStep({
      name: "b",
      requiredSecrets: ["MISSING_2"],
      run: async () => ({}),
    })
    const layer = Layer.mergeAll(
      Layer.succeed(ConfigService, stubConfig({})),
      Layer.succeed(PlatformService, stubPlatform([]))
    )
    const exit = await Effect.runPromiseExit(
      Effect.provide(preflightCheck([toResolved(step1), toResolved(step2)]), layer)
    )
    expect(exit._tag).toBe("Failure")
    const text = JSON.stringify(exit)
    expect(text).toContain("PREFLIGHT_MISSING_SECRETS")
    expect(text).toContain("MISSING_1")
    expect(text).toContain("MISSING_2")
    expect(text).toContain("step 'a'")
    expect(text).toContain("step 'b'")
  })

  test("fails with PREFLIGHT_MISSING_TOOLCHAINS when toolchain absent", async () => {
    const step = defineStep({
      name: "build",
      requiredToolchains: ["xcode"],
      run: async () => ({}),
    })
    const layer = Layer.mergeAll(
      Layer.succeed(ConfigService, stubConfig({})),
      Layer.succeed(PlatformService, stubPlatform([]))
    )
    const exit = await Effect.runPromiseExit(
      Effect.provide(preflightCheck([toResolved(step)]), layer)
    )
    expect(JSON.stringify(exit)).toContain("PREFLIGHT_MISSING_TOOLCHAINS")
  })

  test("fails with PREFLIGHT_MISSING_ENV when env var absent", async () => {
    const step = defineStep({
      name: "ci",
      requiredEnv: ["CI"],
      run: async () => ({}),
    })
    const layer = Layer.mergeAll(
      Layer.succeed(ConfigService, stubConfig({})),
      Layer.succeed(PlatformService, stubPlatform([]))
    )
    const exit = await Effect.runPromiseExit(
      Effect.provide(preflightCheck([toResolved(step)]), layer)
    )
    expect(JSON.stringify(exit)).toContain("PREFLIGHT_MISSING_ENV")
  })
})
