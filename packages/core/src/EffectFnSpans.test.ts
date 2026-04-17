/**
 * Regression test for ZER-156 — `Effect.fn` migration.
 *
 * Wrapping named Effects with `Effect.fn("name")` creates a span whose name
 * matches the string passed to `Effect.fn`. This test provides a minimal
 * collecting tracer that records every span started during execution and
 * asserts the expected names appear for each migrated function.
 *
 * The assertion is deliberately narrow (only span name, not parent/child
 * structure) so it stays green if Effect internals reorganise how `Effect.fn`
 * composes spans in future versions. If any migrated export loses its span
 * (e.g. someone rewrites it back to `Effect.gen`), this test fails loudly.
 */
import { describe, test, expect } from "bun:test"
import { Context, Effect, Exit, Layer, Option, Tracer } from "effect"
import { Cause } from "effect"
import { preflightCheck } from "./engine/PreflightCheck"
import { resolveStepInstances } from "./step-loader/StepInstanceResolver"
import { runWithProcess, type SpawnedProcess } from "./adapters/LocalShell"
import { ConfigService, SecretNotFoundError } from "./ports/ConfigService"
import { PlatformService } from "./ports/PlatformService"
import type { IConfigService } from "./ports/ConfigService"
import type { IPlatformService, Toolchain } from "./ports/PlatformService"
import { defineStep } from "./step-loader/StepContract"

// A no-op span implementation. We only care about the name for the
// regression assertion; the rest of the `Tracer.Span` surface is stubbed with
// the loosest sensible defaults. Casting to `Tracer.Span` sidesteps the
// ambient-type dance required to hand-roll every field; this is test-only.
const makeSpan = (name: string): Tracer.Span =>
  ({
    _tag: "Span",
    name,
    spanId: "00",
    traceId: "00",
    parent: Option.none(),
    context: Context.empty(),
    status: { _tag: "Started", startTime: 0n },
    attributes: new Map(),
    links: [],
    sampled: true,
    kind: "internal",
    end: () => {},
    attribute: () => {},
    event: () => {},
    addLinks: () => {},
  }) as unknown as Tracer.Span

/**
 * Builds a tracer that appends every started span's name to `sink`. Callers
 * provide the Effect via `Effect.withTracer(eff, collectingTracer(names))`.
 */
const collectingTracer = (sink: string[]): Tracer.Tracer =>
  Tracer.make({
    span: (name) => {
      sink.push(name)
      return makeSpan(name)
    },
    context: (f) => f(),
  })

describe("Effect.fn span names (ZER-156)", () => {
  test("preflightCheck emits a 'preflightCheck' span", async () => {
    const step = defineStep({
      name: "probe",
      requiredEnv: ["PRESENT"],
      run: async () => ({}),
    })
    const resolved = {
      plugin: step,
      name: step.name,
      dependsOnSteps: step.dependsOnSteps,
      options: {},
    }
    const stubConfig: IConfigService = {
      load: () => Effect.die("not used"),
      env: () => Effect.succeed("v"),
      secret: (k) =>
        Effect.fail(new SecretNotFoundError({ key: k, message: "not used" })),
    }
    const stubPlatform: IPlatformService = {
      os: () => Effect.succeed("darwin"),
      availableToolchains: () =>
        Effect.succeed([] as ReadonlyArray<Toolchain>),
      supports: () => Effect.succeed(true),
    }
    const layer = Layer.mergeAll(
      Layer.succeed(ConfigService, stubConfig),
      Layer.succeed(PlatformService, stubPlatform)
    )

    const names: string[] = []
    const exit = await Effect.runPromiseExit(
      preflightCheck([resolved]).pipe(
        Effect.provide(layer),
        Effect.withTracer(collectingTracer(names))
      )
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(names).toContain("preflightCheck")
  })

  test("resolveStepInstances emits a 'resolveStepInstances' span", async () => {
    const hello = defineStep({
      name: "hello",
      run: async () => ({}),
    })
    const loader = async (_name: string) => hello
    const names: string[] = []
    const exit = await Effect.runPromiseExit(
      resolveStepInstances([{ name: "hello", options: {} }], loader).pipe(
        Effect.withTracer(collectingTracer(names))
      )
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(names).toContain("resolveStepInstances")
  })

  test("LocalShell.runWithProcess emits a 'LocalShell.runWithProcess' span", async () => {
    // Stub process that "exits" cleanly with no output. Keeps the test off
    // the OS process table — the span assertion doesn't need a real spawn.
    const stubProc: SpawnedProcess = {
      stdout: new ReadableStream({
        start(controller) {
          controller.close()
        },
      }),
      stderr: new ReadableStream({
        start(controller) {
          controller.close()
        },
      }),
      exited: Promise.resolve(0),
      kill: () => {},
    }
    const names: string[] = []
    const exit = await Effect.runPromiseExit(
      runWithProcess({ argv: ["noop"] }, stubProc).pipe(
        Effect.withTracer(collectingTracer(names))
      )
    )
    if (!Exit.isSuccess(exit)) {
      throw new Error(
        `expected success, got: ${Cause.pretty(exit.cause)}`
      )
    }
    expect(names).toContain("LocalShell.runWithProcess")
  })
})
