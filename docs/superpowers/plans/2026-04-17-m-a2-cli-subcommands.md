# M-A2 — CLI subcommands (`init` / `doctor` / `secret`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three user-facing CLI subcommands that complete M-A's public surface: `zl init` (interactive scaffold), `zl doctor` (environment checks), and `zl secret set/get/list/delete` (OS-keychain-backed secret store). Wire the secret store into `ConfigService.secret(key)` so plugins resolve secrets from the keychain.

**Architecture:** Three independent commands, one per Linear ticket / PR. A new `SecretStore` port + macOS `security(1)` adapter + Linux stub adds secret persistence. `CliIO` gains a `prompt` channel so `zl init` / `zl secret set` can be interactive *and* scripted in tests. `zl doctor` runs a static list of environment checks (Bun / Xcode / Android SDK / Gradle / keychain) through the existing `ShellService` — step-requirement surfacing across `zl.config.ts` is out of scope here (depends on M-A1's `StepRequirements`; deferred to a follow-up ticket). CLI dispatch in `cli.ts` routes `init` / `doctor` / `secret` *before* the config-load path so these commands work in fresh projects.

**Tech Stack:** TypeScript, Bun runtime, `effect` (Layer, Effect, Context), `bun:test`, `oxlint`, existing package workspace. macOS `security(1)` CLI for keychain. No new npm deps.

**Related spec:** `docs/superpowers/specs/2026-04-16-zero-line-roadmap-design.md` (section "M-A — Foundation", subsection "CLI subcommands").

**Linear ticket(s):** M-A2 is a group of three tickets — one per subcommand — all attached to the `zero-line MVP → M-A` milestone. Ticket IDs filed during execution per project policy (one Linear issue = one PR).

**Depends on:** `@zl/core` APIs as they exist on `main` at plan-start. Does **not** depend on M-A1 landing first; tasks that touch `FileConfig.secret` fall back gracefully whether or not M-A1's `StepRequirements` / pre-flight are in. If M-A1 lands first, the optional Task 10 surfaces declared step requirements in `zl doctor`.

---

## File structure

### New files

| Path | Responsibility |
|---|---|
| `packages/cli/src/prompts.ts` | Thin wrapper around Bun's `prompt()` / stdin — default implementation of `CliIO.prompt`. |
| `packages/cli/src/prompts.test.ts` | Unit tests using a stubbed stdin. |
| `packages/cli/src/commands/init.ts` | `zl init` — interactive scaffold (asks for app name / bundle id / platforms, writes `zl.config.ts`). |
| `packages/cli/src/commands/init.test.ts` | Unit tests against a temp dir + scripted `CliIO`. |
| `packages/cli/src/commands/doctor.ts` | `zl doctor` — runs `DoctorCheck[]` (Bun / Xcode / Android SDK / Gradle / keychain) and renders structured output. |
| `packages/cli/src/commands/doctor.test.ts` | Unit tests using an injected `ShellService` + `PlatformService`. |
| `packages/cli/src/commands/secret.ts` | `zl secret` — dispatches to `set` / `get` / `list` / `delete` handlers. |
| `packages/cli/src/commands/secret.test.ts` | Unit tests using an injected `SecretStore`. |
| `packages/cli/src/output/DoctorRenderer.ts` | Renders a `ReadonlyArray<DoctorResult>` to a terminal-friendly list with `ok/warn/fail` icons. |
| `packages/cli/src/output/DoctorRenderer.test.ts` | Unit tests. |
| `packages/core/src/ports/SecretStore.ts` | `SecretStore` Effect port. `set` / `get` / `list` / `delete` returning `Effect<..., SecretStoreError>`. |
| `packages/core/src/ports/SecretStore.test.ts` | Port-level type + constructor tests. |
| `packages/core/src/adapters/MacOSKeychainSecretStore.ts` | `security(1)` CLI-backed adapter. Uses `ShellService` to `add-generic-password` / `find-generic-password` / `delete-generic-password` with `-s zl`. |
| `packages/core/src/adapters/MacOSKeychainSecretStore.test.ts` | Unit tests with an in-memory `ShellService` stub. |
| `packages/core/src/adapters/LinuxStubSecretStore.ts` | Linux stub — all methods fail with `SecretStoreError("NOT_IMPLEMENTED", ...)`. |
| `packages/core/src/adapters/LinuxStubSecretStore.test.ts` | Unit tests. |
| `packages/core/src/adapters/SecretStoreFactory.ts` | `makeSecretStoreLayer()` — picks macOS or Linux adapter based on `PlatformService.os()`. |
| `packages/core/src/adapters/SecretStoreFactory.test.ts` | Unit tests. |
| `CHANGELOG.md` (root, if missing) | Seeded later by the release-workflow ticket — this plan only appends to `## [Unreleased]` if the file exists. |

### Modified files

| Path | Change |
|---|---|
| `packages/cli/src/io.ts` | Extend `CliIO` with `prompt: (question, opts?) => Promise<string>`. `defaultIO` routes to the new `prompts.ts` module. |
| `packages/cli/src/test-utils/cli-io.ts` | `makeIO` accepts an optional `{ answers: ReadonlyArray<string> }` and exposes a scripted `prompt` that dequeues answers FIFO (throws if exhausted). |
| `packages/cli/src/cli.ts` | Dispatch `init` / `doctor` / `secret` *before* the config-load path. Extend `HELP_TEXT` with `secret` usage. |
| `packages/cli/src/cli.test.ts` | Add happy-path + error tests for each new command through `runCli`. |
| `packages/core/src/adapters/FileConfig.ts` | `ConfigService.secret(key)` now falls back to `SecretStore.get(key)` when `process.env[key]` is undefined. Layer now `Layer.effect` that pulls `SecretStore` from context. |
| `packages/core/src/adapters/FileConfig.test.ts` | New tests for env-first / secret-store-fallback / `SecretNotFoundError` paths. |
| `packages/core/src/engine/Pipeline.ts` | `DefaultRuntimeLayer` is extended to include `makeSecretStoreLayer()` so step contexts can use secrets in integration tests. No behaviour change for simple steps that don't touch secrets. |
| `packages/core/src/index.ts` | Export `SecretStore`, `SecretStoreError`, `MacOSKeychainSecretStoreLive`, `LinuxStubSecretStoreLive`, `makeSecretStoreLayer`, `makeFileConfigLayer` (unchanged signature). |
| `packages/core/src/ports/index.ts` | Add `SecretStore` re-export. |
| `README.md` | New short "Getting started" section: `zl init` → `zl doctor` → `zl secret set APPLE_API_KEY`. Replaces any outdated quickstart stub. |

---

## Task 1: `CliIO.prompt` + default implementation

**Files:**
- Create: `packages/cli/src/prompts.ts`
- Create: `packages/cli/src/prompts.test.ts`
- Modify: `packages/cli/src/io.ts`
- Modify: `packages/cli/src/test-utils/cli-io.ts`

- [ ] **Step 1: Write failing IO shape test**

Create `packages/cli/src/prompts.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { makePrompt } from "./prompts"

describe("makePrompt", () => {
  test("reads a line from the supplied reader and returns it trimmed", async () => {
    const reader = async () => "  hello world  \n"
    const prompt = makePrompt({ read: reader, write: () => {} })
    expect(await prompt("Name?")).toBe("hello world")
  })

  test("writes the question (with trailing space) before reading", async () => {
    const written: string[] = []
    const prompt = makePrompt({
      read: async () => "x\n",
      write: (m) => written.push(m),
    })
    await prompt("Name?")
    expect(written.join("")).toBe("Name? ")
  })

  test("returns the default when the user hits enter on an empty line", async () => {
    const prompt = makePrompt({ read: async () => "\n", write: () => {} })
    expect(await prompt("Bundle id?", { default: "ch.example" })).toBe("ch.example")
  })

  test("appends a '[default]' hint when a default is supplied", async () => {
    const written: string[] = []
    const prompt = makePrompt({
      read: async () => "\n",
      write: (m) => written.push(m),
    })
    await prompt("Bundle id?", { default: "ch.example" })
    expect(written.join("")).toContain("[ch.example]")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/src/prompts.test.ts`
Expected: FAIL — `makePrompt` not defined.

- [ ] **Step 3: Implement `makePrompt`**

Create `packages/cli/src/prompts.ts`:

```ts
export interface PromptDeps {
  readonly read: () => Promise<string>
  readonly write: (msg: string) => void
}

export interface PromptOptions {
  readonly default?: string
}

export type Prompt = (question: string, opts?: PromptOptions) => Promise<string>

export function makePrompt(deps: PromptDeps): Prompt {
  return async (question, opts) => {
    const suffix = opts?.default ? ` [${opts.default}]` : ""
    deps.write(`${question}${suffix} `)
    const raw = await deps.read()
    const trimmed = raw.replace(/\r?\n$/, "").trim()
    if (trimmed.length === 0 && opts?.default !== undefined) return opts.default
    return trimmed
  }
}

async function readLineFromStdin(): Promise<string> {
  // `Bun.stdin.stream()` yields Uint8Arrays; we read until the first newline.
  const decoder = new TextDecoder()
  let buf = ""
  for await (const chunk of Bun.stdin.stream()) {
    buf += decoder.decode(chunk)
    const nl = buf.indexOf("\n")
    if (nl !== -1) return buf.slice(0, nl + 1)
  }
  return buf
}

export const defaultPrompt: Prompt = makePrompt({
  read: readLineFromStdin,
  write: (m) => process.stdout.write(m),
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/cli/src/prompts.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Extend `CliIO` with `prompt`**

Modify `packages/cli/src/io.ts`:

```ts
import { defaultPrompt, type Prompt } from "./prompts"

export interface CliIO {
  readonly stdout: (msg: string) => void
  readonly stderr: (msg: string) => void
  readonly prompt: Prompt
}

export const defaultIO: CliIO = {
  stdout: (msg) => console.log(msg),
  stderr: (msg) => console.error(msg),
  prompt: defaultPrompt,
}
```

- [ ] **Step 6: Extend `makeIO` helper with scripted answers**

Modify `packages/cli/src/test-utils/cli-io.ts`:

```ts
import type { CliIO } from "../io"

export interface MakeIOOptions {
  readonly answers?: ReadonlyArray<string>
}

export function makeIO(
  options: MakeIOOptions = {}
): { io: CliIO; out: string[]; err: string[]; prompts: string[] } {
  const out: string[] = []
  const err: string[] = []
  const prompts: string[] = []
  const answers = [...(options.answers ?? [])]
  return {
    io: {
      stdout: (m) => out.push(m),
      stderr: (m) => err.push(m),
      prompt: async (q) => {
        prompts.push(q)
        if (answers.length === 0) {
          throw new Error(`makeIO: no scripted answer available for prompt '${q}'`)
        }
        return answers.shift()!
      },
    },
    out,
    err,
    prompts,
  }
}
```

- [ ] **Step 7: Run the existing CLI test suite**

Run: `bun test packages/cli/src/cli.test.ts`
Expected: PASS — existing tests still compile (they already destructure `io` from `makeIO()`; extra `prompts` field is ignored).

- [ ] **Step 8: Lint + typecheck**

```bash
bunx oxlint packages/
bunx tsc --noEmit -p packages/cli/tsconfig.json
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/prompts.ts packages/cli/src/prompts.test.ts \
  packages/cli/src/io.ts packages/cli/src/test-utils/cli-io.ts
git commit -m "feat(cli): add prompt channel to CliIO"
```

---

## Task 2: `SecretStore` port

**Files:**
- Create: `packages/core/src/ports/SecretStore.ts`
- Create: `packages/core/src/ports/SecretStore.test.ts`
- Modify: `packages/core/src/ports/index.ts`

- [ ] **Step 1: Write failing port test**

Create `packages/core/src/ports/SecretStore.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { SecretStore, SecretStoreError } from "./SecretStore"

describe("SecretStore", () => {
  test("can be constructed and invoked via Effect", async () => {
    const testStore = Layer.succeed(SecretStore, {
      set: () => Effect.void,
      get: (key: string) =>
        key === "present"
          ? Effect.succeed("value")
          : Effect.fail(new SecretStoreError("NOT_FOUND", `no such key: ${key}`)),
      list: () => Effect.succeed(["present"] as const),
      delete: () => Effect.void,
    })

    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.get("present")
    })

    const result = await Effect.runPromise(Effect.provide(program, testStore))
    expect(result).toBe("value")
  })

  test("SecretStoreError carries a code and message", () => {
    const err = new SecretStoreError("WRITE_FAILED", "permission denied")
    expect(err._tag).toBe("SecretStoreError")
    expect(err.code).toBe("WRITE_FAILED")
    expect(err.message).toBe("permission denied")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/ports/SecretStore.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the port**

Create `packages/core/src/ports/SecretStore.ts`:

```ts
import { Context, Effect } from "effect"

export type SecretStoreErrorCode =
  | "NOT_FOUND"
  | "WRITE_FAILED"
  | "READ_FAILED"
  | "DELETE_FAILED"
  | "LIST_FAILED"
  | "NOT_IMPLEMENTED"

export class SecretStoreError {
  readonly _tag = "SecretStoreError"
  constructor(
    readonly code: SecretStoreErrorCode,
    readonly message: string,
    readonly cause?: unknown
  ) {}
}

export interface ISecretStore {
  readonly set: (key: string, value: string) => Effect.Effect<void, SecretStoreError>
  readonly get: (key: string) => Effect.Effect<string, SecretStoreError>
  readonly list: () => Effect.Effect<ReadonlyArray<string>, SecretStoreError>
  readonly delete: (key: string) => Effect.Effect<void, SecretStoreError>
}

export class SecretStore extends Context.Tag("SecretStore")<
  SecretStore,
  ISecretStore
>() {}
```

- [ ] **Step 4: Re-export from ports index**

Modify `packages/core/src/ports/index.ts` — add one line alongside the existing exports:

```ts
export { SecretStore, SecretStoreError } from "./SecretStore"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/core/src/ports/SecretStore.test.ts`
Expected: 2/2 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ports/SecretStore.ts packages/core/src/ports/SecretStore.test.ts \
  packages/core/src/ports/index.ts
git commit -m "feat(core): add SecretStore port"
```

---

## Task 3: macOS keychain adapter (`MacOSKeychainSecretStoreLive`)

**Files:**
- Create: `packages/core/src/adapters/MacOSKeychainSecretStore.ts`
- Create: `packages/core/src/adapters/MacOSKeychainSecretStore.test.ts`

**Design notes:**
- Service name (`-s`) is hard-coded to `zl`; account (`-a`) is the user-supplied key.
- `set` uses `security add-generic-password -s zl -a <key> -w <value> -U` (`-U` = update if exists).
- `get` uses `security find-generic-password -s zl -a <key> -w` (`-w` prints the value only).
- `delete` uses `security delete-generic-password -s zl -a <key>`.
- `list` uses `security dump-keychain` parsed for `"svce"<blob>="zl"` blocks and extracts the matching `"acct"<blob>=` lines. Parse by line prefix; no regex golf. If `security` errors, map to `SecretStoreError("LIST_FAILED", ...)`.

- [ ] **Step 1: Write failing adapter test (using stub `ShellService`)**

Create `packages/core/src/adapters/MacOSKeychainSecretStore.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ShellService, ShellError, type ShellResult } from "../ports/ShellService"
import { SecretStore, SecretStoreError } from "../ports/SecretStore"
import { MacOSKeychainSecretStoreLive } from "./MacOSKeychainSecretStore"

const stubShell = (
  handler: (argv: ReadonlyArray<string>) => ShellResult | ShellError
) =>
  Layer.succeed(ShellService, {
    spawn: (opts) => {
      const out = handler(opts.argv)
      return out instanceof ShellError
        ? Effect.fail(out)
        : Effect.succeed(out)
    },
  })

describe("MacOSKeychainSecretStoreLive", () => {
  test("set() calls `security add-generic-password -s zl -a <key> -w <value> -U`", async () => {
    let seen: ReadonlyArray<string> = []
    const shell = stubShell((argv) => {
      seen = argv
      return { exitCode: 0, stdout: "", stderr: "" }
    })
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      yield* store.set("APPLE_API_KEY", "secret-value")
    })
    await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(seen).toEqual([
      "security", "add-generic-password",
      "-s", "zl", "-a", "APPLE_API_KEY",
      "-w", "secret-value", "-U",
    ])
  })

  test("get() returns the keychain value verbatim, stripping trailing newline", async () => {
    const shell = stubShell(() => ({
      exitCode: 0,
      stdout: "my-secret-value\n",
      stderr: "",
    }))
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.get("APPLE_API_KEY")
    })
    const value = await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(value).toBe("my-secret-value")
  })

  test("get() maps a non-zero `security` exit to NOT_FOUND", async () => {
    const shell = stubShell(() => new ShellError({
      code: "NON_ZERO_EXIT",
      message: "security: SecKeychainSearchCopyNext: The specified item could not be found",
      exitCode: 44,
    }))
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.get("missing")
    })
    const exit = await Effect.runPromiseExit(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const err = exit.cause.toJSON() as any
      expect(JSON.stringify(err)).toContain("NOT_FOUND")
    }
  })

  test("delete() calls `security delete-generic-password` and succeeds on exit 0", async () => {
    let seen: ReadonlyArray<string> = []
    const shell = stubShell((argv) => {
      seen = argv
      return { exitCode: 0, stdout: "", stderr: "" }
    })
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      yield* store.delete("APPLE_API_KEY")
    })
    await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect(seen).toEqual([
      "security", "delete-generic-password",
      "-s", "zl", "-a", "APPLE_API_KEY",
    ])
  })

  test("list() parses `security dump-keychain` and returns zl-scoped account names", async () => {
    const dump = `
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="other"
    "acct"<blob>="ignored"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="zl"
    "acct"<blob>="APPLE_API_KEY"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "svce"<blob>="zl"
    "acct"<blob>="PLAY_SERVICE_ACCOUNT"
`
    const shell = stubShell(() => ({ exitCode: 0, stdout: dump, stderr: "" }))
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.list()
    })
    const keys = await Effect.runPromise(
      Effect.provide(program, Layer.provide(MacOSKeychainSecretStoreLive, shell))
    )
    expect([...keys].sort()).toEqual(["APPLE_API_KEY", "PLAY_SERVICE_ACCOUNT"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/adapters/MacOSKeychainSecretStore.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the adapter**

Create `packages/core/src/adapters/MacOSKeychainSecretStore.ts`:

```ts
import { Effect, Layer } from "effect"
import { ShellService, ShellError } from "../ports/ShellService"
import { SecretStore, SecretStoreError } from "../ports/SecretStore"

const SERVICE = "zl"

function mapShellError(
  err: ShellError,
  code: "WRITE_FAILED" | "READ_FAILED" | "DELETE_FAILED" | "LIST_FAILED",
  notFoundHint: boolean = false
): SecretStoreError {
  if (notFoundHint && /could not be found/i.test(err.message)) {
    return new SecretStoreError("NOT_FOUND", err.message, err)
  }
  return new SecretStoreError(code, err.message, err)
}

function parseDumpForService(dump: string, service: string): ReadonlyArray<string> {
  // `security dump-keychain` emits a series of attribute blocks. We walk line
  // by line, carrying the last seen svce/acct and emitting an account whenever
  // we see a zl-scoped svce followed by an acct (or vice versa — they can
  // appear in either order).
  const accounts = new Set<string>()
  let currentSvce: string | null = null
  let currentAcct: string | null = null
  for (const rawLine of dump.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith("keychain:") || line === "") {
      // block boundary — check pending pair, then reset
      if (currentSvce === service && currentAcct) accounts.add(currentAcct)
      currentSvce = null
      currentAcct = null
      continue
    }
    const svce = line.match(/^"svce"<blob>="([^"]*)"$/)
    if (svce) { currentSvce = svce[1]!; continue }
    const acct = line.match(/^"acct"<blob>="([^"]*)"$/)
    if (acct) { currentAcct = acct[1]!; continue }
  }
  if (currentSvce === service && currentAcct) accounts.add(currentAcct)
  return Array.from(accounts)
}

export const MacOSKeychainSecretStoreLive = Layer.effect(
  SecretStore,
  Effect.gen(function* () {
    const shell = yield* ShellService
    return {
      set: (key, value) =>
        shell.spawn({
          argv: ["security", "add-generic-password",
            "-s", SERVICE, "-a", key, "-w", value, "-U"],
        }).pipe(
          Effect.mapError((e) => mapShellError(e, "WRITE_FAILED")),
          Effect.asVoid
        ),

      get: (key) =>
        shell.spawn({
          argv: ["security", "find-generic-password",
            "-s", SERVICE, "-a", key, "-w"],
        }).pipe(
          Effect.mapError((e) => mapShellError(e, "READ_FAILED", true)),
          Effect.map((r) => r.stdout.replace(/\r?\n$/, ""))
        ),

      delete: (key) =>
        shell.spawn({
          argv: ["security", "delete-generic-password",
            "-s", SERVICE, "-a", key],
        }).pipe(
          Effect.mapError((e) => mapShellError(e, "DELETE_FAILED", true)),
          Effect.asVoid
        ),

      list: () =>
        shell.spawn({
          argv: ["security", "dump-keychain"],
        }).pipe(
          Effect.mapError((e) => mapShellError(e, "LIST_FAILED")),
          Effect.map((r) => parseDumpForService(r.stdout, SERVICE))
        ),
    }
  })
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/src/adapters/MacOSKeychainSecretStore.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Lint + typecheck**

```bash
bunx oxlint packages/
bunx tsc --noEmit -p packages/core/tsconfig.json
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/adapters/MacOSKeychainSecretStore.ts \
  packages/core/src/adapters/MacOSKeychainSecretStore.test.ts
git commit -m "feat(core): macOS keychain secret store adapter"
```

---

## Task 4: Linux stub adapter + OS-aware factory

**Files:**
- Create: `packages/core/src/adapters/LinuxStubSecretStore.ts`
- Create: `packages/core/src/adapters/LinuxStubSecretStore.test.ts`
- Create: `packages/core/src/adapters/SecretStoreFactory.ts`
- Create: `packages/core/src/adapters/SecretStoreFactory.test.ts`

- [ ] **Step 1: Write failing stub tests**

Create `packages/core/src/adapters/LinuxStubSecretStore.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { SecretStore, SecretStoreError } from "../ports/SecretStore"
import { LinuxStubSecretStoreLive } from "./LinuxStubSecretStore"

describe("LinuxStubSecretStoreLive", () => {
  test.each(["set", "get", "list", "delete"] as const)(
    "%s fails with NOT_IMPLEMENTED",
    async (method) => {
      const program = Effect.gen(function* () {
        const store = yield* SecretStore
        if (method === "set") yield* store.set("k", "v")
        if (method === "get") yield* store.get("k")
        if (method === "list") yield* store.list()
        if (method === "delete") yield* store.delete("k")
      })
      const exit = await Effect.runPromiseExit(
        Effect.provide(program, LinuxStubSecretStoreLive)
      )
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(JSON.stringify(exit.cause.toJSON())).toContain("NOT_IMPLEMENTED")
      }
    }
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/adapters/LinuxStubSecretStore.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the stub**

Create `packages/core/src/adapters/LinuxStubSecretStore.ts`:

```ts
import { Effect, Layer } from "effect"
import { SecretStore, SecretStoreError } from "../ports/SecretStore"

const notImplemented = () =>
  Effect.fail(
    new SecretStoreError(
      "NOT_IMPLEMENTED",
      "Linux keychain is not yet implemented; targeted for v1.0. " +
        "Use the `APPLE_API_KEY` / `PLAY_*` environment variables in the meantime."
    )
  )

export const LinuxStubSecretStoreLive = Layer.succeed(SecretStore, {
  set: () => notImplemented(),
  get: () => notImplemented(),
  list: () => notImplemented(),
  delete: () => notImplemented(),
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/src/adapters/LinuxStubSecretStore.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Write failing factory test**

Create `packages/core/src/adapters/SecretStoreFactory.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { PlatformService } from "../ports/PlatformService"
import { SecretStore, SecretStoreError } from "../ports/SecretStore"
import { ShellService, type ShellResult } from "../ports/ShellService"
import { makeSecretStoreLayer } from "./SecretStoreFactory"

const testPlatform = (os: "darwin" | "linux" | "win32") =>
  Layer.succeed(PlatformService, {
    os: () => Effect.succeed(os),
    availableToolchains: () => Effect.succeed([]),
    supports: () => Effect.succeed(false),
  })

const dummyShell = Layer.succeed(ShellService, {
  spawn: () =>
    Effect.succeed<ShellResult>({ exitCode: 0, stdout: "", stderr: "" }),
})

describe("makeSecretStoreLayer", () => {
  test("returns a keychain-backed store on darwin", async () => {
    const layer = Layer.provide(makeSecretStoreLayer(), Layer.merge(testPlatform("darwin"), dummyShell))
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      yield* store.set("k", "v")  // darwin adapter accepts this via the stub shell
      return "ok"
    })
    const result = await Effect.runPromise(Effect.provide(program, layer))
    expect(result).toBe("ok")
  })

  test("returns the stub on linux", async () => {
    const layer = Layer.provide(makeSecretStoreLayer(), Layer.merge(testPlatform("linux"), dummyShell))
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.get("k")
    })
    const exit = await Effect.runPromiseExit(Effect.provide(program, layer))
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause.toJSON())).toContain("NOT_IMPLEMENTED")
    }
  })

  test("returns the stub on win32", async () => {
    const layer = Layer.provide(makeSecretStoreLayer(), Layer.merge(testPlatform("win32"), dummyShell))
    const program = Effect.gen(function* () {
      const store = yield* SecretStore
      return yield* store.get("k")
    })
    const exit = await Effect.runPromiseExit(Effect.provide(program, layer))
    expect(exit._tag).toBe("Failure")
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test packages/core/src/adapters/SecretStoreFactory.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 7: Implement the factory**

Create `packages/core/src/adapters/SecretStoreFactory.ts`:

```ts
import { Effect, Layer } from "effect"
import { PlatformService } from "../ports/PlatformService"
import { SecretStore } from "../ports/SecretStore"
import { MacOSKeychainSecretStoreLive } from "./MacOSKeychainSecretStore"
import { LinuxStubSecretStoreLive } from "./LinuxStubSecretStore"

export function makeSecretStoreLayer() {
  return Layer.unwrapEffect(
    Effect.gen(function* () {
      const platform = yield* PlatformService
      const os = yield* platform.os()
      return os === "darwin" ? MacOSKeychainSecretStoreLive : LinuxStubSecretStoreLive
    })
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test packages/core/src/adapters/SecretStoreFactory.test.ts`
Expected: 3/3 PASS.

- [ ] **Step 9: Lint + typecheck**

```bash
bunx oxlint packages/
bunx tsc --noEmit -p packages/core/tsconfig.json
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/adapters/LinuxStubSecretStore.ts \
  packages/core/src/adapters/LinuxStubSecretStore.test.ts \
  packages/core/src/adapters/SecretStoreFactory.ts \
  packages/core/src/adapters/SecretStoreFactory.test.ts
git commit -m "feat(core): Linux stub + OS-aware SecretStore factory"
```

---

## Task 5: Wire `SecretStore` into `FileConfig.secret`

**Files:**
- Modify: `packages/core/src/adapters/FileConfig.ts`
- Modify: `packages/core/src/adapters/FileConfig.test.ts`
- Modify: `packages/core/src/engine/Pipeline.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing fallback test**

Replace (or add to) `packages/core/src/adapters/FileConfig.test.ts` with a suite that exercises env-first / secret-store-fallback / not-found paths. Add the following test block:

```ts
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ConfigService, SecretNotFoundError } from "../ports/ConfigService"
import { SecretStore, SecretStoreError } from "../ports/SecretStore"
import { makeFileConfigLayer } from "./FileConfig"

const inMemorySecrets = (entries: Record<string, string>) =>
  Layer.succeed(SecretStore, {
    set: () => Effect.void,
    get: (key: string) =>
      key in entries
        ? Effect.succeed(entries[key]!)
        : Effect.fail(new SecretStoreError("NOT_FOUND", `no such key: ${key}`)),
    list: () => Effect.succeed(Object.keys(entries)),
    delete: () => Effect.void,
  })

describe("makeFileConfigLayer — secret resolution", () => {
  const origEnv = { ...process.env }
  afterEach(() => {
    process.env = { ...origEnv }
  })

  test("env wins over keychain", async () => {
    process.env.MY_KEY = "from-env"
    const layer = Layer.provide(
      makeFileConfigLayer("/tmp/does-not-matter"),
      inMemorySecrets({ MY_KEY: "from-keychain" })
    )
    const value = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(ConfigService, (c) => c.secret("MY_KEY")),
        layer
      )
    )
    expect(value).toBe("from-env")
  })

  test("falls back to keychain when env is unset", async () => {
    delete process.env.MY_KEY
    const layer = Layer.provide(
      makeFileConfigLayer("/tmp/does-not-matter"),
      inMemorySecrets({ MY_KEY: "from-keychain" })
    )
    const value = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(ConfigService, (c) => c.secret("MY_KEY")),
        layer
      )
    )
    expect(value).toBe("from-keychain")
  })

  test("fails with SecretNotFoundError when absent everywhere", async () => {
    delete process.env.MISSING_KEY
    const layer = Layer.provide(
      makeFileConfigLayer("/tmp/does-not-matter"),
      inMemorySecrets({})
    )
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.flatMap(ConfigService, (c) => c.secret("MISSING_KEY")),
        layer
      )
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause.toJSON())).toContain("SecretNotFoundError")
    }
  })
})
```

Preserve any existing tests in the file; only append this block.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/adapters/FileConfig.test.ts`
Expected: FAIL — new tests error because `FileConfig` still falls through to `SecretNotFoundError` without consulting `SecretStore`.

