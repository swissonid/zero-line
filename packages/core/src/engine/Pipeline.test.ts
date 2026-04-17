import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { definePipeline, DefaultRuntimeLayer, makeDefaultContext } from "./Pipeline"
import { defineStep, defineEffectStep } from "../step-loader/StepContract"
import type { PluginStep, ResolvedStep } from "../step-loader/StepContract"
import { LoggerService } from "../ports/LoggerService"
import { ArtifactService } from "../ports/ArtifactService"
import { ConfigService, SecretNotFoundError } from "../ports/ConfigService"
import type { IConfigService } from "../ports/ConfigService"
import { PlatformService } from "../ports/PlatformService"
import type { IPlatformService, Toolchain } from "../ports/PlatformService"
import { StepError } from "./StepError"

// Helper: wrap a plugin step into a ResolvedStep with bound options. The
// Pipeline now iterates `ResolvedStep[]` post-ZER-112, so every call-site
// must produce the resolved shape.
const resolved = (
  plugin: PluginStep,
  options: Record<string, unknown> = {}
): ResolvedStep => ({
  plugin,
  name: plugin.name,
  dependsOnSteps: plugin.dependsOnSteps,
  options,
})

// Test harness: run a pipeline's execute Effect with the default runtime layer
// and return the resolved StepResult array.
function runPipeline<R>(pipeline: { readonly execute: Effect.Effect<ReadonlyArray<unknown>, never, R> }) {
  return Effect.runPromise(
    Effect.provide(pipeline.execute, DefaultRuntimeLayer) as Effect.Effect<
      ReadonlyArray<unknown>,
      never,
      never
    >
  )
}

// Test harness with a custom layer so tests can inject a ConfigService that
// fails `secret(...)` for a specific key (simulating a missing secret). The
// layer's "provides" type parameter is `R` — matching the pipeline's required
// environment — so callers passing `Layer.mergeAll(ConfigLive, PlatformLive, ...)`
// are type-checked against what the pipeline actually needs rather than a
// too-narrow `Layer<never, never, never>` that forced a runtime cast.
function runPipelineWith<R>(
  pipeline: { readonly execute: Effect.Effect<ReadonlyArray<unknown>, never, R> },
  layer: Layer.Layer<R, never, never>
) {
  return Effect.runPromise(Effect.provide(pipeline.execute, layer))
}

// Stub ConfigService: secrets that aren't in `present` fail with
// SecretNotFoundError, matching the real adapter's failure channel.
const stubConfig = (
  secrets: Record<string, string> = {},
  env: Record<string, string> = {}
): IConfigService => ({
  load: () => Effect.die("not used"),
  env: (k) => Effect.succeed(env[k]),
  secret: (k) =>
    k in secrets
      ? Effect.succeed(secrets[k]!)
      : Effect.fail(new SecretNotFoundError({ key: k, message: `Secret not found: ${k}` })),
})

const stubPlatform = (toolchains: ReadonlyArray<string> = []): IPlatformService => ({
  os: () => Effect.succeed("darwin"),
  availableToolchains: () =>
    Effect.succeed(toolchains as ReadonlyArray<Toolchain>),
  supports: () => Effect.succeed(true),
})

