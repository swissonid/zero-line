# M-A1 — Core Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze `@zl/core@0.1.0` as a complete plugin-ready surface — step instance resolver, options schema validation, structured errors, declared requirements, pipeline pre-flight, shell primitive, sub-command registration — so M-B through M-F can be pure plugin work with no core touches.

**Architecture:** All changes stay inside `packages/core`. Six coupled additions, sequenced by dependency: options-schema decision → `StepError` → extended `StepContract` → `ShellService` → `StepInstanceResolver` (ZER-96) → requirements gathering → pipeline pre-flight → `ConfigLoader` integration → sub-command registry → export surface. The existing `ResolvedStep` type is renamed to `PluginStep` (what `defineStep` returns) and a new `ResolvedStep` (plugin + bound options) is introduced — the Pipeline now operates on this richer type.

**Tech Stack:** TypeScript, Bun runtime, `effect` (Layer, Effect, Schema, Cause, Fiber, Exit), `bun:test`, `oxlint`, existing package workspace.

**Related spec:** `docs/superpowers/specs/2026-04-16-zero-line-roadmap-design.md` (section "M-A — Foundation").

**Linear ticket(s):** ZER-96 is the parent. Each task in this plan maps to a single Linear issue + single PR (per project workflow); ticket IDs filed during execution.

---

## File structure

### New files

| Path | Responsibility |
|---|---|
| `packages/core/src/engine/StepError.ts` | Structured error class `{ _tag, code, message, cause }`. Single type used by all plugins. |
| `packages/core/src/engine/StepError.test.ts` | Unit tests. |
| `packages/core/src/engine/PreflightCheck.ts` | Pure function: `preflightCheck(steps, deps) → Effect<void, StepError>`. Aggregates missing secrets / toolchains / env across every resolved step. |
| `packages/core/src/engine/PreflightCheck.test.ts` | Unit tests. |
| `packages/core/src/step-loader/StepInstanceResolver.ts` | ZER-96. `resolveStepInstances(instances, loader) → Effect<ReadonlyArray<ResolvedStep>, StepError>`. Dynamic `import()` per instance, validates via existing `validateStep`, binds `options` to produce a `ResolvedStep`. |
| `packages/core/src/step-loader/StepInstanceResolver.test.ts` | Unit tests with in-memory loader. |
| `packages/core/src/step-loader/StepRequirements.ts` | Resolve declared `requiredSecrets` / `requiredToolchains` / `requiredEnv` from a step (handles static arrays *and* `(opts) => string[]` forms). |
| `packages/core/src/step-loader/StepRequirements.test.ts` | Unit tests. |
| `packages/core/src/ports/ShellService.ts` | Effect port: `spawn({ argv, cwd?, env?, timeoutMs? }) → Effect<ShellResult, ShellError>`. Honours `Effect.interrupt`. |
| `packages/core/src/ports/ShellService.test.ts` | Port-level type + constructor tests. |
| `packages/core/src/adapters/LocalShell.ts` | Bun-subprocess implementation. Streams stdout/stderr via `LoggerService`. SIGTERM then SIGKILL after a grace period on interruption. |
| `packages/core/src/adapters/LocalShell.test.ts` | Integration tests against real short-lived processes (`echo`, `sleep`, `false`). |
| `packages/core/src/adapters/LocalEnvConfig.ts` | Lightweight `ConfigService` adapter that provides `env` + `secret` via `process.env` only. `load()` fails with a descriptive error — real config loading is done via `makeFileConfigLayer(projectDir)`. Included in `DefaultRuntimeLayer` so `preflightCheck` can resolve secrets/env without a project-directory dependency. |
| `packages/core/src/adapters/LocalEnvConfig.test.ts` | Unit tests. |
| `packages/core/src/cli/SubcommandRegistry.ts` | Collect step sub-commands into a flat `Map<string, Handler>` indexed by `${stepName}:${sub}`. |
| `packages/core/src/cli/SubcommandRegistry.test.ts` | Unit tests. |
| `scratch/schema-spike/effect-schema.ts` | Spike artefact: three realistic step option schemas in `effect/Schema`. Deleted after the decision is recorded. |
| `scratch/schema-spike/zod-schema.ts` | Spike artefact: same three schemas in `zod`. Deleted. |
| `docs/superpowers/decisions/2026-04-16-options-schema-library.md` | Decision record capturing the spike outcome. |

### Modified files

| Path | Change |
|---|---|
| `packages/core/src/step-loader/StepContract.ts` | Rename `ResolvedStep` → `PluginStep` (and `ResolvedSimpleStep`/`ResolvedEffectStep` accordingly). Add `optionsSchema`, `requiredSecrets`, `requiredToolchains`, `requiredEnv`, `subcommands` fields to both `defineStep` and `defineEffectStep`. Introduce a new `ResolvedStep` type = `PluginStep & { options, name, dependsOnSteps }`. |
| `packages/core/src/step-loader/StepContract.test.ts` | Tests for every new field. |
| `packages/core/src/step-loader/StepLoader.ts` | Import-only update — types now refer to `PluginStep` instead of `ResolvedStep`. Function name `validateStep` is preserved. |
| `packages/core/src/step-loader/StepLoader.test.ts` | No change needed (covers behaviour, not types). |
| `packages/core/src/step-loader/StepNameResolver.ts` | No functional change; verify typings compile against new `PluginStep`. |
| `packages/core/src/engine/Pipeline.ts` | Accept `ReadonlyArray<ResolvedStep>` (not `PluginStep`). Call `preflightCheck` before the execution loop. Pass `step.options` (not `{}`) to `execute`/`run`. Catch `StepError` specially; surface its `code` on `StepResult`. |
| `packages/core/src/engine/Pipeline.test.ts` | Existing tests updated to the new type; new tests for preflight failure and bound-options propagation. |
| `packages/core/src/config/ConfigLoader.ts` | Accept optional loader hook; after schema-structural validation, if a plugin loader is provided, resolve steps + validate their `options` against `optionsSchema`. |
| `packages/core/src/config/ConfigLoader.test.ts` | New tests for invalid-options rejection at load. |
| `packages/core/src/index.ts` | Export `PluginStep`, `ResolvedStep`, `StepError`, `ShellService`, `LocalShellLive`, `preflightCheck`, `resolveStepInstances`, `SubcommandRegistry` and related types. |
| `packages/core/package.json` | Bump `version` to `0.1.0`; add `publishConfig: { access: "public" }`. |
| `packages/cli/src/cli.ts` | Call step-instance resolver after config load; handle `command.includes(":")` as a sub-command dispatch via `SubcommandRegistry`. |
| `packages/cli/src/cli.test.ts` | Tests for sub-command dispatch happy + error paths. |
| `packages/cli/src/commands/run.ts` | Accept `ReadonlyArray<ResolvedStep>` and propagate `StepError.code` into renderer. |
| `packages/cli/src/commands/run.test.ts` | Adjust to new signatures. |
| `packages/cli/src/output/Renderer.ts` | Render `StepError.code` alongside message when a step fails. |
| `packages/cli/src/output/Renderer.test.ts` | New test. |

---

## Task 1: Options schema library spike (week 1)

**Files:**
- Create: `scratch/schema-spike/effect-schema.ts`
- Create: `scratch/schema-spike/zod-schema.ts`
- Create: `docs/superpowers/decisions/2026-04-16-options-schema-library.md`

- [ ] **Step 1: Scaffold the spike folder**

```bash
mkdir -p scratch/schema-spike docs/superpowers/decisions
```

Add `scratch/` to `.gitignore` if not already there (grep first):

```bash
grep -q "^scratch/" .gitignore || echo "scratch/" >> .gitignore
```

- [ ] **Step 2: Install zod as a dev-only dependency (for the spike)**

```bash
bun add -D --workspace-root zod
```

Expected: `zod` appears in root `package.json` devDependencies. No app code depends on it yet.

- [ ] **Step 3: Write three realistic schemas in `effect/Schema`**

Create `scratch/schema-spike/effect-schema.ts`:

```ts
import { Schema } from "effect"

export const BuildIosOptions = Schema.Struct({
  scheme: Schema.String,
  configuration: Schema.Literal("Debug", "Release"),
  workspace: Schema.optional(Schema.String),
  project: Schema.optional(Schema.String),
  derivedDataPath: Schema.optional(Schema.String),
})

export const SignIosOptions = Schema.Struct({
  certificateName: Schema.String,
  provisioningProfileUuid: Schema.String,
  entitlementsPath: Schema.optional(Schema.String),
})

export const DeployIosOptions = Schema.Struct({
  track: Schema.Literal("testflight", "appstore"),
  apiKeyId: Schema.String,
  apiIssuerId: Schema.String,
  phasedReleasePercent: Schema.optional(Schema.Number),
})
```

- [ ] **Step 4: Write the same three schemas in `zod`**

Create `scratch/schema-spike/zod-schema.ts`:

