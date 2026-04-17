# ZER-150 · Unify config-loading on Effect — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the accidental two-zone split in `@zl/core` so config loading and plugin resolution live in the same Effect-based world as the runtime (`Pipeline`, `preflightCheck`, `ShellService`). Every I/O boundary in the core package emits an `Effect`, not a `Promise`.

**Architecture:** `ConfigService.load()` (already defined; lives in `FileConfig.ts` adapter) becomes the single loader for `zl.config.ts`. `validateStepOptions` moves out of `ConfigLoader.ts` into a standalone Effect-returning helper. `resolveStepInstances` returns `Effect<..., StepError>`. The legacy `loadConfig(dir)` Promise function and its module are deleted. The CLI becomes one top-level `Effect` program composed via `Effect.runPromise(...)`.

**Tech Stack:** TypeScript, Bun, Effect-TS (`effect` package), existing hexagonal port/adapter split, `bun:test`, oxlint.

---

## Scope

### In scope
- Delete `packages/core/src/config/ConfigLoader.ts` (Promise-based `loadConfig`).
- Move `validateStepOptions` → `packages/core/src/config/validateStepOptions.ts` (Effect-returning).
- Rewrite `packages/core/src/step-loader/StepInstanceResolver.ts` to return `Effect.Effect<ReadonlyArray<ResolvedStep>, StepError, never>`.
- Rewrite `packages/cli/src/cli.ts` to build one top-level Effect program and run it via `Effect.runPromise`.
- Update tests:
  - Delete `packages/core/src/config/ConfigLoader.test.ts` (replaced by `validateStepOptions.test.ts` + existing ConfigService behavior).
  - Add `packages/core/src/config/validateStepOptions.test.ts`.
  - Rewrite `packages/core/src/step-loader/StepInstanceResolver.test.ts` to use `Effect.runPromise` / `Effect.runPromiseExit`.
  - Update `packages/cli/src/cli.test.ts` to inject stub services instead of writing `zl.config.ts` files to tmpdir (if any tests did).
- Update `packages/core/src/index.ts` exports.
- Reconcile `docs/superpowers/plans/2026-04-16-m-a1-core-hardening.md` Task 9 code block with the summary (replace Promise idiom with Effect).