- [ ] **Step 3: Rewrite `FileConfig` to consume `SecretStore`**

Replace `packages/core/src/adapters/FileConfig.ts` with:

```ts
import { Effect, Layer } from "effect"
import { join } from "path"
import { ConfigService, ConfigLoadError, SecretNotFoundError } from "../ports/ConfigService"
import { SecretStore, SecretStoreError } from "../ports/SecretStore"
import { validateConfig } from "../config/validateConfig"

export function makeFileConfigLayer(projectDir: string) {
  return Layer.effect(
    ConfigService,
    Effect.gen(function* () {
      const store = yield* SecretStore
      return {
        load: () =>
          Effect.tryPromise({
            try: async () => {
              const configPath = join(projectDir, "zl.config.ts")
              const mod = await import(configPath)
              return validateConfig(mod.default ?? mod)
            },
            catch: (err) =>
              new ConfigLoadError(
                `Failed to load zl.config.ts: ${err instanceof Error ? err.message : String(err)}`
              ),
          }),

        env: (key: string) => Effect.succeed(process.env[key]),

        secret: (key: string) =>
          Effect.suspend(() => {
            const envValue = process.env[key]
            if (envValue !== undefined) return Effect.succeed(envValue)
            return store.get(key).pipe(
              Effect.catchAll((err: SecretStoreError) =>
                err.code === "NOT_FOUND"
                  ? Effect.fail(new SecretNotFoundError(key))
                  : Effect.fail(new SecretNotFoundError(
                      `${key} (secret store error: ${err.code}: ${err.message})`
                    ))
              )
            )
          }),
      }
    })
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/src/adapters/FileConfig.test.ts`
Expected: all pass (existing + three new).