describe("Pipeline", () => {
  test("executes steps in dependency order", async () => {
    const executionLog: string[] = []

    const step1 = defineStep({
      name: "first",
      run: async () => {
        executionLog.push("first")
        return {}
      },
    })

    const step2 = defineStep({
      name: "second",
      dependsOnSteps: ["first"],
      run: async () => {
        executionLog.push("second")
        return {}
      },
    })

    const pipeline = definePipeline({
      steps: [resolved(step1), resolved(step2)],
      workflow: ["first", "second"],
    })

    const results = (await runPipeline(pipeline)) as ReadonlyArray<{ status: string }>

    expect(executionLog).toEqual(["first", "second"])
    expect(results.every((r) => r.status === "pass")).toBe(true)
  })

  test("stops execution on step failure", async () => {
    const executionLog: string[] = []

    const step1 = defineStep({
      name: "failing",
      run: async () => {
        executionLog.push("failing")
        throw new Error("step failed")
      },
    })

    const step2 = defineStep({
      name: "should-not-run",
      dependsOnSteps: ["failing"],
      run: async () => {
        executionLog.push("should-not-run")
        return {}
      },
    })

    const pipeline = definePipeline({
      steps: [resolved(step1), resolved(step2)],
      workflow: ["failing", "should-not-run"],
    })

    const results = (await runPipeline(pipeline)) as ReadonlyArray<{
      status: string
      error?: string
    }>

    expect(executionLog).toEqual(["failing"])
    expect(results[0].status).toBe("fail")
    expect(results[0].error).toBeDefined()
  })

  test("runs effect steps with the default runtime layer", async () => {
    const effectStep = defineEffectStep({
      name: "effectful",
      run: () =>
        Effect.gen(function* () {
          const logger = yield* LoggerService
          yield* logger.info("effect step ran")
          return { ran: true }
        }),
    })

    const pipeline = definePipeline({
      steps: [resolved(effectStep)],
      workflow: ["effectful"],
    })

    const results = (await runPipeline(pipeline)) as ReadonlyArray<{
      status: string
      output?: Record<string, unknown>
    }>

    expect(results[0].status).toBe("pass")
    expect(results[0].output).toEqual({ ran: true })
  })

  test("shares the artifact store across effect steps in one run", async () => {
    const writer = defineEffectStep({
      name: "writer",
      run: () =>
        Effect.gen(function* () {
          const artifacts = yield* ArtifactService
          yield* artifacts.put("shared", { type: "note", path: "/tmp/n", value: 42 })
          return {}
        }),
    })
    const reader = defineEffectStep({
      name: "reader",
      dependsOnSteps: ["writer"],
      run: () =>
        Effect.gen(function* () {
          const artifacts = yield* ArtifactService
          const found = yield* artifacts.get("shared")
          return { value: found?.value }
        }),
    })

    const pipeline = definePipeline({
      steps: [resolved(writer), resolved(reader)],
      workflow: ["writer", "reader"],
    })

    const results = (await runPipeline(pipeline)) as ReadonlyArray<{
      name: string
      status: string
      output?: Record<string, unknown>
    }>

    expect(results.every((r) => r.status === "pass")).toBe(true)
    expect(results.find((r) => r.name === "reader")?.output).toEqual({ value: 42 })
  })

  test("marks unreached steps as skipped after a failure", async () => {
    const failing = defineStep({
      name: "boom",
      run: async () => {
        throw new Error("nope")
      },
    })
    const unreached = defineStep({
      name: "after-boom",
      dependsOnSteps: ["boom"],
      run: async () => ({}),
    })

    const pipeline = definePipeline({
      steps: [resolved(failing), resolved(unreached)],
      workflow: ["boom", "after-boom"],
    })

    const results = (await runPipeline(pipeline)) as ReadonlyArray<{
      name: string
      status: string
    }>

    expect(results.find((r) => r.name === "boom")?.status).toBe("fail")
    expect(results.find((r) => r.name === "after-boom")?.status).toBe("skipped")
  })

  test("reports step duration", async () => {
    const step = defineStep({
      name: "timed",
      run: async () => {
        await new Promise((r) => setTimeout(r, 50))
        return {}
      },
    })

    const pipeline = definePipeline({
      steps: [resolved(step)],
      workflow: ["timed"],
    })

    const results = (await runPipeline(pipeline)) as ReadonlyArray<{ durationMs: number }>

    expect(results[0].durationMs).toBeGreaterThanOrEqual(40)
  })

  test("captures StepError.code on StepResult when an effect step fails with StepError", async () => {
    const failing = defineEffectStep({
      name: "failing-step",
      run: () =>
        Effect.fail(
          new StepError({
            code: "PREFLIGHT_MISSING_SECRETS",
            message: "Missing secret: APPLE_API_KEY",
          })
        ),
    })

    const pipeline = definePipeline({
      steps: [resolved(failing)],
      workflow: ["failing-step"],
      skipPreflight: true,
    })

    const results = (await runPipeline(pipeline)) as ReadonlyArray<{
      status: string
      error?: string
      code?: string
    }>

    expect(results[0].status).toBe("fail")
    expect(results[0].code).toBe("PREFLIGHT_MISSING_SECRETS")
    expect(results[0].error).toBe("Missing secret: APPLE_API_KEY")
  })

  test("omits code on StepResult when a step fails with a non-StepError", async () => {
    const failing = defineStep({
      name: "boom",
      run: async () => {
        throw new Error("generic failure")
      },
    })

    const pipeline = definePipeline({
      steps: [resolved(failing)],
      workflow: ["boom"],
      skipPreflight: true,
    })

    const results = (await runPipeline(pipeline)) as ReadonlyArray<{
      status: string
      error?: string
      code?: string
    }>

    expect(results[0].status).toBe("fail")
    expect(results[0].error).toBe("generic failure")
    expect(results[0].code).toBeUndefined()
  })

  test("execute is an Effect, not a function", () => {
    const step = defineStep({ name: "noop", run: async () => ({}) })
    const pipeline = definePipeline({ steps: [resolved(step)], workflow: ["noop"] })

    // Regression guard: `execute` must be an Effect value, not a thunk.
    // This prevents callers from accidentally `await pipeline.execute()` again
    // (which would throw "execute is not a function").
    expect(typeof pipeline.execute).toBe("object")
    expect(Effect.isEffect(pipeline.execute)).toBe(true)
  })

  test("passes bound options from the ResolvedStep to plugin execute()", async () => {
    const captured: Array<Record<string, unknown>> = []
    const plugin = defineStep({
      name: "echo",
      run: async (opts) => {
        captured.push(opts)
        return {}
      },
    })

    const pipeline = definePipeline({
      steps: [resolved(plugin, { greeting: "hi" })],
      workflow: ["echo"],
    })

    await runPipeline(pipeline)
    expect(captured).toEqual([{ greeting: "hi" }])
  })

  test("passes bound options from the ResolvedStep to effect step run()", async () => {
    const captured: Array<Record<string, unknown>> = []
    const plugin = defineEffectStep({
      name: "echo-effect",
      run: (opts) =>
        Effect.sync(() => {
          captured.push(opts)
          return {}
        }),
    })

    const pipeline = definePipeline({
      steps: [resolved(plugin, { whom: "world" })],
      workflow: ["echo-effect"],
    })

    await runPipeline(pipeline)
    expect(captured).toEqual([{ whom: "world" }])
  })

  test("runs preflight and fails before any step when a required secret is missing", async () => {
    const ran: string[] = []
    const plugin = defineStep({
      name: "needs-secret",
      requiredSecrets: ["DOES_NOT_EXIST"],
      run: async () => {
        ran.push("needs-secret")
        return {}
      },
    })

    const pipeline = definePipeline({
      steps: [resolved(plugin)],
      workflow: ["needs-secret"],
    })

    const layer = Layer.mergeAll(
      Layer.succeed(ConfigService, stubConfig({})),
      Layer.succeed(PlatformService, stubPlatform([]))
    )

    const results = (await runPipelineWith(pipeline, layer)) as ReadonlyArray<{
      status: string
      error?: string
      code?: string
    }>

    expect(ran).toEqual([])
    expect(results[0].status).toBe("fail")
    expect(results[0].code).toBe("PREFLIGHT_MISSING_SECRETS")
    expect(results[0].error).toContain("DOES_NOT_EXIST")
  })

  test("marks subsequent steps as skipped when preflight fails", async () => {
    const first = defineStep({
      name: "first",
      requiredSecrets: ["MISSING_KEY"],
      run: async () => ({}),
    })
    const second = defineStep({
      name: "second",
      dependsOnSteps: ["first"],
      run: async () => ({}),
    })

    const pipeline = definePipeline({
      steps: [resolved(first), resolved(second)],
      workflow: ["first", "second"],
    })

    const layer = Layer.mergeAll(
      Layer.succeed(ConfigService, stubConfig({})),
      Layer.succeed(PlatformService, stubPlatform([]))
    )

    const results = (await runPipelineWith(pipeline, layer)) as ReadonlyArray<{
      name: string
      status: string
      code?: string
    }>

    expect(results).toHaveLength(2)
    expect(results.find((r) => r.name === "first")?.status).toBe("fail")
    expect(results.find((r) => r.name === "first")?.code).toBe(
      "PREFLIGHT_MISSING_SECRETS"
    )
    expect(results.find((r) => r.name === "second")?.status).toBe("skipped")
  })

  test("skipPreflight:true bypasses the pre-flight check entirely", async () => {
    const ran: string[] = []
    // Would normally fail preflight (required secret absent), but with the
    // escape hatch the step runs anyway. Any actual usage of the secret is
    // the step author's responsibility at that point.
    const plugin = defineStep({
      name: "bypass-preflight",
      requiredSecrets: ["DOES_NOT_EXIST"],
      run: async () => {
        ran.push("ran")
        return {}
      },
    })

    const pipeline = definePipeline({
      steps: [resolved(plugin)],
      workflow: ["bypass-preflight"],
      skipPreflight: true,
    })

    const layer = Layer.mergeAll(
      Layer.succeed(ConfigService, stubConfig({})),
      Layer.succeed(PlatformService, stubPlatform([]))
    )

    const results = (await runPipelineWith(pipeline, layer)) as ReadonlyArray<{
      status: string
    }>

    expect(ran).toEqual(["ran"])
    expect(results[0].status).toBe("pass")
  })

  test("StepError thrown from a step surfaces its code on StepResult.code", async () => {
    const plugin = defineEffectStep({
      name: "throws-step-error",
      run: () =>
        Effect.fail(
          new StepError({
            code: "CUSTOM_CODE",
            message: "domain failure",
          })
        ),
    })

    const pipeline = definePipeline({
      steps: [resolved(plugin)],
      workflow: ["throws-step-error"],
    })

    const results = (await runPipeline(pipeline)) as ReadonlyArray<{
      status: string
      error?: string
      code?: string
    }>

    expect(results[0].status).toBe("fail")
    expect(results[0].code).toBe("CUSTOM_CODE")
    expect(results[0].error).toContain("domain failure")
  })

  test("generic Error thrown from a step leaves StepResult.code undefined", async () => {
    const plugin = defineStep({
      name: "throws-generic",
      run: async () => {
        throw new Error("plain failure")
      },
    })

    const pipeline = definePipeline({
      steps: [resolved(plugin)],
      workflow: ["throws-generic"],
    })

    const results = (await runPipeline(pipeline)) as ReadonlyArray<{
      status: string
      error?: string
      code?: string
    }>

    expect(results[0].status).toBe("fail")
    expect(results[0].error).toBe("plain failure")
    expect(results[0].code).toBeUndefined()
  })
})

