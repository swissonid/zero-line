import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { Pipeline, makeDefaultContext } from "./Pipeline"
import { defineStep, defineEffectStep } from "../step-loader/StepContract"
import { LoggerService } from "../ports/LoggerService"
import { ArtifactService } from "../ports/ArtifactService"

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

    const pipeline = new Pipeline({
      steps: [step1, step2],
      workflow: ["first", "second"],
    })

    const results = await pipeline.execute()

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

    const pipeline = new Pipeline({
      steps: [step1, step2],
      workflow: ["failing", "should-not-run"],
    })

    const results = await pipeline.execute()

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

    const pipeline = new Pipeline({
      steps: [effectStep],
      workflow: ["effectful"],
    })

    const results = await pipeline.execute()

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

    const pipeline = new Pipeline({
      steps: [writer, reader],
      workflow: ["writer", "reader"],
    })

    const results = await pipeline.execute()

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

    const pipeline = new Pipeline({
      steps: [failing, unreached],
      workflow: ["boom", "after-boom"],
    })

    const results = await pipeline.execute()

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

    const pipeline = new Pipeline({
      steps: [step],
      workflow: ["timed"],
    })

    const results = await pipeline.execute()

    expect(results[0].durationMs).toBeGreaterThanOrEqual(40)
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