- [ ] **Step 5: Thread SecretStore through `DefaultRuntimeLayer`**

Modify `packages/core/src/engine/Pipeline.ts`:

At the top of the file, import the factory:

```ts
import { makeSecretStoreLayer } from "../adapters/SecretStoreFactory"
```

Replace the `DefaultRuntimeLayer` declaration with:

```ts
export const DefaultRuntimeLayer = Layer.mergeAll(
  ConsoleLoggerLive,
  LocalPlatformLive,
  MemoryArtifactStoreLive,
  Layer.provide(makeSecretStoreLayer(), LocalPlatformLive),
)
```

This ensures any Effect-step that resolves `ConfigService.secret` via a layer derived from `DefaultRuntimeLayer` also has a working `SecretStore`.

- [ ] **Step 6: Update public exports**

Modify `packages/core/src/index.ts` — add three new export lines to the existing `// Adapters` block:

```ts
export { MacOSKeychainSecretStoreLive } from "./adapters/MacOSKeychainSecretStore"
export { LinuxStubSecretStoreLive } from "./adapters/LinuxStubSecretStore"
export { makeSecretStoreLayer } from "./adapters/SecretStoreFactory"
```

- [ ] **Step 7: Run full core test suite**

```bash
bun test --recursive packages/core
bunx tsc --noEmit -p packages/core/tsconfig.json
```