describe("makeDefaultContext", () => {
  test("logger routes through console methods", () => {
    const logged: Array<[string, string]> = []
    const orig = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    }
    console.log = (m: string) => logged.push(["log", String(m)])
    console.warn = (m: string) => logged.push(["warn", String(m)])
    console.error = (m: string) => logged.push(["error", String(m)])
    console.debug = (m: string) => logged.push(["debug", String(m)])

    try {
      const ctx = makeDefaultContext()
      ctx.logger.info("i")
      ctx.logger.warn("w")
      ctx.logger.error("e")
      ctx.logger.debug("d")
    } finally {
      Object.assign(console, orig)
    }

    expect(logged.map(([k]) => k)).toEqual(["log", "warn", "error", "debug"])
  })

  test("config reads env and secret from process.env", () => {
    process.env.__ZL_CTX_TEST__ = "v"
    const ctx = makeDefaultContext()
    expect(ctx.config.env("__ZL_CTX_TEST__")).toBe("v")
    expect(ctx.config.secret("__ZL_CTX_TEST__")).toBe("v")
    delete process.env.__ZL_CTX_TEST__
  })

  test("platform exposes os, toolchains, and supports", () => {
    const ctx = makeDefaultContext()
    expect(typeof ctx.platform.os()).toBe("string")
    expect(Array.isArray(ctx.platform.availableToolchains())).toBe(true)
    expect(ctx.platform.supports("android")).toBe(true)
    expect(ctx.platform.supports("unknown")).toBe(false)
  })

  test("artifacts store, retrieve, and list entries", () => {
    const ctx = makeDefaultContext()
    ctx.artifacts.put("k", { v: 1 })
    expect(ctx.artifacts.get("k")).toEqual({ v: 1 })
    expect(ctx.artifacts.list()).toContain("k")
  })

  test("overrides replace sub-contexts", () => {
    const ctx = makeDefaultContext({
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    })
    expect(ctx.logger.info).toBeInstanceOf(Function)
  })
})