```ts
import { z } from "zod"

export const BuildIosOptions = z.object({
  scheme: z.string(),
  configuration: z.enum(["Debug", "Release"]),
  workspace: z.string().optional(),
  project: z.string().optional(),
  derivedDataPath: z.string().optional(),
})

export const SignIosOptions = z.object({
  certificateName: z.string(),
  provisioningProfileUuid: z.string(),
  entitlementsPath: z.string().optional(),
})

export const DeployIosOptions = z.object({
  track: z.enum(["testflight", "appstore"]),
  apiKeyId: z.string(),
  apiIssuerId: z.string(),
  phasedReleasePercent: z.number().optional(),
})
```

- [ ] **Step 5: Exercise both libraries against a deliberately-bad input**

Create `scratch/schema-spike/compare.ts`:

```ts
import { Schema } from "effect"
import { z } from "zod"
import * as Effect from "./effect-schema"
import * as Zod from "./zod-schema"

const bad = {
  scheme: "App",
  configuration: "Invalid",
  extraField: true,
}

// Effect
const effectResult = Schema.decodeUnknownEither(Effect.BuildIosOptions)(bad)
console.log("=== effect/Schema ===")
console.log(JSON.stringify(effectResult, null, 2))

// zod
const zodResult = Zod.BuildIosOptions.safeParse(bad)
console.log("=== zod ===")
console.log(JSON.stringify(zodResult, null, 2))
```

Run it:

```bash
bun run scratch/schema-spike/compare.ts
```

Expected: two error payloads printed side-by-side — readable comparison of message quality, structure, field-path precision.

- [ ] **Step 6: Write the decision record**

Create `docs/superpowers/decisions/2026-04-16-options-schema-library.md`. Template (fill in based on the actual spike output):

```markdown
# Decision: Options schema library for `defineStep`

**Date:** 2026-04-16
**Context:** Roadmap spec M-A item #2 — step options schema validation.

## Decision

We use `effect/Schema` (from the `effect` package we already depend on) for plugin options schemas.

## Considered

- `effect/Schema` — zero new deps; composes with Effect; `Schema.decodeUnknownEither` / `Schema.decodeUnknown` integrate cleanly with `Effect.Effect<_, StepError>`.
- `zod` — broader ecosystem familiarity; friendlier default errors; would add a runtime dependency.

## Rationale

[Fill in after running the spike. Include: observed error-message quality, DX observations, integration notes. If zod wins, swap the decision and rationale above.]

## Consequences

- Every plugin declares its `optionsSchema: Schema.Schema<TOpts>` using `effect/Schema`.
- `ConfigLoader` uses `Schema.decodeUnknownEither` to validate `StepInstance.options` at config-load time.
- Schema errors surface through the `StepError` channel as `OPTIONS_VALIDATION_FAILED`.
```

Fill in the rationale section based on the actual spike output (at minimum: a one-paragraph observation per library).

- [ ] **Step 7: Remove the spike artefacts**

```bash
rm -rf scratch/schema-spike
bun remove --workspace-root zod
```

Expected: `zod` gone from `package.json`, spike files gone. Only the decision record remains.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/decisions/2026-04-16-options-schema-library.md .gitignore package.json bun.lock
git commit -m "docs(decisions): record options schema library choice (spike output)"
```

---

## Task 2: `StepError` class

**Files:**
- Create: `packages/core/src/engine/StepError.ts`
- Create: `packages/core/src/engine/StepError.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/engine/StepError.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { StepError } from "./StepError"