### Out of scope
- Changing step-author-facing ergonomics (`defineStep({ run: async (opts) => ... })` stays Promise-valued — that's the public plugin contract).
- Introducing a new `FileSystem` port: the existing `ConfigService.load` already encapsulates file-system access for the only file the core package reads. Adding a separate `FileSystem` port would duplicate it.
- Touching `LocalShellLive`, `Pipeline`, `preflightCheck`, or any already-Effect module.

### Success criteria
- `@zl/core` exports zero `Promise<T>`-returning I/O functions (factory functions like `makeFileConfigLayer` are fine — they return `Layer`, not Promise).
- `bun run typecheck` green across `packages/core` and `packages/cli`.
- `bun run lint` — 0 warnings, 0 errors.
- `bun test --recursive packages/` — all tests pass, no regressions.
- Smoke: `zl list` and `zl run <workflow>` work end-to-end against a real `zl.config.ts` fixture.

---

## File plan

### New files
- `packages/core/src/config/validateStepOptions.ts` — Effect helper that walks a `ZlConfig` and validates each `StepInstance.options` against its plugin's `optionsSchema`.
- `packages/core/src/config/validateStepOptions.test.ts` — tests for the helper.

### Files removed
- `packages/core/src/config/ConfigLoader.ts` — replaced by `ConfigService.load()` (already in `adapters/FileConfig.ts`) + `validateStepOptions`.
- `packages/core/src/config/ConfigLoader.test.ts` — behaviour now tested in `validateStepOptions.test.ts` + existing `FileConfig` usage.

### Files modified
- `packages/core/src/step-loader/StepInstanceResolver.ts` — `Effect`-returning implementation.
- `packages/core/src/step-loader/StepInstanceResolver.test.ts` — tests via `Effect.runPromise` / `Effect.runPromiseExit`.
- `packages/core/src/index.ts` — remove `loadConfig`, `LoadConfigOptions`, `ConfigFileNotFoundError`, `PluginLoader` (from ConfigLoader), `PluginLike` exports; add `validateStepOptions` export; `resolveStepInstances` signature change is transparent to consumers via re-export.
- `packages/cli/src/cli.ts` — top-level Effect program; uses `ConfigService.load` + `validateStepOptions` + `resolveStepInstances` + `runWorkflow`.
- `packages/cli/src/cli.test.ts` — provide layered stub `ConfigService` for each test instead of writing tmpdir fixtures (where applicable).
- `packages/cli/src/commands/run.ts` — no API change expected, but review for callers that assumed the Promise loader.
- `docs/superpowers/plans/2026-04-16-m-a1-core-hardening.md` — Task 9 code block rewritten to match the summary's Effect signature; same update to any other task that copied the Promise idiom for loader.

---

## Task 1: Move `validateStepOptions` out of `ConfigLoader` into a standalone Effect helper

**Files:**
- Create: `packages/core/src/config/validateStepOptions.ts`
- Create: `packages/core/src/config/validateStepOptions.test.ts`

Rationale: `validateStepOptions` is a pure walk over `ZlConfig`. It doesn't need to live inside `ConfigLoader`. Extracting it lets us keep the "shape validation" job independent of "where the config came from", so `ConfigService.load()` can stay responsible only for parsing + shape validation, and callers compose `validateStepOptions` on top when they have a plugin catalog.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/config/validateStepOptions.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { Effect, Exit } from "effect"
import { validateStepOptions } from "./validateStepOptions"
import { ConfigValidationError } from "./validateConfig"
import type { ZlConfig } from "./ConfigTypes"

const goodPlugin = {
  optionsSchema: {
    decode: (raw: unknown) => {
      const r = raw as Record<string, unknown>
      if (typeof r.scheme !== "string") throw new Error("scheme must be a string")
      return r
    },
  },
}

const baseConfig: ZlConfig = {
  app: { name: "T", bundleId: "c.t" },
  platforms: {},
  workflows: { ci: ["build"] },
}

describe("validateStepOptions", () => {
  test("succeeds when every plugin.decode accepts its instance.options", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      platforms: { ios: { steps: [{ name: "build", options: { scheme: "App" } }] } },
    }
    const loader = async () => goodPlugin
    await Effect.runPromise(validateStepOptions(config, loader))
  })

  test("fails with ConfigValidationError listing every invalid step", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      steps: [{ name: "build", options: { scheme: 1 } }],
      platforms: {
        ios: { steps: [{ name: "build", options: { scheme: 2 } }] },
      },
    }
    const loader = async () => goodPlugin

    const exit = await Effect.runPromiseExit(validateStepOptions(config, loader))
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) throw new Error("expected failure")
    const cause = exit.cause
    // Failure carries the ConfigValidationError with both issues.
    const json = JSON.stringify(cause)
    expect(json).toContain("top-level")
    expect(json).toContain("platform: ios")
    expect(json).toContain("build")
  })

  test("skips steps whose loader returns null", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      platforms: { ios: { steps: [{ name: "unknown", options: { anything: 1 } }] } },
    }
    const loader = async () => null
    await Effect.runPromise(validateStepOptions(config, loader))
  })

  test("skips plugins with no optionsSchema", async () => {
    const config: ZlConfig = {
      ...baseConfig,
      platforms: { ios: { steps: [{ name: "noop", options: { anything: 1 } }] } },
    }
    const loader = async () => ({})
    await Effect.runPromise(validateStepOptions(config, loader))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/config/validateStepOptions.test.ts`
Expected: FAIL with `Cannot find module './validateStepOptions'`.

- [ ] **Step 3: Create the helper**

Create `packages/core/src/config/validateStepOptions.ts`:

```ts
import { Effect } from "effect"
import type { StepInstance, ZlConfig } from "./ConfigTypes"
import { ConfigValidationError } from "./validateConfig"

/**
 * Structural subset of a compiled plugin step that {@link validateStepOptions}
 * cares about. Kept narrow so custom loaders (stubs, registries, monorepo
 * lookups) can return lightweight objects.
 */
export interface PluginLike {
  readonly optionsSchema?: {
    readonly decode: (raw: unknown) => unknown
  }
}

/**
 * Resolves a plugin by the `name` of a {@link StepInstance}. Returning `null`
 * means "no plugin known for this name" — that instance's options are not
 * validated.
 */
export type PluginLoader = (stepName: string) => Promise<PluginLike | null>

type LabeledInstance = { readonly inst: StepInstance; readonly source: string }

/**
 * Validate one instance's options. Returns `Effect<void, string, never>` where
 * the `string` failure channel carries a single human-readable issue line.
 * `Effect.validateAll` (in {@link validateStepOptions}) collects every such
 * issue across all instances before rejecting.
 */
function validateOne(
  { inst, source }: LabeledInstance,
  loader: PluginLoader
): Effect.Effect<void, string, never> {
  return Effect.gen(function* () {
    const plugin = yield* Effect.tryPromise({
      try: () => loader(inst.name),
      catch: (cause) =>
        `Plugin loader failed for step '${inst.name}' (${source}): ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
    })
    if (!plugin || !plugin.optionsSchema) return
    try {
      plugin.optionsSchema.decode(inst.options ?? {})
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      return yield* Effect.fail(
        `Invalid options for step '${inst.name}' (${source}): ${reason}`
      )
    }
  })
}

/**
 * Walk every {@link StepInstance} in `config` (top-level `steps` + every
 * per-platform `steps`), validating each step's raw options against its
 * resolved plugin's `optionsSchema.decode`. Collects ALL failures via
 * `Effect.validateAll` and, if any, rejects with a single
 * {@link ConfigValidationError} carrying the full list — so users see every
 * misconfigured step in one pass, not just the first.
 *
 * Rejections from `decode` are rewrapped so callers get a single predictable
 * error type regardless of how a step author implemented their schema
 * (Effect `Schema`, Zod, a plain function, etc.).
 */
export function validateStepOptions(
  config: ZlConfig,
  loader: PluginLoader
): Effect.Effect<void, ConfigValidationError, never> {
  const allInstances: ReadonlyArray<LabeledInstance> = [
    ...(config.steps ?? []).map((inst) => ({ inst, source: "top-level" })),
    ...Object.entries(config.platforms).flatMap(([platform, p]) =>
      (p?.steps ?? []).map((inst) => ({ inst, source: `platform: ${platform}` }))
    ),
  ]

  return Effect.validateAll(allInstances, (entry) => validateOne(entry, loader)).pipe(
    Effect.asVoid,
    Effect.mapError((issues) => new ConfigValidationError(Array.from(issues)))
  )
}
```

**Why `Effect.validateAll` over an imperative accumulator:** `Effect.validateAll` is the canonical Effect idiom for "process every item, collect every failure, fail with the aggregated `NonEmptyArray<E>` if any" (ref: `~/.effect/packages/effect/src/Effect.ts:2255`). It also gives us free concurrency knobs later if needed (`{ concurrency: "unbounded" }`). `Effect.asVoid` discards the `void[]` success channel and `Effect.mapError` bundles the non-empty issue array into a single `ConfigValidationError` for downstream consumers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/src/config/validateStepOptions.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/validateStepOptions.ts \
        packages/core/src/config/validateStepOptions.test.ts
git commit -m "feat(core): extract validateStepOptions as an Effect helper (ZER-150)"
```

---

## Task 2: Rewrite `StepInstanceResolver` to return `Effect`

**Files:**
- Modify: `packages/core/src/step-loader/StepInstanceResolver.ts`
- Modify: `packages/core/src/step-loader/StepInstanceResolver.test.ts`

- [ ] **Step 1: Rewrite the tests first (red state via Promise API)**

Replace `packages/core/src/step-loader/StepInstanceResolver.test.ts` with:

```ts
import { describe, test, expect } from "bun:test"
import { Effect, Exit } from "effect"
import { defineStep } from "./StepContract"
import { resolveStepInstances } from "./StepInstanceResolver"
import type { StepInstance } from "../config/ConfigTypes"

const hello = defineStep({
  name: "hello",
  run: async (opts: { who?: string }) => ({ greeted: opts.who ?? "world" }),
})

describe("resolveStepInstances", () => {
  test("returns ResolvedStep[] with bound options using an injected loader", async () => {
    const loader = async (name: string) => {
      if (name === "hello") return hello
      throw new Error(`not found: ${name}`)
    }
    const instances: ReadonlyArray<StepInstance> = [
      { name: "hello", options: { who: "zl" } },
    ]
    const resolved = await Effect.runPromise(resolveStepInstances(instances, loader))
    expect(resolved).toHaveLength(1)
    expect(resolved[0].name).toBe("hello")
    expect(resolved[0].options).toEqual({ who: "zl" })
    expect(resolved[0].plugin).toBe(hello)
  })

  test("fails with STEP_NOT_FOUND StepError when loader rejects", async () => {
    const loader = async (_name: string): Promise<never> => {
      throw new Error("module not found")
    }
    const instances: ReadonlyArray<StepInstance> = [{ name: "missing", options: {} }]
    const exit = await Effect.runPromiseExit(resolveStepInstances(instances, loader))
    expect(Exit.isFailure(exit)).toBe(true)
    const json = JSON.stringify(exit)
    expect(json).toContain("STEP_NOT_FOUND")
    expect(json).toContain("missing")
  })

  test("fails with INVALID_PLUGIN when the loaded export is not a valid plugin", async () => {
    const loader = async (_name: string) => ({ nope: true } as any)
    const instances: ReadonlyArray<StepInstance> = [{ name: "broken", options: {} }]
    const exit = await Effect.runPromiseExit(resolveStepInstances(instances, loader))
    expect(Exit.isFailure(exit)).toBe(true)
    const json = JSON.stringify(exit)
    expect(json).toContain("INVALID_PLUGIN")
  })

  test("preserves the workflow-bound instance name even when it differs from plugin.name", async () => {
    const loader = async (_name: string) => hello
    const instances: ReadonlyArray<StepInstance> = [
      { name: "@org/hello-plugin", options: { who: "aliased" } },
    ]
    const resolved = await Effect.runPromise(resolveStepInstances(instances, loader))
    expect(resolved[0].name).toBe("@org/hello-plugin")
    expect(resolved[0].plugin.name).toBe("hello")
  })
})
```

- [ ] **Step 2: Verify tests fail against the current Promise-returning implementation**

Run: `bun test packages/core/src/step-loader/StepInstanceResolver.test.ts`
Expected: FAIL. `Effect.runPromise(...)` throws because the current implementation returns a Promise, not an Effect; the test body's expectations won't even reach the assertions.

- [ ] **Step 3: Rewrite the implementation**

Replace `packages/core/src/step-loader/StepInstanceResolver.ts` with:

```ts
/**
 * Step instance resolver — the "resolved" stage of the step lifecycle.
 *
 * Given a list of {@link StepInstance}s from a workflow config and a
 * {@link PluginLoader} (dynamic import by default, in-memory in tests),
 * produces `ReadonlyArray<{@link ResolvedStep}>` with each plugin paired to
 * its workflow-bound name and options.
 *
 * Effect-based so it composes with the rest of the runtime: failures flow
 * through the typed {@link StepError} channel (not JS exceptions), loader
 * I/O is interruptible, and per-instance resolution is parallel via
 * `Effect.all({ concurrency: "unbounded" })` — matching the prior
 * `Promise.all` behaviour.
 *
 * Loader failures map to `StepError({ code: "STEP_NOT_FOUND" })`; exports
 * that don't pass `validateStep` map to `StepError({ code: "INVALID_PLUGIN" })`.
 */

import { Effect } from "effect"
import { StepError } from "../engine/StepError"
import type { PluginStep, ResolvedStep } from "./StepContract"
import { validateStep } from "./StepLoader"
import type { StepInstance } from "../config/ConfigTypes"

/**
 * How a step name is turned into a raw plugin module. Returns the module's
 * default-or-namespace export as `unknown` — the resolver validates the shape.
 *
 * Kept `Promise`-valued at the boundary because `import()` is Promise-native;
 * the resolver wraps it in `Effect.tryPromise` internally so callers of
 * {@link resolveStepInstances} only see the Effect surface.
 */
export type PluginLoader = (name: string) => Promise<unknown>

export const defaultPluginLoader: PluginLoader = async (name: string) => {
  const mod = (await import(name)) as Record<string, unknown>
  return (mod.default ?? mod) as unknown
}

function resolveOne(
  instance: StepInstance,
  loader: PluginLoader
): Effect.Effect<ResolvedStep, StepError, never> {
  return Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => loader(instance.name),
      catch: (cause) =>
        new StepError({
          code: "STEP_NOT_FOUND",
          message: `Failed to load step plugin '${instance.name}'`,
          cause,
        }),
    })

    const validation = validateStep(raw)
    if (!validation.valid) {
      return yield* Effect.fail(
        new StepError({
          code: "INVALID_PLUGIN",
          message: `Plugin '${instance.name}' is not a valid step: ${
            validation.error ?? "unknown"
          }`,
        })
      )
    }

    const plugin = raw as PluginStep
    return {
      plugin,
      name: instance.name,
      dependsOnSteps: plugin.dependsOnSteps,
      options: instance.options,
    }
  })
}

export function resolveStepInstances(
  instances: ReadonlyArray<StepInstance>,
  loader: PluginLoader = defaultPluginLoader
): Effect.Effect<ReadonlyArray<ResolvedStep>, StepError, never> {
  return Effect.all(
    instances.map((instance) => resolveOne(instance, loader)),
    { concurrency: "unbounded" }
  )
}
```

- [ ] **Step 4: Run the resolver tests**

Run: `bun test packages/core/src/step-loader/StepInstanceResolver.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/step-loader/StepInstanceResolver.ts \
        packages/core/src/step-loader/StepInstanceResolver.test.ts
git commit -m "refactor(core): resolveStepInstances returns Effect (ZER-150)"
```

---

## Task 3: Delete `ConfigLoader` + make CLI one top-level Effect program (atomic)

**Why atomic:** deleting `ConfigLoader.loadConfig` in isolation leaves `cli.ts` referencing a missing symbol. This task does the deletion and the CLI rewrite in one commit so every push keeps typecheck + tests green.

**Files:**
- Delete: `packages/core/src/config/ConfigLoader.ts`
- Delete: `packages/core/src/config/ConfigLoader.test.ts`
- Modify: `packages/core/src/index.ts` — remove `loadConfig`, `ConfigFileNotFoundError`, `LoadConfigOptions`, `PluginLoader`, `PluginLike` (from ConfigLoader); add `validateStepOptions`, `PluginLoader`, `PluginLike` from the new helper.
- Modify: `packages/cli/src/cli.ts` — top-level Effect program.
- Modify: `packages/cli/src/cli.test.ts` — inject a stub `ConfigService` layer if the current tests rely on the deleted `loadConfig`.

- [ ] **Step 1: Remove the legacy module**

```bash
rm packages/core/src/config/ConfigLoader.ts packages/core/src/config/ConfigLoader.test.ts
```

- [ ] **Step 2: Update `packages/core/src/index.ts`**

Replace the line:

```ts
export { loadConfig, ConfigFileNotFoundError, ConfigValidationError } from "./config/ConfigLoader"
```

with:

```ts
export { ConfigValidationError } from "./config/validateConfig"
export { validateStepOptions, type PluginLike, type PluginLoader } from "./config/validateStepOptions"
```

- [ ] **Step 3: Verify the red state is scoped to `cli.ts`**

Run: `bunx tsc --noEmit -p packages/core/tsconfig.json && bunx tsc --noEmit -p packages/cli/tsconfig.json`
Expected: core green; cli FAILS with `Module '"@zl/core"' has no exported member 'loadConfig'` on `cli.ts`. If any other file in core/cli references the deleted exports, fix those too before proceeding.

- [ ] **Step 4: Rewrite `packages/cli/src/cli.ts`**

Replace its body with:

```ts
import { Effect } from "effect"
import {
  ConfigService,
  makeFileConfigLayer,
  resolveStepInstances,
  validateStepOptions,
  type Platform,
  type PluginLike,
  type ResolvedStep,
  type ZlConfig,
} from "@zl/core"
import { runWorkflow } from "./commands/run"
import { defaultIO, type CliIO } from "./io"

export { defaultIO, type CliIO }

const VALID_PLATFORMS: ReadonlyArray<Platform> = ["ios", "android"]
const VALID_PLATFORMS_HINT = `Must be one of: ${VALID_PLATFORMS.join(", ")}`

const HELP_TEXT = `
zero-line (zl) — Mobile CI/CD toolkit

Usage:
  zl <workflow>              Run a workflow
  zl run <workflow>          Run a workflow (explicit)
  zl list                    List workflows and steps
  zl init                    Scaffold zl.config.ts
  zl doctor                  Check environment
  zl --help                  Show this help

Options:
  --platform <ios|android>   Run only one platform
`

export interface RunCliOptions {
  readonly cwd: string
  readonly io?: CliIO
}

interface ParsedArgs {
  readonly command: string
  readonly workflowName: string
  readonly platform: Platform | undefined
}

function parseArgs(
  args: ReadonlyArray<string>,
  io: CliIO
): ParsedArgs | number {
  const command = args[0]
  if (!command || command === "--help" || command === "-h") {
    io.stdout(HELP_TEXT)
    return 0
  }

  const platformFlag = args.indexOf("--platform")
  const rawPlatform = platformFlag !== -1 ? args[platformFlag + 1] : undefined
  if (platformFlag !== -1 && rawPlatform === undefined) {
    io.stderr(`--platform requires a value. ${VALID_PLATFORMS_HINT}`)
    return 1
  }
  if (rawPlatform && !VALID_PLATFORMS.includes(rawPlatform as Platform)) {
    io.stderr(`Invalid platform '${rawPlatform}'. ${VALID_PLATFORMS_HINT}`)
    return 1
  }
  const platform = rawPlatform as Platform | undefined
  const workflowName = command === "run" ? args[1] : command
  if (!workflowName || workflowName.startsWith("-")) {
    io.stderr("Please specify a workflow name. Run 'zl --help' for usage.")
    return 1
  }
  return { command, workflowName, platform }
}

function collectInstances(config: ZlConfig, platform: Platform | undefined) {
  return [
    ...(config.steps ?? []),
    ...(platform
      ? config.platforms[platform]?.steps ?? []
      : Object.values(config.platforms).flatMap((p) => p?.steps ?? [])),
  ]
}

// Load a plugin for validateStepOptions by importing its package and
// returning the default/namespace export. `null` means "not installed" —
// options validation is skipped for that step.
const pluginLookup = async (name: string): Promise<PluginLike | null> => {
  try {
    const mod = (await import(name)) as Record<string, unknown>
    return (mod.default ?? mod) as PluginLike
  } catch {
    return null
  }
}

export async function runCli(
  args: ReadonlyArray<string>,
  opts: RunCliOptions
): Promise<number> {
  const io = opts.io ?? defaultIO
  const parsed = parseArgs(args, io)
  if (typeof parsed === "number") return parsed

  const program = Effect.gen(function* () {
    const service = yield* ConfigService
    const config = yield* service.load()

    if (parsed.command === "list") {
      io.stdout("\nWorkflows:")
      for (const [name, steps] of Object.entries(config.workflows)) {
        io.stdout(`  ${name}: ${(steps as string[]).join(" → ")}`)
      }
      return 0
    }

    yield* validateStepOptions(config, pluginLookup)

    const instances = collectInstances(config, parsed.platform)
    const resolved: ReadonlyArray<ResolvedStep> = yield* resolveStepInstances(instances)

    const success = yield* Effect.promise(() =>
      runWorkflow({
        workflowName: parsed.workflowName,
        config,
        steps: resolved.map((r) => r.plugin) as any, // Task 12 (ZER-112) will thread options through
        io,
      })
    )
    return success ? 0 : 1
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeFileConfigLayer(opts.cwd)),
      Effect.catchAll((err) =>
        Effect.sync(() => {
          io.stderr(err instanceof Error ? err.message : String(err))
          return 1
        })
      )
    )
  )
}
```

Note: `steps: resolved.map((r) => r.plugin) as any` is a transitional bridge — Task 12 (ZER-112) will update `runWorkflow` / `Pipeline` to accept `ResolvedStep[]` directly and thread bound options. The `as any` is explicit so the deferred work is greppable.

- [ ] **Step 5: Update `packages/cli/src/cli.test.ts` if it referenced `loadConfig`**

Run: `grep -n "loadConfig\|ConfigFileNotFoundError" packages/cli/src/cli.test.ts`

If matches found, replace each with a stubbed `ConfigService` layer via `Layer.succeed(ConfigService, { load: () => Effect.succeed(fakeConfig), env: ..., secret: ... })` and `Effect.provide(program, layer)`. If no matches, skip this step.

- [ ] **Step 6: Run the full suite and all gates**

```bash
bun run typecheck
bun run lint
bun test --recursive packages/
```

Expected:
- typecheck: no output
- lint: 0 warnings, 0 errors
- tests: all pass (including new `validateStepOptions` + rewritten `StepInstanceResolver` tests from Tasks 1 and 2)

- [ ] **Step 7: Commit (one atomic commit — green state restored)**

```bash
git add packages/core/src/config/ConfigLoader.ts \
        packages/core/src/config/ConfigLoader.test.ts \
        packages/core/src/index.ts \
        packages/cli/src/cli.ts \
        packages/cli/src/cli.test.ts
git commit -m "refactor(core,cli): delete legacy loadConfig; CLI runs one Effect program (ZER-150)

- Drops packages/core/src/config/ConfigLoader.ts — consumers use
  ConfigService.load() (Effect) via makeFileConfigLayer instead.
- CLI composes one top-level Effect program and invokes it via
  Effect.runPromise, with makeFileConfigLayer providing ConfigService.
- Options-schema validation is now a separate, composable Effect
  helper (validateStepOptions) from Task 1 of this plan.

Closes half of ZER-150; resolver migration was Task 2."
```

---

## Task 4: Update the M-A1 plan doc so Task 9 matches its summary

**Files:**
- Modify: `docs/superpowers/plans/2026-04-16-m-a1-core-hardening.md`

Rationale: Line 27 of that plan already describes `resolveStepInstances` as `Effect<ReadonlyArray<ResolvedStep>, StepError>`; the Task 9 code block at lines 1213–1254 contradicted it with Promise-based code. With Task 3 of this plan executed, the code block should be rewritten to match.

- [ ] **Step 1: Replace the Task 9 code block**

Open `docs/superpowers/plans/2026-04-16-m-a1-core-hardening.md`. Find the block that begins `export type PluginLoader = (name: string) => Promise<unknown>` inside the "Task 9: `StepInstanceResolver` — dynamic import" section (around line 1205). Replace the whole `Step 3: Implement the resolver` code block (the `ts` fenced code block from line ~1205 to ~1255) with the new Effect-based implementation from Task 3 of this plan (the one we just wrote into `packages/core/src/step-loader/StepInstanceResolver.ts`).

Also update the corresponding Step 1 test code block in the same section so its test bodies call `Effect.runPromise(...)` / `Effect.runPromiseExit(...)` and inspect `Exit` rather than `.rejects.toMatchObject(...)`.

- [ ] **Step 2: Scan the plan for other Promise/Effect contradictions**

Run: `grep -n "Promise<" docs/superpowers/plans/2026-04-16-m-a1-core-hardening.md`

For each hit: decide whether it's a legitimate Promise usage (the `run:` callback on `SimpleStepDef`, the `defaultPluginLoader` boundary — both intentional) or a zone-split artefact (a Task's I/O function signature copying the old `loadConfig` idiom). For zone-split artefacts, update the task body to the Effect equivalent and add a one-line note at the top of that task saying the change came from ZER-150.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-04-16-m-a1-core-hardening.md
git commit -m "docs(plan): reconcile Task 9 code block with Effect summary (ZER-150)"
```

---

## Task 5: Final verification + PR

**Files:** none (runs against the existing working tree)

- [ ] **Step 1: All gates green**

Run in order, all from the worktree root:

```bash
bun run typecheck
bun run lint
bun test --recursive packages/
```

Expected:
- typecheck: no output (success)
- lint: `Found 0 warnings and 0 errors`
- tests: every test passes; new resolver tests use Effect API; ConfigLoader.test.ts no longer exists; validateStepOptions.test.ts passes.

- [ ] **Step 2: Smoke test `zl list` against a fixture**

Pick any test fixture `zl.config.ts` under `packages/core/src/config/__test_tmp*__` or create a minimal one at `/tmp/zl-smoke/zl.config.ts`:

```ts
export default {
  app: { name: "Smoke", bundleId: "io.smoke.app" },
  platforms: { ios: { steps: [] } },
  workflows: { ci: [] },
}
```

Then from the repo root:

```bash
bun packages/cli/src/index.ts list --cwd /tmp/zl-smoke
```

Expected: prints `Workflows:` followed by `  ci: ` and exits 0.

- [ ] **Step 3: Open the PR**

From the worktree, assuming commits already pushed:

```bash
gh pr create --head feature/zer-150 --base main \
  --title "refactor(core,cli): unify config-loading on Effect (ZER-150)" \
  --body "$(cat <<'EOF'
## Summary
- Deletes legacy Promise-based `loadConfig` from @zl/core — consumers now use `ConfigService.load()` (Effect) via the existing `makeFileConfigLayer` adapter.
- Extracts `validateStepOptions` as a standalone Effect helper (was buried inside ConfigLoader).
- Rewrites `resolveStepInstances` to return `Effect<ReadonlyArray<ResolvedStep>, StepError, never>`.
- CLI runs as one top-level Effect program with layered services and uniform error handling.
- Reconciles the M-A1 plan's Task 9 code block with its own summary (both now Effect).

## Test plan
- [x] `bun run typecheck` — green (core + cli)
- [x] `bun run lint` — 0 warnings, 0 errors
- [x] `bun test --recursive packages/` — all pass (including new validateStepOptions + rewritten resolver tests)
- [x] Smoke: `zl list --cwd <fixture>` prints workflows and exits 0

Closes ZER-150.
EOF
)"
```

- [ ] **Step 4: Run `greploop` on the PR**

Once the PR is open, trigger and iterate Greptile review using the `greploop` skill. Fix actionable P1/P2 comments until 5/5 confidence with zero unresolved, or 5 iterations.

---

## Self-review checklist

- [x] **Spec coverage:** Each item in ZER-150's "what we need to do" has a corresponding task. `FileSystem` port is explicitly declined (see Out of scope) with rationale; the existing `ConfigService` covers the need.
- [x] **Placeholder scan:** No "TBD" / "similar to above" / "add error handling" language. Every code block is a complete drop-in.
- [x] **Type consistency:** `PluginLoader` appears in two places (`validateStepOptions.ts` and `StepInstanceResolver.ts`). They are intentionally independent types — `validateStepOptions`'s loader returns `Promise<PluginLike | null>` (structural, allows shim objects) while `StepInstanceResolver`'s returns `Promise<unknown>` (validates the result via `validateStep`). Documented in each module's JSDoc.
- [x] **Call graph:** `cli.ts` imports `ConfigService`, `makeFileConfigLayer`, `resolveStepInstances`, `validateStepOptions` — all are or will be exported from `@zl/core` by Task 2.
- [x] **Order:** Task 2's "red" state (typecheck errors in cli.ts) is explicitly called out and resolved by end of Task 4, so the branch is never pushed broken.