Expected: all pass; typecheck green.

- [ ] **Step 8: Run CLI test suite to confirm nothing regressed**

Run: `bun test --recursive packages/cli`
Expected: unchanged count; all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/adapters/FileConfig.ts \
  packages/core/src/adapters/FileConfig.test.ts \
  packages/core/src/engine/Pipeline.ts \
  packages/core/src/index.ts
git commit -m "feat(core): wire SecretStore fallback into ConfigService.secret"
```

---

## Task 6: `zl init` — interactive scaffold

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/init.test.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/cli.test.ts`

**Design notes:**
- Prompts: app name (no default), bundle id (default `ch.example.<slug(name)>`), platforms (default `ios,android`).
- Slug: lowercase, replace non-alphanumeric with `-`, collapse runs, trim leading/trailing `-`.
- Writes `<cwd>/zl.config.ts` via `defineConfig` with one `ci` workflow wired to the `hello` step.
- Creates `<cwd>/fastlane/` if missing (empty dir — placeholder for future plugin-installed files).
- Refuses to overwrite an existing `zl.config.ts` unless `--force` is passed.

- [ ] **Step 1: Write failing happy-path test**

Create `packages/cli/src/commands/init.test.ts`:

```ts
import { describe, test, expect, afterEach } from "bun:test"
import { mkdirSync, readFileSync, existsSync, rmSync } from "fs"
import { join } from "path"
import { runInit } from "./init"
import { makeIO } from "../test-utils/cli-io"

const tmp = (name: string) => {
  const dir = join(import.meta.dir, `__init_tmp_${name}__`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe("runInit", () => {
  let dirs: string[] = []
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
    dirs = []
  })

  test("scaffolds zl.config.ts with scripted answers and returns 0", async () => {
    const dir = tmp("happy"); dirs.push(dir)
    const { io, prompts } = makeIO({
      answers: ["MyApp", "ch.example.myapp", "ios,android"],
    })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(0)
    expect(prompts).toHaveLength(3)
    const written = readFileSync(join(dir, "zl.config.ts"), "utf8")
    expect(written).toContain(`name: "MyApp"`)
    expect(written).toContain(`bundleId: "ch.example.myapp"`)
    expect(written).toContain(`ios:`)
    expect(written).toContain(`android:`)
    expect(written).toContain(`ci:`)
    expect(written).toContain(`hello`)
  })

  test("bundle-id default is derived from the app name", async () => {
    const dir = tmp("default_bundle"); dirs.push(dir)
    const { io } = makeIO({ answers: ["Cool App 42", "", "ios"] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(0)
    const written = readFileSync(join(dir, "zl.config.ts"), "utf8")
    expect(written).toContain(`bundleId: "ch.example.cool-app-42"`)
  })

  test("refuses to overwrite an existing zl.config.ts without --force", async () => {
    const dir = tmp("exists"); dirs.push(dir)
    Bun.write(join(dir, "zl.config.ts"), "// existing")
    const { io, err } = makeIO({ answers: ["X", "", "ios"] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("zl.config.ts already exists")
    expect(readFileSync(join(dir, "zl.config.ts"), "utf8")).toBe("// existing")
  })

  test("--force overwrites", async () => {
    const dir = tmp("force"); dirs.push(dir)
    Bun.write(join(dir, "zl.config.ts"), "// existing")
    const { io } = makeIO({ answers: ["X", "", "ios"] })
    const code = await runInit({ cwd: dir, io, force: true })
    expect(code).toBe(0)
    expect(readFileSync(join(dir, "zl.config.ts"), "utf8")).not.toBe("// existing")
  })

  test("rejects an empty app name", async () => {
    const dir = tmp("empty_name"); dirs.push(dir)
    const { io, err } = makeIO({ answers: ["", "", "ios"] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("App name is required")
    expect(existsSync(join(dir, "zl.config.ts"))).toBe(false)
  })

  test("rejects unknown platforms", async () => {
    const dir = tmp("bad_platform"); dirs.push(dir)
    const { io, err } = makeIO({ answers: ["X", "", "ios,blackberry"] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("blackberry")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/src/commands/init.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `runInit`**

Create `packages/cli/src/commands/init.ts`:

```ts
import { existsSync } from "fs"
import { mkdir } from "fs/promises"
import { join } from "path"
import { defaultIO, type CliIO } from "../io"