describe("StepError", () => {
  test("carries _tag 'StepError', code, message, and optional cause", () => {
    const cause = new Error("wrapped")
    const err = new StepError({
      code: "PREFLIGHT_MISSING_SECRETS",
      message: "Missing secret: APPLE_API_KEY",
      cause,
    })

    expect(err._tag).toBe("StepError")
    expect(err.code).toBe("PREFLIGHT_MISSING_SECRETS")
    expect(err.message).toBe("Missing secret: APPLE_API_KEY")
    expect(err.cause).toBe(cause)
  })

  test("cause is undefined when omitted", () => {
    const err = new StepError({
      code: "CUSTOM",
      message: "boom",
    })
    expect(err.cause).toBeUndefined()
  })

  test("extends native Error so stack traces work", () => {
    const err = new StepError({ code: "X", message: "m" })
    expect(err).toBeInstanceOf(Error)
    expect(typeof err.stack).toBe("string")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/core/src/engine/StepError.test.ts
```

Expected: FAIL with module-not-found (`./StepError`).

- [ ] **Step 3: Implement the class**

Create `packages/core/src/engine/StepError.ts`:

```ts
export interface StepErrorInit {
  readonly code: string
  readonly message: string
  readonly cause?: unknown
}

export class StepError extends Error {
  readonly _tag = "StepError"
  readonly code: string
  readonly cause: unknown

  constructor(init: StepErrorInit) {
    super(init.message)
    this.name = "StepError"
    this.code = init.code
    this.cause = init.cause
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test packages/core/src/engine/StepError.test.ts
```

Expected: 3/3 PASS, 100% coverage on `StepError.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/StepError.ts packages/core/src/engine/StepError.test.ts
git commit -m "feat(core): add structured StepError class"
```

---

## Task 3: Extend `StepContract` — rename `ResolvedStep` → `PluginStep`, add `optionsSchema`

**Files:**
- Modify: `packages/core/src/step-loader/StepContract.ts`
- Modify: `packages/core/src/step-loader/StepContract.test.ts`
- Modify: `packages/core/src/step-loader/StepLoader.ts` (import rename only)
- Modify: `packages/core/src/engine/Pipeline.ts` (import rename only, behaviour preserved)

- [ ] **Step 1: Write the failing test in `StepContract.test.ts`**

Add at the top of the existing `describe("defineStep", ...)`:

```ts
import type { PluginStep, ResolvedStep, OptionsSchema } from "./StepContract"

test("defineStep accepts an optionsSchema and stores it on the plugin", () => {
  const schema: OptionsSchema<{ name: string }> = {
    decode: (raw) => {
      const r = raw as Record<string, unknown>
      if (typeof r.name !== "string") throw new Error("name must be a string")
      return { name: r.name }
    },
  }
  const step = defineStep({
    name: "greet",
    optionsSchema: schema,
    run: async (opts) => ({ greeted: opts.name }),
  })
  expect(step.optionsSchema).toBe(schema)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/core/src/step-loader/StepContract.test.ts
```

Expected: FAIL — `optionsSchema` does not exist on `defineStep` def or its return type.

- [ ] **Step 3: Rename and extend in `StepContract.ts`**

Replace the entire contents of `packages/core/src/step-loader/StepContract.ts` with:

```ts
import { Effect } from "effect"

export interface OptionsSchema<T> {
  readonly decode: (raw: unknown) => T
}

export interface StepContext {
  readonly logger: {
    readonly info: (msg: string) => void
    readonly warn: (msg: string) => void
    readonly error: (msg: string) => void
    readonly debug: (msg: string) => void
  }
  readonly config: {
    readonly env: (key: string) => string | undefined
    readonly secret: (key: string) => string | undefined
  }
  readonly platform: {
    readonly os: () => string
    readonly availableToolchains: () => ReadonlyArray<string>
    readonly supports: (platform: string) => boolean
  }
  readonly artifacts: {
    readonly put: (key: string, artifact: unknown) => void
    readonly get: (key: string) => unknown | undefined
    readonly list: () => ReadonlyArray<string>
  }
}

export interface SimpleStepDef<TOpts = Record<string, unknown>> {
  readonly name: string
  readonly dependsOnSteps?: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<TOpts>
  readonly run: (opts: TOpts, ctx: StepContext) => Promise<Record<string, unknown>>
}

export interface EffectStepDef<TOpts = Record<string, unknown>> {
  readonly name: string
  readonly dependsOnSteps?: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<TOpts>
  readonly run: (opts: TOpts) => Effect.Effect<Record<string, unknown>, unknown, unknown>
}

export interface SimplePluginStep {
  readonly _tag: "simple"
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<unknown>
  readonly execute: (opts: Record<string, unknown>, ctx: StepContext) => Promise<Record<string, unknown>>
}

export interface EffectPluginStep {
  readonly _tag: "effect"
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
  readonly optionsSchema?: OptionsSchema<unknown>
  readonly run: (opts: Record<string, unknown>) => Effect.Effect<Record<string, unknown>, unknown, unknown>
}

export type PluginStep = SimplePluginStep | EffectPluginStep

export interface ResolvedStep {
  readonly plugin: PluginStep
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
  readonly options: Record<string, unknown>
}

export function defineStep<TOpts = Record<string, unknown>>(
  def: SimpleStepDef<TOpts>
): SimplePluginStep {
  return {
    _tag: "simple",
    name: def.name,
    dependsOnSteps: def.dependsOnSteps ?? [],
    optionsSchema: def.optionsSchema as OptionsSchema<unknown> | undefined,
    execute: (opts, ctx) => def.run(opts as TOpts, ctx),
  }
}

export function defineEffectStep<TOpts = Record<string, unknown>>(
  def: EffectStepDef<TOpts>
): EffectPluginStep {
  return {
    _tag: "effect",
    name: def.name,
    dependsOnSteps: def.dependsOnSteps ?? [],
    optionsSchema: def.optionsSchema as OptionsSchema<unknown> | undefined,
    run: (opts) => def.run(opts as TOpts),
  }
}
```

- [ ] **Step 4: Update `StepLoader.ts` import and type**

Edit `packages/core/src/step-loader/StepLoader.ts`:

```ts
import type { PluginStep } from "./StepContract"

export interface ValidationResult {
  readonly valid: boolean
  readonly error?: string
}

export interface LoadResult {
  readonly steps: ReadonlyArray<PluginStep>
  readonly errors: ReadonlyArray<string>
}

export function validateStep(step: unknown): ValidationResult {
  // ... existing body unchanged (no type changes needed)
}

export function loadSteps(rawSteps: ReadonlyArray<unknown>): LoadResult {
  const steps: PluginStep[] = []
  const errors: string[] = []
  for (const raw of rawSteps) {
    const validation = validateStep(raw)
    if (validation.valid) {
      steps.push(raw as PluginStep)
    } else {
      errors.push(validation.error!)
    }
  }
  return { steps, errors }
}
```

- [ ] **Step 5: Update `Pipeline.ts` import only (behaviour preserved for now)**

In `packages/core/src/engine/Pipeline.ts`, change:

```ts
import type { ResolvedStep, StepContext } from "../step-loader/StepContract"
```

to:

```ts
import type { PluginStep, StepContext } from "../step-loader/StepContract"
```

Then replace every occurrence of `ResolvedStep` with `PluginStep` in the file (9 occurrences in types, the `steps` field, the `stepMap`, the `definePipeline` signature).

(A later task, Task 12, changes Pipeline to take `ResolvedStep` — the new one with bound options. This step just resolves the naming collision.)

- [ ] **Step 6: Run tests to verify they pass**

```bash
bunx tsc --noEmit -p packages/core/tsconfig.json
bun test --recursive packages/
```

Expected: typecheck green; all 95 tests still pass; new test added in Step 1 passes.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/step-loader/StepContract.ts \
        packages/core/src/step-loader/StepContract.test.ts \
        packages/core/src/step-loader/StepLoader.ts \
        packages/core/src/engine/Pipeline.ts
git commit -m "refactor(core): rename ResolvedStep→PluginStep, add optionsSchema field"
```

---

## Task 4: Extend `StepContract` — `requiredSecrets` / `requiredToolchains` / `requiredEnv`

**Files:**
- Modify: `packages/core/src/step-loader/StepContract.ts`
- Modify: `packages/core/src/step-loader/StepContract.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `StepContract.test.ts`:

```ts
test("defineStep accepts static requiredSecrets array", () => {
  const step = defineStep({
    name: "sign-ios",
    requiredSecrets: ["APPLE_API_KEY", "APPLE_ISSUER_ID"],
    run: async () => ({}),
  })
  expect(step.requiredSecrets).toEqual(["APPLE_API_KEY", "APPLE_ISSUER_ID"])
})

test("defineStep accepts dynamic requiredSecrets function", () => {
  const step = defineStep<{ teamId: string }>({
    name: "sign-ios",
    requiredSecrets: (opts) => [`APPLE_API_KEY_${opts.teamId}`],
    run: async () => ({}),
  })
  expect(typeof step.requiredSecrets).toBe("function")
  const fn = step.requiredSecrets as (o: Record<string, unknown>) => ReadonlyArray<string>
  expect(fn({ teamId: "XYZ" })).toEqual(["APPLE_API_KEY_XYZ"])
})

test("defineStep accepts requiredToolchains and requiredEnv", () => {
  const step = defineStep({
    name: "build-ios",
    requiredToolchains: ["xcode"],
    requiredEnv: ["CI"],
    run: async () => ({}),
  })
  expect(step.requiredToolchains).toEqual(["xcode"])
  expect(step.requiredEnv).toEqual(["CI"])
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
bun test packages/core/src/step-loader/StepContract.test.ts
```

Expected: FAIL — fields don't exist on the def or return type.

- [ ] **Step 3: Define a reusable `Requirement<T>` type and extend the defs**

At the top of `StepContract.ts`, below the imports, add:

```ts
export type Requirement<TOpts> =
  | ReadonlyArray<string>
  | ((opts: TOpts) => ReadonlyArray<string>)
```

In `SimpleStepDef<TOpts>` and `EffectStepDef<TOpts>`, add three optional fields:

```ts
readonly requiredSecrets?: Requirement<TOpts>
readonly requiredToolchains?: Requirement<TOpts>
readonly requiredEnv?: Requirement<TOpts>
```

In `SimplePluginStep` and `EffectPluginStep`, mirror them (loosened to the `unknown` options type):

```ts
readonly requiredSecrets?: Requirement<Record<string, unknown>>
readonly requiredToolchains?: Requirement<Record<string, unknown>>
readonly requiredEnv?: Requirement<Record<string, unknown>>
```

In `defineStep` and `defineEffectStep`, pass the fields through (cast to the widened type):

```ts
requiredSecrets: def.requiredSecrets as Requirement<Record<string, unknown>> | undefined,
requiredToolchains: def.requiredToolchains as Requirement<Record<string, unknown>> | undefined,
requiredEnv: def.requiredEnv as Requirement<Record<string, unknown>> | undefined,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx tsc --noEmit -p packages/core/tsconfig.json
bun test packages/core/src/step-loader/StepContract.test.ts
```

Expected: PASS all new tests; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/step-loader/StepContract.ts \
        packages/core/src/step-loader/StepContract.test.ts
git commit -m "feat(core): step-declared requiredSecrets/Toolchains/Env in StepContract"
```

---

## Task 5: Extend `StepContract` — `subcommands`

**Files:**
- Modify: `packages/core/src/step-loader/StepContract.ts`
- Modify: `packages/core/src/step-loader/StepContract.test.ts`

- [ ] **Step 1: Add failing test**

Append to `StepContract.test.ts`:

```ts
test("defineStep accepts subcommands as a record of handlers", async () => {
  const step = defineStep({
    name: "sign-ios",
    subcommands: {
      init: async (argv) => {
        return argv.length === 0 ? 0 : 1
      },
    },
    run: async () => ({}),
  })
  expect(step.subcommands).toBeDefined()
  const handler = step.subcommands!.init
  expect(await handler([])).toBe(0)
  expect(await handler(["--force"])).toBe(1)
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test packages/core/src/step-loader/StepContract.test.ts
```

Expected: FAIL — `subcommands` does not exist.

- [ ] **Step 3: Define the handler type and add the field**

At the top of `StepContract.ts` (below imports), add:

```ts
export type SubcommandHandler = (argv: ReadonlyArray<string>) => Promise<number>
```

Add to both `SimpleStepDef` / `EffectStepDef` / `SimplePluginStep` / `EffectPluginStep`:

```ts
readonly subcommands?: Record<string, SubcommandHandler>
```

Pass through in the factory functions:

```ts
subcommands: def.subcommands,
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/core/src/step-loader/StepContract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/step-loader/StepContract.ts \
        packages/core/src/step-loader/StepContract.test.ts
git commit -m "feat(core): subcommand registration in StepContract"
```

---

## Task 6: `ShellService` port

**Files:**
- Create: `packages/core/src/ports/ShellService.ts`
- Create: `packages/core/src/ports/ShellService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/ports/ShellService.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { ShellService, ShellError } from "./ShellService"

describe("ShellService port", () => {
  test("ShellService is an Effect Context.Tag", () => {
    expect(ShellService.key).toBe("ShellService")
  })

  test("ShellError carries _tag, code, message, exitCode", () => {
    const err = new ShellError({
      code: "NON_ZERO_EXIT",
      message: "xcodebuild failed",
      exitCode: 65,
    })
    expect(err._tag).toBe("ShellError")
    expect(err.code).toBe("NON_ZERO_EXIT")
    expect(err.exitCode).toBe(65)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test packages/core/src/ports/ShellService.test.ts
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Write the port**

Create `packages/core/src/ports/ShellService.ts`:

```ts
import { Context, Effect } from "effect"

export interface ShellSpawnOptions {
  readonly argv: ReadonlyArray<string>
  readonly cwd?: string
  readonly env?: Record<string, string>
  readonly timeoutMs?: number
}

export interface ShellResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export class ShellError {
  readonly _tag = "ShellError"
  readonly code: string
  readonly message: string
  readonly exitCode?: number
  readonly cause?: unknown

  constructor(init: {
    code: string
    message: string
    exitCode?: number
    cause?: unknown
  }) {
    this.code = init.code
    this.message = init.message
    this.exitCode = init.exitCode
    this.cause = init.cause
  }
}

export interface IShellService {
  readonly spawn: (
    opts: ShellSpawnOptions
  ) => Effect.Effect<ShellResult, ShellError>
}

export class ShellService extends Context.Tag("ShellService")<
  ShellService,
  IShellService
>() {}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test packages/core/src/ports/ShellService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ports/ShellService.ts \
        packages/core/src/ports/ShellService.test.ts
git commit -m "feat(core): add ShellService port with ShellError"
```

---

## Task 7: `LocalShell` adapter — spawn and streaming

**Files:**
- Create: `packages/core/src/adapters/LocalShell.ts`
- Create: `packages/core/src/adapters/LocalShell.test.ts`

- [ ] **Step 1: Write the happy-path failing test**

Create `packages/core/src/adapters/LocalShell.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ShellService } from "../ports/ShellService"
import { LocalShellLive } from "./LocalShell"

const runWithShell = <A, E>(eff: Effect.Effect<A, E, ShellService>) =>
  Effect.runPromise(Effect.provide(eff, LocalShellLive))

describe("LocalShell", () => {
  test("spawns a successful command and returns stdout", async () => {
    const result = await runWithShell(
      Effect.gen(function* () {
        const sh = yield* ShellService
        return yield* sh.spawn({ argv: ["echo", "hello"] })
      })
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("hello")
  })

  test("fails with NON_ZERO_EXIT on a failing command", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const sh = yield* ShellService
          return yield* sh.spawn({ argv: ["false"] })
        }),
        LocalShellLive
      )
    )
    expect(exit._tag).toBe("Failure")
    const text = JSON.stringify(exit)
    expect(text).toContain("NON_ZERO_EXIT")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test packages/core/src/adapters/LocalShell.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal `LocalShell` adapter**

Create `packages/core/src/adapters/LocalShell.ts`:

```ts
import { Effect, Layer } from "effect"
import { ShellService, ShellError, type ShellResult, type ShellSpawnOptions } from "../ports/ShellService"

async function runOnce(opts: ShellSpawnOptions): Promise<ShellResult> {
  const [command, ...args] = opts.argv
  if (!command) {
    throw new ShellError({ code: "EMPTY_ARGV", message: "argv must have at least one entry" })
  }
  const proc = Bun.spawn([command, ...args], {
    cwd: opts.cwd,
    env: opts.env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { exitCode, stdout, stderr }
}

export const LocalShellLive = Layer.succeed(ShellService, {
  spawn: (opts) =>
    Effect.tryPromise({
      try: () => runOnce(opts),
      catch: (err) =>
        err instanceof ShellError
          ? err
          : new ShellError({
              code: "SPAWN_FAILED",
              message: err instanceof Error ? err.message : String(err),
              cause: err,
            }),
    }).pipe(
      Effect.flatMap((result) =>
        result.exitCode === 0
          ? Effect.succeed(result)
          : Effect.fail(
              new ShellError({
                code: "NON_ZERO_EXIT",
                message: `Command '${opts.argv.join(" ")}' exited with ${result.exitCode}`,
                exitCode: result.exitCode,
              })
            )
      )
    ),
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test packages/core/src/adapters/LocalShell.test.ts
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/adapters/LocalShell.ts packages/core/src/adapters/LocalShell.test.ts
git commit -m "feat(core): add LocalShell adapter (happy-path spawn + streaming)"
```

---

## Task 8: `LocalShell` adapter — cancellation + timeout

**Files:**
- Modify: `packages/core/src/adapters/LocalShell.ts`
- Modify: `packages/core/src/adapters/LocalShell.test.ts`

- [ ] **Step 1: Add failing cancellation test**

Append to `LocalShell.test.ts`:

```ts
import { Fiber, Duration } from "effect"

test("honours Effect.interrupt by killing the subprocess (SIGTERM)", async () => {
  const program = Effect.gen(function* () {
    const sh = yield* ShellService
    return yield* sh.spawn({ argv: ["sleep", "10"] })
  })

  const fiber = Effect.runFork(Effect.provide(program, LocalShellLive))
  // give it a moment to start, then interrupt
  await new Promise((r) => setTimeout(r, 100))
  Fiber.interrupt(fiber)

  const exit = await Effect.runPromise(Fiber.await(fiber))
  expect(exit._tag).toBe("Failure")
  // exit should come quickly (under 2s), not wait for sleep 10 to finish
})

test("times out after timeoutMs with structured error", async () => {
  const exit = await Effect.runPromiseExit(
    Effect.provide(
      Effect.gen(function* () {
        const sh = yield* ShellService
        return yield* sh.spawn({ argv: ["sleep", "5"], timeoutMs: 250 })
      }),
      LocalShellLive
    )
  )
  expect(exit._tag).toBe("Failure")
  expect(JSON.stringify(exit)).toContain("TIMEOUT")
})
```

- [ ] **Step 2: Run tests to verify failure**

```bash
bun test packages/core/src/adapters/LocalShell.test.ts
```

Expected: both new tests FAIL (cancellation kills nothing; no timeout support).

- [ ] **Step 3: Replace the adapter body with cancellation + timeout support**

Replace the entirety of `LocalShell.ts` with:

```ts
import { Effect, Layer } from "effect"
import { ShellService, ShellError, type ShellResult, type ShellSpawnOptions } from "../ports/ShellService"

const SIGTERM_GRACE_MS = 1_000

function spawnEffect(opts: ShellSpawnOptions): Effect.Effect<ShellResult, ShellError> {
  return Effect.async<ShellResult, ShellError>((resume) => {
    const [command, ...args] = opts.argv
    if (!command) {
      return resume(
        Effect.fail(new ShellError({ code: "EMPTY_ARGV", message: "argv must have at least one entry" }))
      )
    }

    let settled = false
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    let killEscalationHandle: ReturnType<typeof setTimeout> | undefined

    const proc = Bun.spawn([command, ...args], {
      cwd: opts.cwd,
      env: opts.env,
      stdout: "pipe",
      stderr: "pipe",
    })

    Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
      .then(([stdout, stderr, exitCode]) => {
        if (settled) return
        settled = true
        if (timeoutHandle) clearTimeout(timeoutHandle)
        if (killEscalationHandle) clearTimeout(killEscalationHandle)
        if (exitCode === 0) {
          resume(Effect.succeed({ exitCode, stdout, stderr }))
        } else {
          resume(
            Effect.fail(
              new ShellError({
                code: "NON_ZERO_EXIT",
                message: `Command '${opts.argv.join(" ")}' exited with ${exitCode}`,
                exitCode,
              })
            )
          )
        }
      })
      .catch((err) => {
        if (settled) return
        settled = true
        resume(
          Effect.fail(
            new ShellError({
              code: "SPAWN_FAILED",
              message: err instanceof Error ? err.message : String(err),
              cause: err,
            })
          )
        )
      })

    if (opts.timeoutMs !== undefined) {
      timeoutHandle = setTimeout(() => {
        if (settled) return
        settled = true
        proc.kill("SIGTERM")
        killEscalationHandle = setTimeout(() => proc.kill("SIGKILL"), SIGTERM_GRACE_MS)
        resume(
          Effect.fail(
            new ShellError({
              code: "TIMEOUT",
              message: `Command '${opts.argv.join(" ")}' timed out after ${opts.timeoutMs}ms`,
            })
          )
        )
      }, opts.timeoutMs)
    }

    return Effect.sync(() => {
      if (!settled) {
        settled = true
        proc.kill("SIGTERM")
        killEscalationHandle = setTimeout(() => proc.kill("SIGKILL"), SIGTERM_GRACE_MS)
      }
      if (timeoutHandle) clearTimeout(timeoutHandle)
    })
  })
}

export const LocalShellLive = Layer.succeed(ShellService, {
  spawn: (opts) => spawnEffect(opts),
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/core/src/adapters/LocalShell.test.ts
```

Expected: all four tests PASS within a few seconds (no hanging on `sleep 10`).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/adapters/LocalShell.ts packages/core/src/adapters/LocalShell.test.ts
git commit -m "feat(core): LocalShell honours Effect.interrupt and timeoutMs (SIGTERM→SIGKILL)"
```

---

## Task 9: `StepInstanceResolver` — dynamic import

**Files:**
- Create: `packages/core/src/step-loader/StepInstanceResolver.ts`
- Create: `packages/core/src/step-loader/StepInstanceResolver.test.ts`

- [ ] **Step 1: Write failing test with an injectable loader**

Create `packages/core/src/step-loader/StepInstanceResolver.test.ts`:

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
    expect(JSON.stringify(exit)).toContain("STEP_NOT_FOUND")
  })

  test("fails with INVALID_PLUGIN when the loaded export is not a valid plugin", async () => {
    const loader = async (_name: string) => ({ nope: true } as any)
    const instances: ReadonlyArray<StepInstance> = [{ name: "broken", options: {} }]

    const exit = await Effect.runPromiseExit(resolveStepInstances(instances, loader))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(JSON.stringify(exit)).toContain("INVALID_PLUGIN")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test packages/core/src/step-loader/StepInstanceResolver.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the resolver**

Create `packages/core/src/step-loader/StepInstanceResolver.ts`:

```ts
import { Effect } from "effect"
import { StepError } from "../engine/StepError"
import type { PluginStep, ResolvedStep } from "./StepContract"
import { validateStep } from "./StepLoader"
import type { StepInstance } from "../config/ConfigTypes"

// Loader stays Promise-valued at the boundary because `import()` is
// Promise-native; the resolver wraps it with Effect.tryPromise internally
// so callers see only the Effect surface.
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
          message: `Plugin '${instance.name}' is not a valid step: ${validation.error ?? "unknown"}`,
        })
      )
    }

    const plugin = raw as PluginStep
    return {
      plugin,
      // Workflow-bound name — keep the instance's identifier even when it
      // is aliased away from plugin.name.
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

**Note on Promise vs Effect:** earlier drafts of this plan copied the `loadConfig` Promise idiom for the resolver body, which contradicted the summary at the top of this doc (`Effect<ReadonlyArray<ResolvedStep>, StepError>`). ZER-150 reconciled the two — the resolver now returns `Effect`, failures flow through the typed `StepError` channel, and per-instance resolution is parallelised via `Effect.all({ concurrency: "unbounded" })` (same semantics as the prior `Promise.all`).

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/core/src/step-loader/StepInstanceResolver.test.ts
```

Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/step-loader/StepInstanceResolver.ts \
        packages/core/src/step-loader/StepInstanceResolver.test.ts
git commit -m "feat(core): step instance resolver with dynamic import and options binding (ZER-96)"
```

---

## Task 10: `StepRequirements` — gather helper

**Files:**
- Create: `packages/core/src/step-loader/StepRequirements.ts`
- Create: `packages/core/src/step-loader/StepRequirements.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/src/step-loader/StepRequirements.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { defineStep } from "./StepContract"
import { gatherRequirements } from "./StepRequirements"
import type { ResolvedStep } from "./StepContract"

const toResolved = (plugin: ReturnType<typeof defineStep>, options: Record<string, unknown> = {}): ResolvedStep => ({
  plugin,
  name: plugin.name,
  dependsOnSteps: plugin.dependsOnSteps,
  options,
})

describe("gatherRequirements", () => {
  test("collects static requirements across multiple steps", () => {
    const s1 = defineStep({
      name: "a",
      requiredSecrets: ["KEY_A"],
      requiredToolchains: ["xcode"],
      run: async () => ({}),
    })
    const s2 = defineStep({
      name: "b",
      requiredSecrets: ["KEY_B"],
      requiredEnv: ["CI"],
      run: async () => ({}),
    })

    const reqs = gatherRequirements([toResolved(s1), toResolved(s2)])
    expect(reqs.secrets).toEqual([
      { stepName: "a", key: "KEY_A" },
      { stepName: "b", key: "KEY_B" },
    ])
    expect(reqs.toolchains).toEqual([{ stepName: "a", key: "xcode" }])
    expect(reqs.env).toEqual([{ stepName: "b", key: "CI" }])
  })

  test("evaluates function-valued requirements against bound options", () => {
    const step = defineStep<{ teamId: string }>({
      name: "sign",
      requiredSecrets: (opts) => [`APPLE_API_KEY_${opts.teamId}`],
      run: async () => ({}),
    })
    const resolved = toResolved(step, { teamId: "XYZ" })
    const reqs = gatherRequirements([resolved])
    expect(reqs.secrets).toEqual([{ stepName: "sign", key: "APPLE_API_KEY_XYZ" }])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test packages/core/src/step-loader/StepRequirements.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `gatherRequirements`**

Create `packages/core/src/step-loader/StepRequirements.ts`:

```ts
import type { ResolvedStep, Requirement } from "./StepContract"

export interface RequirementEntry {
  readonly stepName: string
  readonly key: string
}

export interface Requirements {
  readonly secrets: ReadonlyArray<RequirementEntry>
  readonly toolchains: ReadonlyArray<RequirementEntry>
  readonly env: ReadonlyArray<RequirementEntry>
}

function resolveOne(
  req: Requirement<Record<string, unknown>> | undefined,
  options: Record<string, unknown>
): ReadonlyArray<string> {
  if (req === undefined) return []
  if (typeof req === "function") return req(options)
  return req
}

export function gatherRequirements(steps: ReadonlyArray<ResolvedStep>): Requirements {
  const secrets: RequirementEntry[] = []
  const toolchains: RequirementEntry[] = []
  const env: RequirementEntry[] = []

  for (const step of steps) {
    for (const key of resolveOne(step.plugin.requiredSecrets, step.options)) {
      secrets.push({ stepName: step.name, key })
    }
    for (const key of resolveOne(step.plugin.requiredToolchains, step.options)) {
      toolchains.push({ stepName: step.name, key })
    }
    for (const key of resolveOne(step.plugin.requiredEnv, step.options)) {
      env.push({ stepName: step.name, key })
    }
  }

  return { secrets, toolchains, env }
}
```

Re-export `Requirement` from `StepContract.ts` if it isn't already (check).

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/core/src/step-loader/StepRequirements.test.ts
```

Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/step-loader/StepRequirements.ts \
        packages/core/src/step-loader/StepRequirements.test.ts
git commit -m "feat(core): step requirements gathering (static + dynamic)"
```

---

## Task 11: `PreflightCheck` — run requirements against services

**Files:**
- Create: `packages/core/src/engine/PreflightCheck.ts`
- Create: `packages/core/src/engine/PreflightCheck.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/src/engine/PreflightCheck.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { defineStep } from "../step-loader/StepContract"
import type { ResolvedStep } from "../step-loader/StepContract"
import { preflightCheck } from "./PreflightCheck"
import { ConfigService, SecretNotFoundError } from "../ports/ConfigService"
import { PlatformService } from "../ports/PlatformService"
import type { IPlatformService } from "../ports/PlatformService"
import type { IConfigService } from "../ports/ConfigService"

const toResolved = (plugin: ReturnType<typeof defineStep>, options: Record<string, unknown> = {}): ResolvedStep => ({
  plugin, name: plugin.name, dependsOnSteps: plugin.dependsOnSteps, options,
})

const stubConfig = (secrets: Record<string, string>, env: Record<string, string> = {}): IConfigService => ({
  load: () => Effect.die("not used"),
  env: (k) => Effect.succeed(env[k]),
  secret: (k) =>
    k in secrets
      ? Effect.succeed(secrets[k]!)
      : Effect.fail(new SecretNotFoundError(k)),
})
const stubPlatform = (toolchains: ReadonlyArray<string>): IPlatformService => ({
  os: () => Effect.succeed("darwin"),
  availableToolchains: () => Effect.succeed(toolchains as any),
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
      name: "a", requiredSecrets: ["MISSING_1"], run: async () => ({}),
    })
    const step2 = defineStep({
      name: "b", requiredSecrets: ["MISSING_2"], run: async () => ({}),
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
    expect(text).toContain("a")
    expect(text).toContain("b")
  })

  test("fails with PREFLIGHT_MISSING_TOOLCHAINS when toolchain absent", async () => {
    const step = defineStep({
      name: "build", requiredToolchains: ["xcode"], run: async () => ({}),
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
      name: "ci", requiredEnv: ["CI"], run: async () => ({}),
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
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test packages/core/src/engine/PreflightCheck.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `preflightCheck`**

Create `packages/core/src/engine/PreflightCheck.ts`:

```ts
import { Effect } from "effect"
import type { ResolvedStep } from "../step-loader/StepContract"
import { gatherRequirements } from "../step-loader/StepRequirements"
import { StepError } from "./StepError"
import { ConfigService } from "../ports/ConfigService"
import { PlatformService } from "../ports/PlatformService"

export function preflightCheck(
  steps: ReadonlyArray<ResolvedStep>
): Effect.Effect<void, StepError, ConfigService | PlatformService> {
  return Effect.gen(function* () {
    const requirements = gatherRequirements(steps)
    const config = yield* ConfigService
    const platform = yield* PlatformService

    const missingSecrets: typeof requirements.secrets[number][] = []
    for (const entry of requirements.secrets) {
      const exit = yield* Effect.exit(config.secret(entry.key))
      if (exit._tag === "Failure") missingSecrets.push(entry)
    }
    if (missingSecrets.length > 0) {
      const summary = missingSecrets.map((e) => `  - ${e.key} (required by step '${e.stepName}')`).join("\n")
      return yield* Effect.fail(
        new StepError({
          code: "PREFLIGHT_MISSING_SECRETS",
          message: `Missing required secrets:\n${summary}`,
        })
      )
    }

    const availableToolchains = yield* platform.availableToolchains()
    const missingToolchains = requirements.toolchains.filter(
      (t) => !availableToolchains.includes(t.key as any)
    )
    if (missingToolchains.length > 0) {
      const summary = missingToolchains.map((e) => `  - ${e.key} (required by step '${e.stepName}')`).join("\n")
      return yield* Effect.fail(
        new StepError({
          code: "PREFLIGHT_MISSING_TOOLCHAINS",
          message: `Missing required toolchains:\n${summary}`,
        })
      )
    }

    const missingEnv: typeof requirements.env[number][] = []
    for (const entry of requirements.env) {
      const value = yield* config.env(entry.key)
      if (value === undefined) missingEnv.push(entry)
    }
    if (missingEnv.length > 0) {
      const summary = missingEnv.map((e) => `  - ${e.key} (required by step '${e.stepName}')`).join("\n")
      return yield* Effect.fail(
        new StepError({
          code: "PREFLIGHT_MISSING_ENV",
          message: `Missing required env vars:\n${summary}`,
        })
      )
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/core/src/engine/PreflightCheck.test.ts
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/PreflightCheck.ts packages/core/src/engine/PreflightCheck.test.ts
git commit -m "feat(core): pipeline pre-flight check for secrets, toolchains, env"
```

---

## Task 11b: `LocalEnvConfigLive` adapter

**Files:**
- Create: `packages/core/src/adapters/LocalEnvConfig.ts`
- Create: `packages/core/src/adapters/LocalEnvConfig.test.ts`

**Why:** `preflightCheck` requires a `ConfigService` in its environment. The existing `makeFileConfigLayer(projectDir)` adapter is a function of the project directory, not a module-level `Layer`, so it can't be baked into `DefaultRuntimeLayer`. Adding a project-dir-free env-backed `ConfigService` lets `DefaultRuntimeLayer` satisfy the preflight requirements without callers having to construct a custom layer.

- [ ] **Step 1: Write failing test**

Create `packages/core/src/adapters/LocalEnvConfig.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { ConfigService, ConfigLoadError } from "../ports/ConfigService"
import { LocalEnvConfigLive } from "./LocalEnvConfig"

const run = <A, E>(eff: Effect.Effect<A, E, ConfigService>) =>
  Effect.runPromiseExit(Effect.provide(eff, LocalEnvConfigLive))

describe("LocalEnvConfigLive", () => {
  test("env reads process.env", async () => {
    process.env.__ZL_ENV_TEST__ = "v"
    const exit = await run(
      Effect.gen(function* () {
        const c = yield* ConfigService
        return yield* c.env("__ZL_ENV_TEST__")
      })
    )
    expect(exit._tag).toBe("Success")
    if (exit._tag === "Success") expect(exit.value).toBe("v")
    delete process.env.__ZL_ENV_TEST__
  })

  test("secret returns env value when present", async () => {
    process.env.__ZL_SECRET_PRESENT__ = "shh"
    const exit = await run(
      Effect.gen(function* () {
        const c = yield* ConfigService
        return yield* c.secret("__ZL_SECRET_PRESENT__")
      })
    )
    expect(exit._tag).toBe("Success")
    if (exit._tag === "Success") expect(exit.value).toBe("shh")
    delete process.env.__ZL_SECRET_PRESENT__
  })

  test("secret fails with SecretNotFoundError when absent", async () => {
    const exit = await run(
      Effect.gen(function* () {
        const c = yield* ConfigService
        return yield* c.secret("__ZL_SECRET_ABSENT__")
      })
    )
    expect(exit._tag).toBe("Failure")
    expect(JSON.stringify(exit)).toContain("SecretNotFoundError")
  })

  test("load fails with descriptive ConfigLoadError directing to makeFileConfigLayer", async () => {
    const exit = await run(
      Effect.gen(function* () {
        const c = yield* ConfigService
        return yield* c.load()
      })
    )
    expect(exit._tag).toBe("Failure")
    expect(JSON.stringify(exit)).toContain("ConfigLoadError")
    expect(JSON.stringify(exit)).toContain("makeFileConfigLayer")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test packages/core/src/adapters/LocalEnvConfig.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the adapter**

Create `packages/core/src/adapters/LocalEnvConfig.ts`:

```ts
import { Effect, Layer } from "effect"
import { ConfigService, ConfigLoadError, SecretNotFoundError } from "../ports/ConfigService"

export const LocalEnvConfigLive = Layer.succeed(ConfigService, {
  load: () =>
    Effect.fail(
      new ConfigLoadError(
        "LocalEnvConfigLive does not support load(); use makeFileConfigLayer(projectDir) to load zl.config.ts"
      )
    ),
  env: (key: string) => Effect.succeed(process.env[key]),
  secret: (key: string) =>
    Effect.suspend(() => {
      const value = process.env[key]
      return value !== undefined
        ? Effect.succeed(value)
        : Effect.fail(new SecretNotFoundError(key))
    }),
})
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test packages/core/src/adapters/LocalEnvConfig.test.ts
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/adapters/LocalEnvConfig.ts packages/core/src/adapters/LocalEnvConfig.test.ts
git commit -m "feat(core): add LocalEnvConfigLive adapter for preflight (env + secret from process.env)"
```

---

## Task 12: Integrate pre-flight + bound options into `Pipeline`

**Files:**
- Modify: `packages/core/src/engine/Pipeline.ts`
- Modify: `packages/core/src/engine/Pipeline.test.ts`

- [ ] **Step 1: Write new failing tests for bound options and preflight**

In `Pipeline.test.ts`, add these tests inside `describe("Pipeline", ...)`:

```ts
test("passes bound options from the ResolvedStep to plugin execute()", async () => {
  const captured: Array<Record<string, unknown>> = []
  const plugin = defineStep({
    name: "echo",
    run: async (opts) => {
      captured.push(opts)
      return {}
    },
  })
  const resolved = {
    plugin, name: plugin.name, dependsOnSteps: plugin.dependsOnSteps,
    options: { greeting: "hi" },
  }
  const pipeline = definePipeline({ steps: [resolved], workflow: ["echo"] })
  await pipeline.execute()
  expect(captured).toEqual([{ greeting: "hi" }])
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
  const resolved = {
    plugin, name: plugin.name, dependsOnSteps: plugin.dependsOnSteps, options: {},
  }
  const pipeline = definePipeline({ steps: [resolved], workflow: ["needs-secret"] })
  const results = await pipeline.execute()

  expect(ran).toEqual([])
  expect(results[0].status).toBe("fail")
  expect(results[0].error?.code).toBe("PREFLIGHT_MISSING_SECRETS")
})
```

You'll also need to update the existing Pipeline tests: every place constructing `steps: [step1, step2]` where `step1` is a plugin (from `defineStep`) now needs to wrap in a `ResolvedStep`. Helper:

```ts
const resolved = (plugin: PluginStep, options: Record<string, unknown> = {}): ResolvedStep => ({
  plugin, name: plugin.name, dependsOnSteps: plugin.dependsOnSteps, options,
})
```

Apply this wrapper to every `definePipeline({ steps: [...] })` call in the test file.

- [ ] **Step 2: Run tests to verify failure**

```bash
bun test packages/core/src/engine/Pipeline.test.ts
```

Expected: new tests FAIL (Pipeline still takes `PluginStep`, doesn't run preflight); existing tests may compile-fail depending on how the refactor lands — that's fine, we'll fix in step 3.

- [ ] **Step 3: Change `Pipeline` to operate on `ResolvedStep` and run preflight**

Replace `Pipeline.ts` with:

```ts
import { Cause, Effect, Layer, ManagedRuntime, Option } from "effect"
import { buildExecutionOrder } from "./DependencyGraph"
import { preflightCheck } from "./PreflightCheck"
import { StepError } from "./StepError"
import type { ResolvedStep, StepContext } from "../step-loader/StepContract"
import { ConsoleLoggerLive } from "../adapters/ConsoleLogger"
import { LocalPlatformLive, detectToolchains, platformSupports } from "../adapters/LocalPlatform"
import { MemoryArtifactStoreLive } from "../adapters/MemoryArtifactStore"
import { LocalShellLive } from "../adapters/LocalShell"
import { LocalEnvConfigLive } from "../adapters/LocalEnvConfig"

export const DefaultRuntimeLayer = Layer.mergeAll(
  ConsoleLoggerLive,
  LocalPlatformLive,
  MemoryArtifactStoreLive,
  LocalShellLive,
  LocalEnvConfigLive,
)

export interface StepResult {
  readonly name: string
  readonly status: "pass" | "fail" | "skipped"
  readonly durationMs: number
  readonly error?: StepError
  readonly output?: Record<string, unknown>
}

export interface PipelineConfig {
  readonly steps: ReadonlyArray<ResolvedStep>
  readonly workflow: ReadonlyArray<string>
  readonly context?: Partial<StepContext>
  readonly runtimeLayer?: Layer.Layer<any, any, never>
  readonly skipPreflight?: boolean
  readonly preflightLayer?: Layer.Layer<any, any, never>
}

// makeDefaultContext remains unchanged — keep existing body verbatim

export interface Pipeline {
  readonly execute: () => Promise<ReadonlyArray<StepResult>>
}

export function definePipeline(config: PipelineConfig): Pipeline {
  const workflow = config.workflow
  const context = makeDefaultContext(config.context)
  const runtimeLayer = config.runtimeLayer ?? DefaultRuntimeLayer
  const preflightLayer = config.preflightLayer ?? DefaultRuntimeLayer
  const stepMap = new Map(config.steps.map((s) => [s.name, s]))

  return {
    execute: async () => {
      const executionOrder = buildExecutionOrder(
        Array.from(stepMap.values()).map((s) => ({ name: s.name, dependsOnSteps: s.dependsOnSteps })),
        workflow
      )

      const results: StepResult[] = []

      if (!config.skipPreflight) {
        const preflightExit = await Effect.runPromiseExit(
          Effect.provide(preflightCheck(Array.from(stepMap.values())), preflightLayer)
        )
        if (preflightExit._tag === "Failure") {
          const err = extractStepError(preflightExit.cause)
          for (const name of executionOrder) {
            results.push({
              name,
              status: "fail",
              durationMs: 0,
              error: err,
            })
            break
          }
          for (const name of executionOrder.slice(1)) {
            results.push({ name, status: "skipped", durationMs: 0 })
          }
          return results
        }
      }

      const runtime = ManagedRuntime.make(runtimeLayer)
      try {
        for (const name of executionOrder) {
          const step = stepMap.get(name)!
          const start = performance.now()
          try {
            let output: Record<string, unknown>
            if (step.plugin._tag === "simple") {
              output = await step.plugin.execute(step.options, context)
            } else {
              const effect = step.plugin.run(step.options) as Effect.Effect<Record<string, unknown>, unknown, never>
              output = await runtime.runPromise(effect)
            }
            results.push({
              name,
              status: "pass",
              durationMs: Math.round(performance.now() - start),
              output,
            })
          } catch (err) {
            results.push({
              name,
              status: "fail",
              durationMs: Math.round(performance.now() - start),
              error: err instanceof StepError
                ? err
                : new StepError({
                    code: "STEP_THREW",
                    message: err instanceof Error ? err.message : String(err),
                    cause: err,
                  }),
            })
            break
          }
        }
      } finally {
        await runtime.dispose()
      }

      const executed = new Set(results.map((r) => r.name))
      for (const name of executionOrder) {
        if (!executed.has(name)) results.push({ name, status: "skipped", durationMs: 0 })
      }
      return results
    },
  }
}

function extractStepError(cause: Cause.Cause<StepError>): StepError {
  return Option.getOrElse(
    Cause.failureOption(cause),
    () => new StepError({ code: "PREFLIGHT_FAILED", message: "Pre-flight check failed", cause })
  )
}
```

Keep `makeDefaultContext` exactly as it is today.

- [ ] **Step 4: Fix the CLI-side type**

`packages/cli/src/commands/run.ts` currently imports `ResolvedStep` from `@zl/core` — that same name now refers to the *bound* step. Update its signature to accept bound steps:

```ts
import type { ResolvedStep } from "@zl/core"  // now means bound step

export interface RunOptions {
  readonly workflowName: string
  readonly config: ZlConfig
  readonly steps: ReadonlyArray<ResolvedStep>  // bound
  readonly io?: CliIO
}
```

Update its body — no functional change, the `definePipeline({ steps })` call works as-is.

- [ ] **Step 5: Run the full test suite**

```bash
bunx tsc --noEmit -p packages/core/tsconfig.json
bunx tsc --noEmit -p packages/cli/tsconfig.json
bun test --recursive packages/
```

Expected: all tests green; new Pipeline tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine/Pipeline.ts packages/core/src/engine/Pipeline.test.ts \
        packages/cli/src/commands/run.ts
git commit -m "feat(core): pipeline runs preflight and passes bound options to steps"
```

---

## Task 13: `ConfigLoader` — integrate step resolution and options-schema validation

> **Historical note (ZER-150):** this task was executed and merged as PR #74 against the pre-ZER-150 Promise-based `ConfigLoader.ts`. ZER-150 subsequently deleted `ConfigLoader.ts` and moved its `validateStepOptions` into a standalone Effect helper at `packages/core/src/config/validateStepOptions.ts`. The code blocks below are preserved for historical context; the live implementation is in that helper plus `packages/core/src/adapters/FileConfig.ts` (`ConfigService.load`). See `docs/superpowers/plans/2026-04-17-zer-150-config-loading-effect-migration.md` for the migration details.

**Files:**
- Modify: `packages/core/src/config/ConfigLoader.ts`
- Modify: `packages/core/src/config/ConfigLoader.test.ts`

- [ ] **Step 1: Write failing test**

Append to `ConfigLoader.test.ts`:

```ts
import { Schema } from "effect"
import { defineStep } from "../step-loader/StepContract"

test("rejects a StepInstance whose options fail the plugin's optionsSchema", async () => {
  const good = defineStep({
    name: "build-ios",
    optionsSchema: Schema.Struct({ scheme: Schema.String }),
    run: async () => ({}),
  })
  const dir = withTmpProject(
    "opt-invalid",
    `export default {
      app: { name: "T", bundleId: "c.t" },
      platforms: { ios: { steps: [{ name: "build-ios", options: { scheme: 42 } }] } },
      workflows: { ci: ["build-ios"] },
    }`
  )
  try {
    await expect(
      loadConfig(dir, {
        loader: async (n) => (n === "build-ios" ? good : null),
      })
    ).rejects.toThrow(/scheme/i)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test packages/core/src/config/ConfigLoader.test.ts
```

Expected: FAIL — `loadConfig` doesn't accept a second argument.

- [ ] **Step 3: Extend `loadConfig` with an optional loader option**

Modify `ConfigLoader.ts`:

```ts
import { Schema } from "effect"
import { existsSync } from "fs"
import { join } from "path"
import type { ZlConfig, StepInstance } from "./ConfigTypes"
import { validateConfig, ConfigValidationError } from "./validateConfig"
import type { PluginLoader } from "../step-loader/StepInstanceResolver"

export { ConfigValidationError }

export class ConfigFileNotFoundError extends Error {
  constructor(readonly dir: string) {
    super(`No zl.config.ts found in ${dir}`)
    this.name = "ConfigFileNotFoundError"
  }
}

export interface LoadConfigOptions {
  readonly loader?: PluginLoader
}

export async function loadConfig(
  projectDir: string,
  options: LoadConfigOptions = {}
): Promise<ZlConfig> {
  const configPath = join(projectDir, "zl.config.ts")
  if (!existsSync(configPath)) throw new ConfigFileNotFoundError(projectDir)
  const mod = (await import(configPath)) as Record<string, unknown>
  const raw = mod.default ?? mod
  const config = validateConfig(raw)

  if (options.loader) {
    await validateStepOptions(config, options.loader)
  }

  return config
}

async function validateStepOptions(config: ZlConfig, loader: PluginLoader): Promise<void> {
  const allInstances: StepInstance[] = [
    ...(config.steps ?? []),
    ...Object.values(config.platforms).flatMap((p) => p?.steps ?? []),
  ]

  for (const inst of allInstances) {
    const plugin = (await loader(inst.name)) as {
      optionsSchema?: { decode: (raw: unknown) => unknown }
    } | null
    if (!plugin || !plugin.optionsSchema) continue
    try {
      plugin.optionsSchema.decode(inst.options ?? {})
    } catch (err) {
      throw new ConfigValidationError([
        `Invalid options for step '${inst.name}': ${err instanceof Error ? err.message : String(err)}`,
      ])
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/core/src/config/ConfigLoader.test.ts
```

Expected: new test PASS; existing tests unchanged (they don't pass a `loader`).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/ConfigLoader.ts packages/core/src/config/ConfigLoader.test.ts
git commit -m "feat(core): validate step options against optionsSchema at config-load time"
```

---

## Task 14: `SubcommandRegistry` + CLI dispatch

**Files:**
- Create: `packages/core/src/cli/SubcommandRegistry.ts`
- Create: `packages/core/src/cli/SubcommandRegistry.test.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Write failing core-side test**

Create `packages/core/src/cli/SubcommandRegistry.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { defineStep } from "../step-loader/StepContract"
import { buildSubcommandRegistry } from "./SubcommandRegistry"
import type { ResolvedStep } from "../step-loader/StepContract"

const toResolved = (plugin: ReturnType<typeof defineStep>): ResolvedStep => ({
  plugin, name: plugin.name, dependsOnSteps: plugin.dependsOnSteps, options: {},
})

describe("buildSubcommandRegistry", () => {
  test("flattens step subcommands into a 'step:sub' keyed map", async () => {
    const a = defineStep({
      name: "sign-ios",
      subcommands: {
        init: async () => 0,
        doctor: async () => 42,
      },
      run: async () => ({}),
    })
    const b = defineStep({
      name: "build-ios",
      subcommands: { clean: async () => 7 },
      run: async () => ({}),
    })

    const registry = buildSubcommandRegistry([toResolved(a), toResolved(b)])
    expect(await registry.get("sign-ios:init")!([])).toBe(0)
    expect(await registry.get("sign-ios:doctor")!([])).toBe(42)
    expect(await registry.get("build-ios:clean")!([])).toBe(7)
    expect(registry.get("sign-ios:unknown")).toBeUndefined()
  })

  test("lists all keys", () => {
    const a = defineStep({
      name: "x",
      subcommands: { one: async () => 0, two: async () => 0 },
      run: async () => ({}),
    })
    const registry = buildSubcommandRegistry([toResolved(a)])
    expect(Array.from(registry.keys()).sort()).toEqual(["x:one", "x:two"])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test packages/core/src/cli/SubcommandRegistry.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `SubcommandRegistry`**

Create `packages/core/src/cli/SubcommandRegistry.ts`:

```ts
import type { ResolvedStep, SubcommandHandler } from "../step-loader/StepContract"

export function buildSubcommandRegistry(
  steps: ReadonlyArray<ResolvedStep>
): ReadonlyMap<string, SubcommandHandler> {
  const map = new Map<string, SubcommandHandler>()
  for (const step of steps) {
    const subs = step.plugin.subcommands
    if (!subs) continue
    for (const [sub, handler] of Object.entries(subs)) {
      map.set(`${step.name}:${sub}`, handler)
    }
  }
  return map
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/core/src/cli/SubcommandRegistry.test.ts
```

Expected: 2/2 PASS.

- [ ] **Step 5: CLI-side dispatch test**

Add to `packages/cli/src/cli.test.ts`:

```ts
test("dispatches step:sub commands through the registry", async () => {
  const dir = makeTmpProject("cli_sub", CONFIG_SIMPLE)
  try {
    const { io, out } = makeIO()
    const exit = await runCli(["hello:ping"], {
      cwd: dir,
      io,
      subcommandRegistry: new Map([
        ["hello:ping", async () => {
          io.stdout("pong")
          return 0
        }],
      ]),
    })
    expect(exit).toBe(0)
    expect(out.join("\n")).toContain("pong")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 6: Wire CLI dispatch**

Modify `packages/cli/src/cli.ts`. Add to `RunCliOptions`:

```ts
import type { SubcommandHandler } from "@zl/core"

export interface RunCliOptions {
  readonly cwd: string
  readonly io?: CliIO
  readonly subcommandRegistry?: ReadonlyMap<string, SubcommandHandler>
}
```

Inside `runCli`, after the `--help`/`-h` check and before positional-name extraction:

```ts
if (command && command.includes(":")) {
  const registry = opts.subcommandRegistry
  if (!registry) {
    io.stderr(`Unknown command '${command}'.`)
    return 1
  }
  const handler = registry.get(command)
  if (!handler) {
    io.stderr(`Unknown subcommand '${command}'.`)
    return 1
  }
  return handler(args.slice(1))
}
```

- [ ] **Step 7: Run all tests**

```bash
bun test --recursive packages/
```

Expected: all tests green.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/cli/SubcommandRegistry.ts packages/core/src/cli/SubcommandRegistry.test.ts \
        packages/cli/src/cli.ts packages/cli/src/cli.test.ts
git commit -m "feat(core+cli): step subcommand registry with 'step:sub' dispatch"
```

---

## Task 15: Renderer — show `StepError.code`

**Files:**
- Modify: `packages/cli/src/output/Renderer.ts`
- Modify: `packages/cli/src/output/Renderer.test.ts`

- [ ] **Step 1: Failing test**

Add to `Renderer.test.ts`:

```ts
import { StepError } from "@zl/core"

test("renders StepError code alongside message when a step fails", () => {
  const output = renderResults([
    {
      name: "sign",
      status: "fail",
      durationMs: 12,
      error: new StepError({ code: "SIGN_FAILED", message: "no profile" }),
    },
  ])
  expect(output).toContain("SIGN_FAILED")
  expect(output).toContain("no profile")
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test packages/cli/src/output/Renderer.test.ts
```

Expected: FAIL — existing renderer uses `error: string | undefined`; test references the new `StepError` type that renderer doesn't know how to format.

- [ ] **Step 3: Update `Renderer.ts` to format `StepError`**

In `Renderer.ts`, find the failure line formatting and update to include the code:

```ts
if (result.status === "fail") {
  const err = result.error
  const codeAndMsg = err ? `[${err.code}] ${err.message}` : ""
  lines.push(`  ✗ ${result.name}  ${codeAndMsg}`)
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test packages/cli/src/output/Renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/output/Renderer.ts packages/cli/src/output/Renderer.test.ts
git commit -m "feat(cli): render StepError.code in failure lines"
```

---

## Task 16: Public exports + freeze `@zl/core@0.1.0`

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: Add new exports**

Replace the contents of `packages/core/src/index.ts` with:

```ts
// Step contract
export {
  defineStep, defineEffectStep,
  type StepContext, type PluginStep, type ResolvedStep,
  type SimplePluginStep, type EffectPluginStep,
  type Requirement, type SubcommandHandler,
} from "./step-loader/StepContract"
export { loadSteps, validateStep } from "./step-loader/StepLoader"
export { resolveShortName, detectCollisions } from "./step-loader/StepNameResolver"
export { resolveStepInstances, defaultPluginLoader, type PluginLoader } from "./step-loader/StepInstanceResolver"
export { gatherRequirements, type Requirements, type RequirementEntry } from "./step-loader/StepRequirements"

// Config
export { defineConfig, type ZlConfig, type Platform, type StepInstance } from "./config/ConfigTypes"
export { loadConfig, ConfigFileNotFoundError, ConfigValidationError, type LoadConfigOptions } from "./config/ConfigLoader"

// Engine
export {
  definePipeline, DefaultRuntimeLayer,
  type Pipeline, type StepResult, type PipelineConfig,
} from "./engine/Pipeline"
export { buildExecutionOrder, CyclicDependencyError } from "./engine/DependencyGraph"
export { StepError } from "./engine/StepError"
export { preflightCheck } from "./engine/PreflightCheck"

// CLI helpers
export { buildSubcommandRegistry } from "./cli/SubcommandRegistry"

// Ports
export {
  LoggerService, ConfigService, PlatformService, ArtifactService,
  ShellService,
} from "./ports/index"
export { ShellError, type ShellResult, type ShellSpawnOptions, type IShellService } from "./ports/ShellService"

// Adapters
export { ConsoleLoggerLive } from "./adapters/ConsoleLogger"
export { makeFileConfigLayer } from "./adapters/FileConfig"
export { LocalPlatformLive } from "./adapters/LocalPlatform"
export { MemoryArtifactStoreLive } from "./adapters/MemoryArtifactStore"
export { LocalShellLive } from "./adapters/LocalShell"
export { LocalEnvConfigLive } from "./adapters/LocalEnvConfig"
```

Update `packages/core/src/ports/index.ts` to re-export `ShellService`:

```ts
export { LoggerService } from "./LoggerService"
export { ConfigService } from "./ConfigService"
export { PlatformService } from "./PlatformService"
export { ArtifactService } from "./ArtifactService"
export { ShellService } from "./ShellService"
```

- [ ] **Step 2: Bump package.json to 0.1.0 with publishConfig**

Modify `packages/core/package.json`:

```json
{
  "name": "@zl/core",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "publishConfig": {
    "access": "public"
  },
  "dependencies": {
    "effect": "^3.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  }
}
```

(Preserve existing fields; only add `version: 0.1.0` and `publishConfig`.)

- [ ] **Step 3: Run full verification**

```bash
bunx tsc --noEmit -p packages/core/tsconfig.json
bunx tsc --noEmit -p packages/cli/tsconfig.json
bunx oxlint packages/
bun test --recursive packages/
```

Expected: typecheck + lint green; all tests pass; coverage remains at 100%.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/ports/index.ts packages/core/package.json
git commit -m "feat(core): freeze public API surface as @zl/core@0.1.0"
```

---

## Final verification

- [ ] **Run the full pipeline once more**

```bash
bunx tsc --noEmit -p packages/core/tsconfig.json && \
  bunx tsc --noEmit -p packages/cli/tsconfig.json && \
  bunx oxlint packages/ && \
  bun test --recursive packages/
```

Expected:
- typecheck green
- lint: 0 warnings, 0 errors
- tests: 100% line and function coverage across all packages
- total test count at least: 95 (baseline) + ~25 new = ~120

- [ ] **Skim the `@zl/core` export surface**

```bash
grep -c "^export" packages/core/src/index.ts
```

Expected: roughly 35-45 export lines. The surface is the frozen contract plugins depend on — no unintended leakage.

- [ ] **Open the PR(s)**

Each task above was a single commit on a feature branch branched from `main`. Per project policy, each Linear issue gets its own PR — either split this branch into per-task PRs (preferred) or land as one PR of sixteen commits if the reviewer prefers. Note the plan's dependency graph on the PR body so reviewers can sequence merges.