export interface InitOptions {
  readonly cwd: string
  readonly io?: CliIO
  readonly force: boolean
}

const VALID_PLATFORMS = new Set(["ios", "android"])

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function renderConfig(name: string, bundleId: string, platforms: ReadonlyArray<string>): string {
  const platformEntries = platforms
    .map((p) => `    ${p}: { steps: [{ name: "hello", options: {} }] },`)
    .join("\n")
  return `import { defineConfig } from "@zl/core"

export default defineConfig({
  app: {
    name: "${name}",
    bundleId: "${bundleId}",
  },
  platforms: {
${platformEntries}
  },
  workflows: {
    ci: ["hello"],
  },
})
`
}

export async function runInit(options: InitOptions): Promise<number> {
  const io = options.io ?? defaultIO
  const configPath = join(options.cwd, "zl.config.ts")

  if (existsSync(configPath) && !options.force) {
    io.stderr(`zl.config.ts already exists at ${configPath}. Re-run with --force to overwrite.`)
    return 1
  }

  const name = (await io.prompt("App name?")).trim()
  if (name.length === 0) {
    io.stderr("App name is required.")
    return 1
  }

  const bundleDefault = `ch.example.${slugify(name)}`
  const bundleId = (await io.prompt("Bundle id?", { default: bundleDefault })).trim()

  const platformsRaw = (await io.prompt("Target platforms?", { default: "ios,android" })).trim()
  const platforms = platformsRaw.split(",").map((p) => p.trim()).filter(Boolean)
  const unknown = platforms.filter((p) => !VALID_PLATFORMS.has(p))
  if (unknown.length > 0) {
    io.stderr(`Unknown platform(s): ${unknown.join(", ")}. Supported: ios, android.`)
    return 1
  }
  if (platforms.length === 0) {
    io.stderr("At least one platform is required.")
    return 1
  }

  await mkdir(options.cwd, { recursive: true })
  await Bun.write(configPath, renderConfig(name, bundleId, platforms))

  io.stdout(`\n  ✓ Wrote ${configPath}`)
  io.stdout(`  → Next: 'zl doctor' to check your toolchain, then 'zl run ci' to run the example workflow.`)
  return 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/cli/src/commands/init.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Wire into `cli.ts` dispatch**

Modify `packages/cli/src/cli.ts` — add the dispatch branch *before* the existing `try { const config = await loadConfig(...) }` block. The `init` command must run without requiring an existing `zl.config.ts`.

Add this import at the top:

```ts
import { runInit } from "./commands/init"
```

Insert this branch after the `workflowName` guard and before `try { const config = ... }`:

```ts
  if (command === "init") {
    const force = args.includes("--force")
    return runInit({ cwd: opts.cwd, io, force })
  }
```

- [ ] **Step 6: Add CLI-level test**

Append to `packages/cli/src/cli.test.ts`:

```ts
  test("'init' scaffolds a zl.config.ts and returns 0", async () => {
    const dir = join(import.meta.dir, "__test_tmp_cli_init__")
    mkdirSync(dir, { recursive: true })
    try {
      const { io } = makeIO({ answers: ["App", "", "ios"] })
      expect(await runCli(["init"], { cwd: dir, io })).toBe(0)
      expect(existsSync(join(dir, "zl.config.ts"))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
```

Add `existsSync` to the `fs` import at the top of the file.

- [ ] **Step 7: Run the full CLI test suite**

Run: `bun test --recursive packages/cli`
Expected: previous tests still pass; one new test passes.

- [ ] **Step 8: Lint + typecheck**

```bash
bunx oxlint packages/
bunx tsc --noEmit -p packages/cli/tsconfig.json
```

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/commands/init.ts \
  packages/cli/src/commands/init.test.ts \
  packages/cli/src/cli.ts \
  packages/cli/src/cli.test.ts
git commit -m "feat(cli): add 'zl init' interactive scaffold"
```

---

## Task 7: `zl secret` — CLI command

**Files:**
- Create: `packages/cli/src/commands/secret.ts`
- Create: `packages/cli/src/commands/secret.test.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/cli.test.ts`

**Scope:**
- `zl secret set <KEY>` — prompts for the value and stores it.
- `zl secret set <KEY> <VALUE>` — stores without prompting (handy for scripts; value is visible in shell history — document this in usage).
- `zl secret get <KEY>` — prints the value to stdout (no trailing newline? — use plain `console.log` which adds one).
- `zl secret list` — prints one key per line.
- `zl secret delete <KEY>` — deletes silently; exit 0 whether or not it existed (idempotent for the happy user flow).
- `zl secret` with no sub-verb prints usage.

Implementation uses a pluggable `SecretStore` resolved through an Effect layer so the tests can inject an in-memory store without hitting the keychain.

- [ ] **Step 1: Write failing happy-path tests**

Create `packages/cli/src/commands/secret.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { SecretStore, SecretStoreError } from "@zl/core"
import { runSecret } from "./secret"
import { makeIO } from "../test-utils/cli-io"

const inMemoryStore = () => {
  const map = new Map<string, string>()
  const layer = Layer.succeed(SecretStore, {
    set: (k, v) => Effect.sync(() => { map.set(k, v) }),
    get: (k) =>
      map.has(k)
        ? Effect.succeed(map.get(k)!)
        : Effect.fail(new SecretStoreError("NOT_FOUND", `${k} not found`)),
    list: () => Effect.succeed(Array.from(map.keys())),
    delete: (k) => Effect.sync(() => { map.delete(k) }),
  })
  return { map, layer }
}

describe("runSecret", () => {
  test("'set KEY' prompts for value and stores it", async () => {
    const { map, layer } = inMemoryStore()
    const { io } = makeIO({ answers: ["my-secret"] })
    const code = await runSecret({ args: ["set", "APPLE_KEY"], io, storeLayer: layer })
    expect(code).toBe(0)
    expect(map.get("APPLE_KEY")).toBe("my-secret")
  })

  test("'set KEY VALUE' stores without prompting", async () => {
    const { map, layer } = inMemoryStore()
    const { io, prompts } = makeIO()
    const code = await runSecret({ args: ["set", "APPLE_KEY", "inline"], io, storeLayer: layer })
    expect(code).toBe(0)
    expect(map.get("APPLE_KEY")).toBe("inline")
    expect(prompts).toHaveLength(0)
  })

  test("'get KEY' prints the value and exits 0", async () => {
    const { map, layer } = inMemoryStore()
    map.set("APPLE_KEY", "hello")
    const { io, out } = makeIO()
    const code = await runSecret({ args: ["get", "APPLE_KEY"], io, storeLayer: layer })
    expect(code).toBe(0)
    expect(out.join("\n")).toContain("hello")
  })

  test("'get KEY' exits 1 with a readable error when the key is missing", async () => {
    const { layer } = inMemoryStore()
    const { io, err } = makeIO()
    const code = await runSecret({ args: ["get", "MISSING"], io, storeLayer: layer })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("MISSING")
  })

  test("'list' prints stored keys one per line", async () => {
    const { map, layer } = inMemoryStore()
    map.set("A", "1"); map.set("B", "2")
    const { io, out } = makeIO()
    const code = await runSecret({ args: ["list"], io, storeLayer: layer })
    expect(code).toBe(0)
    expect(out.join("\n")).toContain("A")
    expect(out.join("\n")).toContain("B")
  })

  test("'delete KEY' removes it and returns 0", async () => {
    const { map, layer } = inMemoryStore()
    map.set("A", "1")
    const { io } = makeIO()
    const code = await runSecret({ args: ["delete", "A"], io, storeLayer: layer })
    expect(code).toBe(0)
    expect(map.has("A")).toBe(false)
  })

  test("unknown sub-verb prints usage and exits 1", async () => {
    const { layer } = inMemoryStore()
    const { io, err } = makeIO()
    const code = await runSecret({ args: ["explode"], io, storeLayer: layer })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("Usage")
  })

  test("'secret' with no sub-verb prints usage and exits 1", async () => {
    const { layer } = inMemoryStore()
    const { io, err } = makeIO()
    const code = await runSecret({ args: [], io, storeLayer: layer })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("Usage")
  })

  test("NOT_IMPLEMENTED (Linux) bubbles up with a clear message", async () => {
    const layer = Layer.succeed(SecretStore, {
      set: () => Effect.fail(new SecretStoreError("NOT_IMPLEMENTED", "Linux keychain is not yet implemented")),
      get: () => Effect.fail(new SecretStoreError("NOT_IMPLEMENTED", "Linux keychain is not yet implemented")),
      list: () => Effect.fail(new SecretStoreError("NOT_IMPLEMENTED", "Linux keychain is not yet implemented")),
      delete: () => Effect.fail(new SecretStoreError("NOT_IMPLEMENTED", "Linux keychain is not yet implemented")),
    })
    const { io, err } = makeIO({ answers: ["v"] })
    const code = await runSecret({ args: ["set", "K"], io, storeLayer: layer })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("not yet implemented")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/src/commands/secret.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `runSecret`**

Create `packages/cli/src/commands/secret.ts`:

```ts
import { Effect, Layer } from "effect"
import { SecretStore, type SecretStoreError } from "@zl/core"
import { defaultIO, type CliIO } from "../io"

const USAGE = `Usage:
  zl secret set <KEY> [VALUE]   Store a secret (prompts for value if omitted)
  zl secret get <KEY>           Print a secret to stdout
  zl secret list                List all stored keys
  zl secret delete <KEY>        Delete a secret
`

export interface SecretOptions {
  readonly args: ReadonlyArray<string>
  readonly io?: CliIO
  readonly storeLayer: Layer.Layer<SecretStore, never, never>
}

type Run = (store: Awaited<ReturnType<typeof getStore>>, io: CliIO) => Promise<number>

async function getStore(
  storeLayer: Layer.Layer<SecretStore, never, never>
): Promise<SecretStore["Service"]> {
  // `Layer.build` materialises the layer once; we read the service out of the context.
  return Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(Layer.build(storeLayer), (ctx) =>
        Effect.sync(() => ctx.unsafeGet(SecretStore))
      )
    )
  )
}

function explain(err: SecretStoreError): string {
  if (err.code === "NOT_FOUND") return `Not found: ${err.message}`
  if (err.code === "NOT_IMPLEMENTED") return err.message
  return `${err.code}: ${err.message}`
}

async function runWithStore(
  options: SecretOptions,
  run: Run
): Promise<number> {
  const io = options.io ?? defaultIO
  const store = await getStore(options.storeLayer)
  return run(store, io)
}

export async function runSecret(options: SecretOptions): Promise<number> {
  const io = options.io ?? defaultIO
  const [verb, ...rest] = options.args
  if (!verb) {
    io.stderr(USAGE)
    return 1
  }
  switch (verb) {
    case "set":
      return runWithStore(options, async (store, io) => {
        const [key, maybeValue] = rest
        if (!key) { io.stderr(USAGE); return 1 }
        const value = maybeValue ?? (await io.prompt(`Value for ${key}?`)).trim()
        if (value.length === 0) { io.stderr("Value is required."); return 1 }
        const exit = await Effect.runPromiseExit(store.set(key, value))
        if (exit._tag === "Failure") {
          io.stderr(explain(exit.cause.toJSON() as SecretStoreError))
          return 1
        }
        io.stdout(`  ✓ Stored ${key}`)
        return 0
      })
    case "get":
      return runWithStore(options, async (store, io) => {
        const [key] = rest
        if (!key) { io.stderr(USAGE); return 1 }
        const exit = await Effect.runPromiseExit(store.get(key))
        if (exit._tag === "Failure") {
          io.stderr(explain(exit.cause.toJSON() as SecretStoreError))
          return 1
        }
        io.stdout(exit.value)
        return 0
      })
    case "list":
      return runWithStore(options, async (store, io) => {
        const exit = await Effect.runPromiseExit(store.list())
        if (exit._tag === "Failure") {
          io.stderr(explain(exit.cause.toJSON() as SecretStoreError))
          return 1
        }
        for (const k of exit.value) io.stdout(k)
        return 0
      })
    case "delete":
      return runWithStore(options, async (store, io) => {
        const [key] = rest
        if (!key) { io.stderr(USAGE); return 1 }
        const exit = await Effect.runPromiseExit(store.delete(key))
        if (exit._tag === "Failure") {
          io.stderr(explain(exit.cause.toJSON() as SecretStoreError))
          return 1
        }
        io.stdout(`  ✓ Deleted ${key}`)
        return 0
      })
    default:
      io.stderr(USAGE)
      return 1
  }
}
```

Note: the `Effect.Cause.toJSON` round-trip above works for the concrete `SecretStoreError` we throw; if type inference struggles, switch to `Effect.runPromise` + explicit `try/catch` on `FiberFailure.cause`. Keep it as-is if tests pass.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/cli/src/commands/secret.test.ts`
Expected: 9/9 PASS.

If the `toJSON`-based error extraction hits a type error, fall back to this simpler shape inside each exit-handler:

```ts
const err: SecretStoreError = (exit.cause as any).defect ?? (exit.cause as any).error
```

…and adjust until the tests pass. The contract the tests care about is that `err.code` and `err.message` reach stderr.

- [ ] **Step 5: Wire into `cli.ts` dispatch**

Modify `packages/cli/src/cli.ts`:

Add at the top:

```ts
import { runSecret } from "./commands/secret"
import { makeSecretStoreLayer } from "@zl/core"
```

Insert this dispatch branch next to the `init` branch:

```ts
  if (command === "secret") {
    return runSecret({
      args: args.slice(1),
      io,
      storeLayer: Layer.provide(makeSecretStoreLayer(), LocalPlatformLive),
    })
  }
```

Where `Layer` and `LocalPlatformLive` are imported from `effect` and `@zl/core` respectively. Add the imports at the top:

```ts
import { Layer } from "effect"
import { LocalPlatformLive } from "@zl/core"
```

- [ ] **Step 6: Update `HELP_TEXT`**

Extend `HELP_TEXT` in `packages/cli/src/cli.ts`:

```ts
const HELP_TEXT = `
zero-line (zl) — Mobile CI/CD toolkit

Usage:
  zl <workflow>              Run a workflow
  zl run <workflow>          Run a workflow (explicit)
  zl list                    List workflows and steps
  zl init [--force]          Scaffold zl.config.ts
  zl doctor                  Check environment
  zl secret <set|get|list|delete> [KEY [VALUE]]
                             Manage OS-keychain-backed secrets
  zl --help                  Show this help

Options:
  --platform <ios|android>   Run only one platform
`
```

- [ ] **Step 7: Add CLI-level test**

Append to `packages/cli/src/cli.test.ts`:

```ts
  test("'secret' with no sub-verb returns 1 and prints usage", async () => {
    const { io, err } = makeIO()
    expect(await runCli(["secret"], { cwd: "/tmp", io })).toBe(1)
    expect(err.join("\n")).toContain("Usage")
  })
```

(End-to-end keychain tests intentionally omitted at the CLI layer — the unit tests in `secret.test.ts` cover behaviour with an injected store.)

- [ ] **Step 8: Run full CLI suite + typecheck + lint**

```bash
bun test --recursive packages/cli
bunx tsc --noEmit -p packages/cli/tsconfig.json
bunx oxlint packages/
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/src/commands/secret.ts \
  packages/cli/src/commands/secret.test.ts \
  packages/cli/src/cli.ts \
  packages/cli/src/cli.test.ts
git commit -m "feat(cli): add 'zl secret set/get/list/delete' command"
```

---

## Task 8: `DoctorRenderer` output helper

**Files:**
- Create: `packages/cli/src/output/DoctorRenderer.ts`
- Create: `packages/cli/src/output/DoctorRenderer.test.ts`

- [ ] **Step 1: Write failing renderer test**

Create `packages/cli/src/output/DoctorRenderer.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { renderDoctorResults, type DoctorResult } from "./DoctorRenderer"

describe("renderDoctorResults", () => {
  test("renders one line per check with an icon and details", () => {
    const results: ReadonlyArray<DoctorResult> = [
      { name: "Bun", status: "ok", detail: "1.3.12" },
      { name: "Xcode", status: "warn", detail: "not installed — ignore if not building iOS" },
      { name: "Android SDK", status: "fail", detail: "ANDROID_HOME not set" },
    ]
    const output = renderDoctorResults(results)
    expect(output).toContain("Bun")
    expect(output).toContain("1.3.12")
    expect(output).toContain("Xcode")
    expect(output).toContain("ANDROID_HOME")
    expect(output).toContain("1 ok, 1 warning, 1 failed")
  })

  test("returns a summary line even when there are zero checks", () => {
    expect(renderDoctorResults([])).toContain("0 ok")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/src/output/DoctorRenderer.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the renderer**

Create `packages/cli/src/output/DoctorRenderer.ts`:

```ts
export type DoctorStatus = "ok" | "warn" | "fail"

export interface DoctorResult {
  readonly name: string
  readonly status: DoctorStatus
  readonly detail: string
}

const OK = "\x1b[32m✓\x1b[0m"
const WARN = "\x1b[33m!\x1b[0m"
const FAIL = "\x1b[31m✗\x1b[0m"

function icon(s: DoctorStatus): string {
  return s === "ok" ? OK : s === "warn" ? WARN : FAIL
}

export function renderDoctorResults(results: ReadonlyArray<DoctorResult>): string {
  const lines: string[] = []
  let ok = 0, warn = 0, fail = 0
  for (const r of results) {
    lines.push(`  ${icon(r.status)} ${r.name} — ${r.detail}`)
    if (r.status === "ok") ok++
    else if (r.status === "warn") warn++
    else fail++
  }
  lines.push("")
  lines.push(`  ${ok} ok, ${warn} warning, ${fail} failed`)
  return lines.join("\n")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/cli/src/output/DoctorRenderer.test.ts`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/output/DoctorRenderer.ts \
  packages/cli/src/output/DoctorRenderer.test.ts
git commit -m "feat(cli): add DoctorRenderer output helper"
```

---

## Task 9: `zl doctor` — environment checks

**Files:**
- Create: `packages/cli/src/commands/doctor.ts`
- Create: `packages/cli/src/commands/doctor.test.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/cli.test.ts`

**Checks (in order):**
1. **Bun** — `Bun.version` (always reports ok with the version string).
2. **Xcode** (macOS only) — `xcodebuild -version`. ok if exit 0; warn if missing on macOS + no `ios` in config; fail if missing on macOS + `ios` in config. On non-macOS: skip (not included in results).
3. **Android SDK** — `ANDROID_HOME` or `ANDROID_SDK_ROOT` env var set. ok if either set and `<root>/platform-tools/adb` exists; fail otherwise.
4. **Gradle** — `gradle --version`. warn if missing (project may use the wrapper); ok if exit 0.
5. **Keychain** — write+read+delete a sentinel key `zl.doctor.probe`. ok if roundtrip works; fail with the underlying `SecretStoreError.code`.

- [ ] **Step 1: Write failing doctor tests**

Create `packages/cli/src/commands/doctor.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import {
  PlatformService, SecretStore, SecretStoreError, ShellService, ShellError,
  type ShellResult,
} from "@zl/core"
import { runDoctor } from "./doctor"
import { makeIO } from "../test-utils/cli-io"

const platform = (os: "darwin" | "linux" | "win32") =>
  Layer.succeed(PlatformService, {
    os: () => Effect.succeed(os),
    availableToolchains: () => Effect.succeed([]),
    supports: () => Effect.succeed(true),
  })

const shell = (
  handler: (argv: ReadonlyArray<string>) => ShellResult | ShellError
) =>
  Layer.succeed(ShellService, {
    spawn: (opts) => {
      const out = handler(opts.argv)
      return out instanceof ShellError ? Effect.fail(out) : Effect.succeed(out)
    },
  })

const okStore = (fail = false) =>
  Layer.succeed(SecretStore, {
    set: () => fail
      ? Effect.fail(new SecretStoreError("WRITE_FAILED", "permission denied"))
      : Effect.void,
    get: () => Effect.succeed("probe"),
    list: () => Effect.succeed([]),
    delete: () => Effect.void,
  })

describe("runDoctor", () => {
  test("macOS happy path reports ok for every check", async () => {
    const { io, out } = makeIO()
    const code = await runDoctor({
      io,
      platformLayer: platform("darwin"),
      shellLayer: shell((argv) => {
        if (argv[0] === "xcodebuild") return { exitCode: 0, stdout: "Xcode 15.4", stderr: "" }
        if (argv[0] === "gradle") return { exitCode: 0, stdout: "Gradle 8.5", stderr: "" }
        return new ShellError({ code: "SPAWN_FAILED", message: "unexpected" })
      }),
      storeLayer: okStore(),
      env: { ANDROID_HOME: "/opt/android", HOME: "/Users/x" },
      adbExists: () => true,
    })
    expect(code).toBe(0)
    const joined = out.join("\n")
    expect(joined).toContain("Bun")
    expect(joined).toContain("Xcode")
    expect(joined).toContain("Android SDK")
    expect(joined).toContain("Gradle")
    expect(joined).toContain("Keychain")
  })

  test("Xcode missing on macOS is reported as fail", async () => {
    const { io, out } = makeIO()
    const code = await runDoctor({
      io,
      platformLayer: platform("darwin"),
      shellLayer: shell((argv) =>
        argv[0] === "xcodebuild"
          ? new ShellError({ code: "SPAWN_FAILED", message: "command not found" })
          : { exitCode: 0, stdout: "", stderr: "" }
      ),
      storeLayer: okStore(),
      env: { ANDROID_HOME: "/opt/android" },
      adbExists: () => true,
    })
    expect(code).toBe(1)
    const joined = out.join("\n")
    expect(joined).toContain("Xcode")
  })

  test("non-macOS skips Xcode entirely", async () => {
    const { io, out } = makeIO()
    await runDoctor({
      io,
      platformLayer: platform("linux"),
      shellLayer: shell(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      storeLayer: okStore(),
      env: { ANDROID_HOME: "/opt/android" },
      adbExists: () => true,
    })
    expect(out.join("\n")).not.toContain("Xcode")
  })

  test("ANDROID_HOME set but adb missing fails the Android check", async () => {
    const { io, out } = makeIO()
    const code = await runDoctor({
      io,
      platformLayer: platform("linux"),
      shellLayer: shell(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      storeLayer: okStore(),
      env: { ANDROID_HOME: "/opt/android" },
      adbExists: () => false,
    })
    expect(code).toBe(1)
    expect(out.join("\n")).toContain("adb")
  })

  test("keychain probe failure propagates", async () => {
    const { io, out } = makeIO()
    const code = await runDoctor({
      io,
      platformLayer: platform("darwin"),
      shellLayer: shell(() => ({ exitCode: 0, stdout: "Xcode 15.4", stderr: "" })),
      storeLayer: okStore(true),
      env: { ANDROID_HOME: "/opt/android" },
      adbExists: () => true,
    })
    expect(code).toBe(1)
    expect(out.join("\n")).toContain("Keychain")
  })

  test("returns 0 when all results are ok or warn (no fails)", async () => {
    const { io } = makeIO()
    const code = await runDoctor({
      io,
      platformLayer: platform("linux"),
      shellLayer: shell((argv) =>
        argv[0] === "gradle"
          ? new ShellError({ code: "SPAWN_FAILED", message: "not found" })
          : { exitCode: 0, stdout: "", stderr: "" }
      ),
      storeLayer: okStore(),
      env: { ANDROID_HOME: "/opt/android" },
      adbExists: () => true,
    })
    expect(code).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/cli/src/commands/doctor.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `runDoctor`**

Create `packages/cli/src/commands/doctor.ts`:

```ts
import { existsSync } from "fs"
import { join } from "path"
import { Effect, Layer } from "effect"
import {
  PlatformService, SecretStore, SecretStoreError,
  ShellService, ShellError, LocalPlatformLive, LocalShellLive,
  makeSecretStoreLayer,
} from "@zl/core"
import { defaultIO, type CliIO } from "../io"
import { renderDoctorResults, type DoctorResult } from "../output/DoctorRenderer"

export interface DoctorOptions {
  readonly io?: CliIO
  readonly platformLayer?: Layer.Layer<PlatformService, never, never>
  readonly shellLayer?: Layer.Layer<ShellService, never, never>
  readonly storeLayer?: Layer.Layer<SecretStore, never, never>
  readonly env?: NodeJS.ProcessEnv
  readonly adbExists?: (home: string) => boolean
}

const PROBE_KEY = "zl.doctor.probe"

async function runCheck<A>(
  layer: Layer.Layer<A, never, never>,
  program: (svc: A) => Effect.Effect<DoctorResult, never, never>,
  tag: { Service: A; key: string }
): Promise<DoctorResult> {
  // Generic helper avoided — prefer inline Effect.gen in each check below.
  throw new Error("unused")
}

export async function runDoctor(options: DoctorOptions = {}): Promise<number> {
  const io = options.io ?? defaultIO
  const platformLayer = options.platformLayer ?? LocalPlatformLive
  const shellLayer = options.shellLayer ?? LocalShellLive
  const storeLayer =
    options.storeLayer ?? Layer.provide(makeSecretStoreLayer(), platformLayer)
  const env = options.env ?? process.env
  const adbExists =
    options.adbExists ?? ((home: string) => existsSync(join(home, "platform-tools", "adb")))

  const results: DoctorResult[] = []

  // 1. Bun
  results.push({ name: "Bun", status: "ok", detail: Bun.version })

  // 2. OS + Xcode + Gradle + keychain probe via a single Effect program
  const program = Effect.gen(function* () {
    const platform = yield* PlatformService
    const shell = yield* ShellService
    const store = yield* SecretStore
    const os = yield* platform.os()

    // Xcode (macOS only)
    if (os === "darwin") {
      const xcode = yield* Effect.either(shell.spawn({ argv: ["xcodebuild", "-version"] }))
      if (xcode._tag === "Right") {
        const line = xcode.right.stdout.split(/\r?\n/)[0] ?? "Xcode"
        results.push({ name: "Xcode", status: "ok", detail: line })
      } else {
        results.push({
          name: "Xcode",
          status: "fail",
          detail: "not installed — run `xcode-select --install` or install Xcode.app",
        })
      }
    }

    // Android SDK
    const androidHome = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT
    if (!androidHome) {
      results.push({
        name: "Android SDK",
        status: "fail",
        detail: "ANDROID_HOME / ANDROID_SDK_ROOT not set",
      })
    } else if (!adbExists(androidHome)) {
      results.push({
        name: "Android SDK",
        status: "fail",
        detail: `adb not found under ${androidHome}/platform-tools/`,
      })
    } else {
      results.push({ name: "Android SDK", status: "ok", detail: androidHome })
    }

    // Gradle
    const gradle = yield* Effect.either(shell.spawn({ argv: ["gradle", "--version"] }))
    if (gradle._tag === "Right") {
      const line = gradle.right.stdout.split(/\r?\n/).find((l) => /^Gradle /.test(l)) ?? "installed"
      results.push({ name: "Gradle", status: "ok", detail: line })
    } else {
      results.push({
        name: "Gradle",
        status: "warn",
        detail: "not installed globally (wrappers `./gradlew` still work)",
      })
    }

    // Keychain probe: write → read → delete
    const probe = Effect.gen(function* () {
      yield* store.set(PROBE_KEY, "ok")
      const v = yield* store.get(PROBE_KEY)
      yield* store.delete(PROBE_KEY)
      return v === "ok"
    })
    const probeExit = yield* Effect.either(probe)
    if (probeExit._tag === "Right" && probeExit.right) {
      results.push({ name: "Keychain", status: "ok", detail: "probe set/get/delete round-trip succeeded" })
    } else {
      const err = probeExit._tag === "Left" ? probeExit.left : new SecretStoreError("READ_FAILED", "probe mismatch")
      results.push({
        name: "Keychain",
        status: "fail",
        detail: `${err.code}: ${err.message}`,
      })
    }
  })

  await Effect.runPromise(
    Effect.provide(
      program,
      Layer.mergeAll(platformLayer, shellLayer, storeLayer)
    )
  )

  io.stdout("\nEnvironment check:\n")
  io.stdout(renderDoctorResults(results))

  return results.some((r) => r.status === "fail") ? 1 : 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/cli/src/commands/doctor.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Wire into `cli.ts` dispatch**

Modify `packages/cli/src/cli.ts`:

Add at the top:

```ts
import { runDoctor } from "./commands/doctor"
```

Insert this branch next to `init` / `secret`:

```ts
  if (command === "doctor") {
    return runDoctor({ io })
  }
```

- [ ] **Step 6: Add CLI-level happy test**

Append to `packages/cli/src/cli.test.ts`:

```ts
  test("'doctor' runs and returns an exit code (0 or 1 depending on host)", async () => {
    const { io } = makeIO()
    const code = await runCli(["doctor"], { cwd: "/tmp", io })
    expect([0, 1]).toContain(code)
  })
```

(This test is intentionally lenient — CI runners may or may not have Xcode installed. The unit tests in `doctor.test.ts` cover specific branches with injected layers.)

- [ ] **Step 7: Run full CLI + core suites**

```bash
bun test --recursive packages/
bunx tsc --noEmit -p packages/cli/tsconfig.json
bunx tsc --noEmit -p packages/core/tsconfig.json
bunx oxlint packages/
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/commands/doctor.ts \
  packages/cli/src/commands/doctor.test.ts \
  packages/cli/src/cli.ts \
  packages/cli/src/cli.test.ts
git commit -m "feat(cli): add 'zl doctor' environment check"
```

---

## Task 10 (optional — depends on M-A1): `zl doctor` surfaces declared step requirements

Only execute if M-A1 has merged and `@zl/core` exports `StepInstanceResolver` + a helper for gathering `requiredSecrets` / `requiredToolchains` / `requiredEnv`. Otherwise skip to Task 11.

**Files:**
- Modify: `packages/cli/src/commands/doctor.ts`
- Modify: `packages/cli/src/commands/doctor.test.ts`

- [ ] **Step 1: Write failing test**

Append to `packages/cli/src/commands/doctor.test.ts`:

```ts
  test("when a zl.config.ts is present, surfaces declared required secrets as a warn row", async () => {
    // scripted scenario: pass a mock config loader that returns two step
    // instances with requiredSecrets = ["APPLE_API_KEY", "PLAY_KEY"]; pass a
    // storeLayer that has APPLE_API_KEY but not PLAY_KEY. Expect a single
    // "Declared secrets" row with status=warn listing PLAY_KEY.
    // (Implement once M-A1's resolver API is in place; leaving as the
    //  behavioural contract for this follow-up.)
  })
```

Leave the test body empty for now (or skip via `test.skip(...)`). Fill it in once M-A1 has landed; this task exists in the plan as a reminder — it will be filed as a separate Linear ticket.

- [ ] **Step 2: Commit the placeholder**

```bash
git add packages/cli/src/commands/doctor.test.ts
git commit -m "chore(cli): placeholder test for 'zl doctor' step-requirement surfacing"
```

*(If M-A1 is already merged when this plan executes, replace this task with a full TDD implementation that loads the config, resolves step instances, gathers declared requirements, and produces one row per requirement category. The existing runner structure makes it a ~40-line addition to `runDoctor`.)*

---

## Task 11: README quickstart + `CHANGELOG.md` entries

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md` (if present; otherwise skip)

- [ ] **Step 1: Replace any outdated quickstart in README with the M-A2 flow**

Add (or replace the existing `## Getting started` section of) `README.md` with:

```markdown
## Getting started

```bash
# Install (macOS / Linux)
brew install swissonid/tap/zl

# Scaffold a new project
cd my-app
zl init
# → prompts for app name, bundle id, platforms; writes zl.config.ts

# Check your toolchain
zl doctor

# Store signing secrets in the OS keychain
zl secret set APPLE_API_KEY

# Run a workflow
zl run ci
```
```

Leave any other README content untouched.

- [ ] **Step 2: Append to `CHANGELOG.md` if it exists**

If `CHANGELOG.md` exists at the repo root, append the following under `## [Unreleased]`:

```markdown
- Added `zl init` — interactive scaffold for new projects.
- Added `zl doctor` — environment checks (Bun, Xcode, Android SDK, Gradle, keychain).
- Added `zl secret set|get|list|delete` — OS-keychain-backed secret store (macOS; Linux returns a clear "not yet implemented" error).
- `ctx.config.secret(key)` now falls back to the OS keychain when the key is not set in the environment.
```

If `CHANGELOG.md` doesn't exist yet, do nothing (the seed-changelog ticket covers that).

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md 2>/dev/null || git add README.md
git commit -m "docs: quickstart covering zl init / doctor / secret"
```

---

## Final verification

- [ ] **Run the full pipeline**

```bash
bunx tsc --noEmit -p packages/core/tsconfig.json && \
  bunx tsc --noEmit -p packages/cli/tsconfig.json && \
  bunx oxlint packages/ && \
  bun test --recursive packages/
```

Expected:
- typecheck green
- lint: 0 warnings, 0 errors
- all tests pass
- approximately 25–30 new tests across core + cli (SecretStore port, macOS adapter, Linux stub, factory, FileConfig fallback, prompts, init, secret, doctor, DoctorRenderer)

- [ ] **Manual smoke test on macOS**

```bash
cd $(mktemp -d) && bun <repo>/packages/cli/src/index.ts init
# answer: "Smoke App", enter (for default bundle), enter (for default platforms)
bun <repo>/packages/cli/src/index.ts doctor
bun <repo>/packages/cli/src/index.ts secret set SMOKE_KEY
# enter: "hello"
bun <repo>/packages/cli/src/index.ts secret get SMOKE_KEY
# expect: "hello"
bun <repo>/packages/cli/src/index.ts secret list | grep SMOKE_KEY
bun <repo>/packages/cli/src/index.ts secret delete SMOKE_KEY
bun <repo>/packages/cli/src/index.ts secret get SMOKE_KEY  # expect exit 1
```

- [ ] **Open the PRs**

Per project policy, one Linear issue = one PR. Split the feature branch by ticket:

1. **PR A** — `feat(core): SecretStore port + adapters + FileConfig integration` (Tasks 2–5).
2. **PR B** — `feat(cli): CliIO.prompt + 'zl init' scaffold` (Tasks 1, 6).
3. **PR C** — `feat(cli): 'zl secret' command` (Task 7).
4. **PR D** — `feat(cli): 'zl doctor' environment check` (Tasks 8, 9, 10-if-feasible).
5. **PR E** — `docs: quickstart covering zl init / doctor / secret` (Task 11).

If the reviewer prefers fewer PRs, PR A + (B, C, D merged) + E is acceptable; flag the dependency graph in each PR body. **The user merges PRs themselves** — stop at the "please review @greptile" loop once every PR is green.

---

## Self-review checklist (performed at plan-writing time)

- **Spec coverage:**
  - `zl init` — covered in Task 6 (prompts for name / bundle id / platforms, writes `zl.config.ts`). Spec also mentions "install example steps as dev dependencies" — deliberately deferred: that needs a plugin-install command that doesn't exist yet, and the scaffolded `zl.config.ts` already references `"hello"` which is resolved from the workspace. Follow-up ticket at the end of M-A if needed.
  - `zl doctor` — covered in Tasks 8+9 for the static toolchain checks; Task 10 is the optional M-A1-gated follow-up for "surfaces declared step requirements". Matches spec's "Structured output; non-zero exit on missing mandatory toolchains."
  - `zl secret set/get/list/delete` — covered in Task 7, backed by the macOS adapter in Task 3 and the Linux stub in Task 4. Spec's "clear 'Linux keychain not yet implemented' error" is the `SecretStoreError("NOT_IMPLEMENTED", ...)` in `LinuxStubSecretStoreLive`.
  - Secrets discipline: `ctx.config.secret(key)` now falls back to the keychain via `FileConfig`'s wiring (Task 5), which also honours `process.env` first for CI.
- **Placeholder scan:** Task 10 is labelled "optional — depends on M-A1" with a clearly defined contract but a left-empty test body. This is explicit and gated, not a hidden TBD.
- **Type consistency:** `SecretStore` / `SecretStoreError` / `ISecretStore` / `SecretStoreErrorCode` are defined in Task 2 and used consistently in Tasks 3, 4, 5, 7, 9. `CliIO.prompt` signature from Task 1 (`(question, opts?) => Promise<string>`) matches every usage in Tasks 6 and 7. `DoctorResult` + `DoctorStatus` defined in Task 8 and used unchanged in Task 9.
