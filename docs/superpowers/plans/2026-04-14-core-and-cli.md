# zero-line Core + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core execution engine, step contract, and CLI so that `zl` can load steps, resolve workflows, and execute a pipeline end-to-end.

**Architecture:** Hexagonal architecture using Effect.ts. Core defines ports (services), steps provide adapters (layers). A thin CLI delegates to core. An example "hello" step proves the system works end-to-end without any mobile-specific code.

**Tech Stack:** Bun 1.3+, TypeScript 5.x, Effect.ts (latest), Bun workspaces, Bun test

---

## File Structure

```
zero-line/
├── package.json                              # Workspace root
├── tsconfig.base.json                        # Shared TS config
├── bunfig.toml                               # Bun config + coverage threshold
├── biome.json                                # Linter/formatter config
├── .husky/
│   └── pre-commit                            # Runs typecheck + lint + tests
├── packages/
│   ├── core/
│   │   ├── package.json                      # @zl/core
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                      # Public API re-exports
│   │       ├── ports/
│   │       │   ├── LoggerService.ts          # Structured logging port
│   │       │   ├── ConfigService.ts          # Config + secrets port
│   │       │   ├── PlatformService.ts        # OS/toolchain detection port
│   │       │   └── ArtifactService.ts        # Artifact passing port
│   │       ├── adapters/
│   │       │   ├── ConsoleLogger.ts          # LoggerService impl
│   │       │   ├── FileConfig.ts             # ConfigService impl
│   │       │   ├── LocalPlatform.ts          # PlatformService impl
│   │       │   └── MemoryArtifactStore.ts    # ArtifactService impl
│   │       ├── step-loader/
│   │       │   ├── StepContract.ts           # defineStep, defineEffectStep, types
│   │       │   ├── StepLoader.ts             # Load + validate + resolve names
│   │       │   └── StepNameResolver.ts       # Scoping + collision detection
│   │       ├── engine/
│   │       │   ├── Pipeline.ts               # Workflow execution engine
│   │       │   └── DependencyGraph.ts        # Topological sort of steps
│   │       └── config/
│   │           ├── ConfigLoader.ts           # Load zl.config.ts
│   │           └── ConfigTypes.ts            # defineConfig, ZlConfig types
│   ├── cli/
│   │   ├── package.json                      # @zl/cli
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                      # CLI entry point
│   │       ├── commands/
│   │       │   ├── run.ts                    # zl <workflow> / zl run <workflow>
│   │       │   ├── list.ts                   # zl list
│   │       │   ├── doctor.ts                 # zl doctor
│   │       │   └── init.ts                   # zl init (scaffold)
│   │       └── output/
│   │           └── Renderer.ts               # Step progress, durations, pass/fail
│   └── steps/
│       └── hello/
│           └── hello/
│               ├── package.json              # @zl/step-hello (example step)
│               ├── tsconfig.json
│               └── src/
│                   └── index.ts              # Example step for E2E testing
```

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `bunfig.toml`
- Create: `.gitignore` (replace existing)
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/steps/hello/hello/package.json`
- Create: `packages/steps/hello/hello/tsconfig.json`

- [ ] **Step 1: Create root package.json with workspaces**

```json
{
  "name": "zero-line",
  "private": true,
  "workspaces": [
    "packages/core",
    "packages/cli",
    "packages/steps/*/*"
  ]
}
```

- [ ] **Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["bun-types"]
  }
}
```

- [ ] **Step 3: Create bunfig.toml**

```toml
[install]
peer = false

[test]
coverage = false
```

- [ ] **Step 4: Replace .gitignore**

```
node_modules
dist
*.tsbuildinfo
bun.lockb
fastlane
.DS_Store
```

- [ ] **Step 5: Create packages/core/package.json**

```json
{
  "name": "@zl/core",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./ports": "./src/ports/index.ts"
  },
  "peerDependencies": {
    "effect": "^3.0.0"
  },
  "devDependencies": {
    "effect": "^3.0.0",
    "typescript": "^5.0.0",
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 6: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Create packages/cli/package.json**

```json
{
  "name": "@zl/cli",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "bin": {
    "zl": "src/index.ts"
  },
  "dependencies": {
    "@zl/core": "workspace:*"
  },
  "devDependencies": {
    "effect": "^3.0.0",
    "typescript": "^5.0.0",
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 8: Create packages/cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 9: Create packages/steps/hello/hello/package.json**

```json
{
  "name": "@zl/step-hello",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@zl/core": "workspace:*"
  },
  "devDependencies": {
    "effect": "^3.0.0",
    "typescript": "^5.0.0",
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 10: Create packages/steps/hello/hello/tsconfig.json**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 11: Run bun install**

Run: `bun install`
Expected: Dependencies install successfully, `bun.lockb` is created.

- [ ] **Step 12: Verify workspace resolution**

Run: `bun pm ls`
Expected: Shows `@zl/core`, `@zl/cli`, and `@zl/step-hello` as workspace packages.

- [ ] **Step 13: Commit**

```bash
git add package.json tsconfig.base.json bunfig.toml .gitignore packages/
git commit -m "feat: scaffold monorepo with bun workspaces

Sets up @zl/core, @zl/cli, and @zl/step-hello packages."
```

---

### Task 1b: Husky, Linting, and Code Coverage

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json` (add devDependencies + scripts)
- Create: `biome.json` (linter/formatter config)
- Modify: `bunfig.toml` (add coverage config)

- [ ] **Step 1: Install Husky and initialize**

Run:
```bash
bun add -d husky -W
bunx husky init
```
Expected: Creates `.husky/` directory with a sample pre-commit hook.

- [ ] **Step 2: Install Biome for linting and formatting**

Run: `bun add -d @biomejs/biome -W`

- [ ] **Step 3: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "include": ["packages/**/*.ts"],
    "ignore": ["**/dist/**", "**/node_modules/**"]
  }
}
```

- [ ] **Step 4: Add scripts to root package.json**

Add to `package.json`:

```json
{
  "scripts": {
    "lint": "bunx biome check packages/",
    "lint:fix": "bunx biome check --write packages/",
    "typecheck": "bunx tsc --noEmit -p packages/core/tsconfig.json && bunx tsc --noEmit -p packages/cli/tsconfig.json",
    "test": "bun test --recursive packages/",
    "test:coverage": "bun test --recursive --coverage packages/"
  }
}
```

- [ ] **Step 5: Configure coverage threshold in bunfig.toml**

Update `bunfig.toml`:

```toml
[install]
peer = false

[test]
coverage = false
coverageThreshold = { line = 80, function = 80, statement = 80 }
```

- [ ] **Step 6: Configure the pre-commit hook**

Write `.husky/pre-commit`:

```bash
#!/usr/bin/env sh

bun run typecheck
bun run lint
bun run test
```

- [ ] **Step 7: Verify the hook runs**

Run: `git add -A && git commit --dry-run -m "test hook"`
Expected: Runs typecheck, lint, and tests before allowing the commit. (Will fail since no source files exist yet — that's fine, just verify the hook triggers.)

- [ ] **Step 8: Commit**

```bash
git add package.json biome.json bunfig.toml .husky/ bun.lockb
git commit -m "feat: add husky pre-commit hook with typecheck, lint, and tests

Installs Husky + Biome. Pre-commit runs tsc, biome check, and bun test.
Coverage threshold set to 80% for lines, functions, and statements." --no-verify
```

Note: `--no-verify` only for this bootstrap commit since there's no source code to check yet.

---

### Task 2: LoggerService (Port + Adapter)

**Files:**
- Create: `packages/core/src/ports/LoggerService.ts`
- Create: `packages/core/src/adapters/ConsoleLogger.ts`
- Test: `packages/core/src/ports/LoggerService.test.ts`
- Test: `packages/core/src/adapters/ConsoleLogger.test.ts`

- [ ] **Step 1: Write the failing test for LoggerService port**

Create `packages/core/src/ports/LoggerService.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { LoggerService } from "./LoggerService"

describe("LoggerService", () => {
  test("can be used in an Effect program", () => {
    const testLogger = Layer.succeed(LoggerService, {
      info: (_msg: string) => Effect.void,
      warn: (_msg: string) => Effect.void,
      error: (_msg: string) => Effect.void,
      debug: (_msg: string) => Effect.void,
    })

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.info("test message")
      return "ok"
    })

    const result = Effect.runSync(Effect.provide(program, testLogger))
    expect(result).toBe("ok")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/ports/LoggerService.test.ts`
Expected: FAIL — `LoggerService` module not found.

- [ ] **Step 3: Implement LoggerService port**

Create `packages/core/src/ports/LoggerService.ts`:

```typescript
import { Context, Effect } from "effect"

export interface ILoggerService {
  readonly info: (msg: string) => Effect.Effect<void>
  readonly warn: (msg: string) => Effect.Effect<void>
  readonly error: (msg: string) => Effect.Effect<void>
  readonly debug: (msg: string) => Effect.Effect<void>
}

export class LoggerService extends Context.Tag("LoggerService")<
  LoggerService,
  ILoggerService
>() {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/core/src/ports/LoggerService.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for ConsoleLogger adapter**

Create `packages/core/src/adapters/ConsoleLogger.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { LoggerService } from "../ports/LoggerService"
import { ConsoleLoggerLive } from "./ConsoleLogger"

describe("ConsoleLogger", () => {
  test("info writes to stdout", () => {
    const messages: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => messages.push(String(args[0]))

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.info("hello world")
    })

    Effect.runSync(Effect.provide(program, ConsoleLoggerLive))
    console.log = originalLog

    expect(messages.some((m) => m.includes("hello world"))).toBe(true)
  })

  test("error writes with ERROR prefix", () => {
    const messages: string[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => messages.push(String(args[0]))

    const program = Effect.gen(function* () {
      const logger = yield* LoggerService
      yield* logger.error("something broke")
    })

    Effect.runSync(Effect.provide(program, ConsoleLoggerLive))
    console.error = originalError

    expect(messages.some((m) => m.includes("something broke"))).toBe(true)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test packages/core/src/adapters/ConsoleLogger.test.ts`
Expected: FAIL — `ConsoleLogger` module not found.

- [ ] **Step 7: Implement ConsoleLogger adapter**

Create `packages/core/src/adapters/ConsoleLogger.ts`:

```typescript
import { Effect, Layer } from "effect"
import { LoggerService } from "../ports/LoggerService"

export const ConsoleLoggerLive = Layer.succeed(LoggerService, {
  info: (msg: string) => Effect.sync(() => console.log(`[INFO] ${msg}`)),
  warn: (msg: string) => Effect.sync(() => console.warn(`[WARN] ${msg}`)),
  error: (msg: string) => Effect.sync(() => console.error(`[ERROR] ${msg}`)),
  debug: (msg: string) => Effect.sync(() => console.debug(`[DEBUG] ${msg}`)),
})
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test packages/core/src/adapters/ConsoleLogger.test.ts`
Expected: PASS (both tests)

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/ports/LoggerService.ts packages/core/src/ports/LoggerService.test.ts packages/core/src/adapters/ConsoleLogger.ts packages/core/src/adapters/ConsoleLogger.test.ts
git commit -m "feat(core): add LoggerService port and ConsoleLogger adapter"
```

---

### Task 3: ConfigService (Port + Adapter)

**Files:**
- Create: `packages/core/src/ports/ConfigService.ts`
- Create: `packages/core/src/adapters/FileConfig.ts`
- Create: `packages/core/src/config/ConfigTypes.ts`
- Test: `packages/core/src/ports/ConfigService.test.ts`
- Test: `packages/core/src/adapters/FileConfig.test.ts`

- [ ] **Step 1: Write ConfigTypes first (shared types used by port)**

Create `packages/core/src/config/ConfigTypes.ts`:

```typescript
export interface AppConfig {
  readonly name: string
  readonly bundleId: string
}

export type Platform = "ios" | "android"

export interface PlatformConfig {
  readonly steps: ReadonlyArray<StepInstance>
}

export interface StepInstance {
  readonly name: string
  readonly options: Record<string, unknown>
}

export interface WorkflowConfig {
  readonly [name: string]: ReadonlyArray<string>
}

export interface ZlConfig {
  readonly app: AppConfig
  readonly platforms: Partial<Record<Platform, PlatformConfig>>
  readonly steps?: ReadonlyArray<StepInstance>
  readonly workflows: WorkflowConfig
}

export function defineConfig(config: ZlConfig): ZlConfig {
  return config
}
```

- [ ] **Step 2: Write failing test for ConfigService port**

Create `packages/core/src/ports/ConfigService.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ConfigService } from "./ConfigService"
import type { ZlConfig } from "../config/ConfigTypes"

describe("ConfigService", () => {
  test("can load config and read values", () => {
    const mockConfig: ZlConfig = {
      app: { name: "TestApp", bundleId: "com.test.app" },
      platforms: {},
      workflows: { test: ["hello"] },
    }

    const testConfigLayer = Layer.succeed(ConfigService, {
      load: () => Effect.succeed(mockConfig),
      env: (key: string) => Effect.succeed(process.env[key]),
      secret: (key: string) => Effect.succeed(`secret-${key}`),
    })

    const program = Effect.gen(function* () {
      const config = yield* ConfigService
      const loaded = yield* config.load()
      return loaded.app.name
    })

    const result = Effect.runSync(Effect.provide(program, testConfigLayer))
    expect(result).toBe("TestApp")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test packages/core/src/ports/ConfigService.test.ts`
Expected: FAIL — `ConfigService` module not found.

- [ ] **Step 4: Implement ConfigService port**

Create `packages/core/src/ports/ConfigService.ts`:

```typescript
import { Context, Effect } from "effect"
import type { ZlConfig } from "../config/ConfigTypes"

export interface IConfigService {
  readonly load: () => Effect.Effect<ZlConfig, ConfigLoadError>
  readonly env: (key: string) => Effect.Effect<string | undefined>
  readonly secret: (key: string) => Effect.Effect<string | undefined, SecretNotFoundError>
}

export class ConfigLoadError {
  readonly _tag = "ConfigLoadError"
  constructor(readonly message: string) {}
}

export class SecretNotFoundError {
  readonly _tag = "SecretNotFoundError"
  constructor(readonly key: string) {}
}

export class ConfigService extends Context.Tag("ConfigService")<
  ConfigService,
  IConfigService
>() {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/core/src/ports/ConfigService.test.ts`
Expected: PASS

- [ ] **Step 6: Write failing test for FileConfig adapter**

Create `packages/core/src/adapters/FileConfig.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { ConfigService } from "../ports/ConfigService"
import { makeFileConfigLayer } from "./FileConfig"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"

describe("FileConfig", () => {
  const tmpDir = join(import.meta.dir, "__test_tmp__")

  test("loads zl.config.ts from a given directory", async () => {
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, "zl.config.ts"),
      `export default {
        app: { name: "TestApp", bundleId: "com.test.app" },
        platforms: {},
        workflows: { ci: ["hello"] },
      }`
    )

    const layer = makeFileConfigLayer(tmpDir)

    const program = Effect.gen(function* () {
      const config = yield* ConfigService
      const loaded = yield* config.load()
      return loaded.app.name
    })

    const result = await Effect.runPromise(Effect.provide(program, layer))
    expect(result).toBe("TestApp")

    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("env reads from process.env", async () => {
    process.env.__ZL_TEST_KEY__ = "test-value"

    const layer = makeFileConfigLayer(".")

    const program = Effect.gen(function* () {
      const config = yield* ConfigService
      return yield* config.env("__ZL_TEST_KEY__")
    })

    const result = await Effect.runPromise(Effect.provide(program, layer))
    expect(result).toBe("test-value")

    delete process.env.__ZL_TEST_KEY__
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `bun test packages/core/src/adapters/FileConfig.test.ts`
Expected: FAIL — `FileConfig` module not found.

- [ ] **Step 8: Implement FileConfig adapter**

Create `packages/core/src/adapters/FileConfig.ts`:

```typescript
import { Effect, Layer } from "effect"
import { join } from "path"
import { ConfigService, ConfigLoadError } from "../ports/ConfigService"
import type { ZlConfig } from "../config/ConfigTypes"

export function makeFileConfigLayer(projectDir: string) {
  return Layer.succeed(ConfigService, {
    load: () =>
      Effect.tryPromise({
        try: async () => {
          const configPath = join(projectDir, "zl.config.ts")
          const mod = await import(configPath)
          return (mod.default ?? mod) as ZlConfig
        },
        catch: (err) =>
          new ConfigLoadError(
            `Failed to load zl.config.ts: ${err instanceof Error ? err.message : String(err)}`
          ),
      }),

    env: (key: string) => Effect.succeed(process.env[key]),

    secret: (key: string) =>
      Effect.sync(() => {
        const envValue = process.env[key]
        if (envValue !== undefined) return envValue
        // TODO: OS keychain lookup (Task for secret management plan)
        return undefined
      }),
  })
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `bun test packages/core/src/adapters/FileConfig.test.ts`
Expected: PASS (both tests)

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/config/ConfigTypes.ts packages/core/src/ports/ConfigService.ts packages/core/src/ports/ConfigService.test.ts packages/core/src/adapters/FileConfig.ts packages/core/src/adapters/FileConfig.test.ts
git commit -m "feat(core): add ConfigService port, FileConfig adapter, and config types"
```

---

### Task 4: PlatformService (Port + Adapter)

**Files:**
- Create: `packages/core/src/ports/PlatformService.ts`
- Create: `packages/core/src/adapters/LocalPlatform.ts`
- Test: `packages/core/src/ports/PlatformService.test.ts`
- Test: `packages/core/src/adapters/LocalPlatform.test.ts`

- [ ] **Step 1: Write failing test for PlatformService port**

Create `packages/core/src/ports/PlatformService.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { PlatformService } from "./PlatformService"
import type { Platform } from "../config/ConfigTypes"

describe("PlatformService", () => {
  test("can detect OS and available toolchains", () => {
    const testPlatform = Layer.succeed(PlatformService, {
      os: () => Effect.succeed("darwin" as const),
      availableToolchains: () => Effect.succeed(["xcode"] as const),
      supports: (platform: Platform) => Effect.succeed(platform === "ios"),
    })

    const program = Effect.gen(function* () {
      const platform = yield* PlatformService
      const os = yield* platform.os()
      return os
    })

    const result = Effect.runSync(Effect.provide(program, testPlatform))
    expect(result).toBe("darwin")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/ports/PlatformService.test.ts`
Expected: FAIL — `PlatformService` module not found.

- [ ] **Step 3: Implement PlatformService port**

Create `packages/core/src/ports/PlatformService.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/core/src/ports/PlatformService.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for LocalPlatform adapter**

Create `packages/core/src/adapters/LocalPlatform.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { PlatformService } from "../ports/PlatformService"
import { LocalPlatformLive } from "./LocalPlatform"

describe("LocalPlatform", () => {
  test("os returns the current platform", async () => {
    const program = Effect.gen(function* () {
      const platform = yield* PlatformService
      return yield* platform.os()
    })

    const result = await Effect.runPromise(Effect.provide(program, LocalPlatformLive))
    expect(["darwin", "linux", "win32"]).toContain(result)
  })

  test("availableToolchains returns an array", async () => {
    const program = Effect.gen(function* () {
      const platform = yield* PlatformService
      return yield* platform.availableToolchains()
    })

    const result = await Effect.runPromise(Effect.provide(program, LocalPlatformLive))
    expect(Array.isArray(result)).toBe(true)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test packages/core/src/adapters/LocalPlatform.test.ts`
Expected: FAIL — `LocalPlatform` module not found.

- [ ] **Step 7: Implement LocalPlatform adapter**

Create `packages/core/src/adapters/LocalPlatform.ts`:

```typescript
import { Effect, Layer } from "effect"
import { PlatformService, type OS, type Toolchain } from "../ports/PlatformService"
import type { Platform } from "../config/ConfigTypes"

function detectToolchains(): Toolchain[] {
  const toolchains: Toolchain[] = []
  try {
    Bun.spawnSync(["xcodebuild", "-version"])
    toolchains.push("xcode")
  } catch {}
  try {
    const home = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
    if (home) toolchains.push("android-sdk")
  } catch {}
  try {
    Bun.spawnSync(["gradle", "--version"])
    toolchains.push("gradle")
  } catch {}
  return toolchains
}

export const LocalPlatformLive = Layer.succeed(PlatformService, {
  os: () => Effect.succeed(process.platform as OS),

  availableToolchains: () => Effect.sync(() => detectToolchains()),

  supports: (platform: Platform) =>
    Effect.sync(() => {
      if (platform === "ios") return process.platform === "darwin"
      if (platform === "android") return true
      return false
    }),
})
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test packages/core/src/adapters/LocalPlatform.test.ts`
Expected: PASS (both tests)

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/ports/PlatformService.ts packages/core/src/ports/PlatformService.test.ts packages/core/src/adapters/LocalPlatform.ts packages/core/src/adapters/LocalPlatform.test.ts
git commit -m "feat(core): add PlatformService port and LocalPlatform adapter"
```

---

### Task 5: ArtifactService (Port + Adapter)

**Files:**
- Create: `packages/core/src/ports/ArtifactService.ts`
- Create: `packages/core/src/adapters/MemoryArtifactStore.ts`
- Test: `packages/core/src/ports/ArtifactService.test.ts`
- Test: `packages/core/src/adapters/MemoryArtifactStore.test.ts`

- [ ] **Step 1: Write failing test for ArtifactService port**

Create `packages/core/src/ports/ArtifactService.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { ArtifactService, type Artifact } from "./ArtifactService"

describe("ArtifactService", () => {
  test("can store and retrieve artifacts", () => {
    const store = new Map<string, Artifact>()
    const testArtifacts = Layer.succeed(ArtifactService, {
      put: (key: string, artifact: Artifact) =>
        Effect.sync(() => {
          store.set(key, artifact)
        }),
      get: (key: string) =>
        Effect.sync(() => store.get(key)),
      list: () =>
        Effect.sync(() => Array.from(store.keys())),
    })

    const program = Effect.gen(function* () {
      const artifacts = yield* ArtifactService
      yield* artifacts.put("build", { type: "file", path: "/tmp/app.ipa" })
      const retrieved = yield* artifacts.get("build")
      return retrieved
    })

    const result = Effect.runSync(Effect.provide(program, testArtifacts))
    expect(result).toEqual({ type: "file", path: "/tmp/app.ipa" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/ports/ArtifactService.test.ts`
Expected: FAIL — `ArtifactService` module not found.

- [ ] **Step 3: Implement ArtifactService port**

Create `packages/core/src/ports/ArtifactService.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/core/src/ports/ArtifactService.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for MemoryArtifactStore**

Create `packages/core/src/adapters/MemoryArtifactStore.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { ArtifactService } from "../ports/ArtifactService"
import { MemoryArtifactStoreLive } from "./MemoryArtifactStore"

describe("MemoryArtifactStore", () => {
  test("stores and retrieves artifacts", async () => {
    const program = Effect.gen(function* () {
      const artifacts = yield* ArtifactService
      yield* artifacts.put("ipa", { type: "file", path: "/tmp/app.ipa" })
      yield* artifacts.put("apk", { type: "file", path: "/tmp/app.apk" })
      const ipa = yield* artifacts.get("ipa")
      const keys = yield* artifacts.list()
      return { ipa, keys }
    })

    const result = await Effect.runPromise(
      Effect.provide(program, MemoryArtifactStoreLive)
    )
    expect(result.ipa).toEqual({ type: "file", path: "/tmp/app.ipa" })
    expect(result.keys).toEqual(["ipa", "apk"])
  })

  test("get returns undefined for missing key", async () => {
    const program = Effect.gen(function* () {
      const artifacts = yield* ArtifactService
      return yield* artifacts.get("nonexistent")
    })

    const result = await Effect.runPromise(
      Effect.provide(program, MemoryArtifactStoreLive)
    )
    expect(result).toBeUndefined()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test packages/core/src/adapters/MemoryArtifactStore.test.ts`
Expected: FAIL — `MemoryArtifactStore` module not found.

- [ ] **Step 7: Implement MemoryArtifactStore adapter**

Create `packages/core/src/adapters/MemoryArtifactStore.ts`:

```typescript
import { Effect, Layer } from "effect"
import { ArtifactService, type Artifact } from "../ports/ArtifactService"

export const MemoryArtifactStoreLive = Layer.effect(
  ArtifactService,
  Effect.sync(() => {
    const store = new Map<string, Artifact>()
    return {
      put: (key: string, artifact: Artifact) =>
        Effect.sync(() => {
          store.set(key, artifact)
        }),
      get: (key: string) =>
        Effect.sync(() => store.get(key)),
      list: () =>
        Effect.sync(() => Array.from(store.keys())),
    }
  })
)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test packages/core/src/adapters/MemoryArtifactStore.test.ts`
Expected: PASS (both tests)

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/ports/ArtifactService.ts packages/core/src/ports/ArtifactService.test.ts packages/core/src/adapters/MemoryArtifactStore.ts packages/core/src/adapters/MemoryArtifactStore.test.ts
git commit -m "feat(core): add ArtifactService port and MemoryArtifactStore adapter"
```

---

### Task 6: Step Contract (defineStep + defineEffectStep)

**Files:**
- Create: `packages/core/src/step-loader/StepContract.ts`
- Test: `packages/core/src/step-loader/StepContract.test.ts`

- [ ] **Step 1: Write failing test for defineStep (simple path)**

Create `packages/core/src/step-loader/StepContract.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { defineStep, defineEffectStep, type ResolvedStep } from "./StepContract"
import { LoggerService } from "../ports/LoggerService"
import { ConfigService } from "../ports/ConfigService"
import { PlatformService } from "../ports/PlatformService"
import { ArtifactService } from "../ports/ArtifactService"

describe("defineStep", () => {
  test("creates a valid step from async function", () => {
    const step = defineStep({
      name: "greet",
      run: async (opts, ctx) => {
        return { message: "hello" }
      },
    })

    expect(step.name).toBe("greet")
    expect(step.dependsOnSteps).toEqual([])
    expect(step._tag).toBe("simple")
  })

  test("preserves dependsOnSteps", () => {
    const step = defineStep({
      name: "build",
      dependsOnSteps: ["sign"],
      run: async (opts, ctx) => {
        return {}
      },
    })

    expect(step.dependsOnSteps).toEqual(["sign"])
  })

  test("run function executes correctly", async () => {
    const step = defineStep({
      name: "greet",
      run: async (opts: { name: string }, _ctx) => {
        return { greeting: `hello ${opts.name}` }
      },
    })

    const result = await step.execute({ name: "world" }, {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      config: { env: () => undefined, secret: () => undefined },
      platform: { os: () => "darwin", availableToolchains: () => [], supports: () => true },
      artifacts: { put: () => {}, get: () => undefined, list: () => [] },
    } as any)

    expect(result).toEqual({ greeting: "hello world" })
  })
})

describe("defineEffectStep", () => {
  test("creates a valid step from Effect layer", () => {
    const step = defineEffectStep({
      name: "greet-effect",
      dependsOnSteps: ["sign"],
      run: (opts: Record<string, unknown>) =>
        Effect.gen(function* () {
          const logger = yield* LoggerService
          yield* logger.info("hello from effect step")
          return { message: "done" }
        }),
    })

    expect(step.name).toBe("greet-effect")
    expect(step.dependsOnSteps).toEqual(["sign"])
    expect(step._tag).toBe("effect")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/step-loader/StepContract.test.ts`
Expected: FAIL — `StepContract` module not found.

- [ ] **Step 3: Implement StepContract**

Create `packages/core/src/step-loader/StepContract.ts`:

```typescript
import { Effect } from "effect"

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
  readonly run: (opts: TOpts, ctx: StepContext) => Promise<Record<string, unknown>>
}

export interface EffectStepDef<TOpts = Record<string, unknown>> {
  readonly name: string
  readonly dependsOnSteps?: ReadonlyArray<string>
  readonly run: (opts: TOpts) => Effect.Effect<Record<string, unknown>, unknown, unknown>
}

export interface ResolvedSimpleStep {
  readonly _tag: "simple"
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
  readonly execute: (opts: Record<string, unknown>, ctx: StepContext) => Promise<Record<string, unknown>>
}

export interface ResolvedEffectStep {
  readonly _tag: "effect"
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
  readonly run: (opts: Record<string, unknown>) => Effect.Effect<Record<string, unknown>, unknown, unknown>
}

export type ResolvedStep = ResolvedSimpleStep | ResolvedEffectStep

export function defineStep<TOpts = Record<string, unknown>>(
  def: SimpleStepDef<TOpts>
): ResolvedSimpleStep {
  return {
    _tag: "simple",
    name: def.name,
    dependsOnSteps: def.dependsOnSteps ?? [],
    execute: (opts, ctx) => def.run(opts as TOpts, ctx),
  }
}

export function defineEffectStep<TOpts = Record<string, unknown>>(
  def: EffectStepDef<TOpts>
): ResolvedEffectStep {
  return {
    _tag: "effect",
    name: def.name,
    dependsOnSteps: def.dependsOnSteps ?? [],
    run: (opts) => def.run(opts as TOpts),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/src/step-loader/StepContract.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/step-loader/StepContract.ts packages/core/src/step-loader/StepContract.test.ts
git commit -m "feat(core): add step contract with defineStep and defineEffectStep"
```

---

### Task 7: Step Name Resolver (Scoping + Collision Detection)

**Files:**
- Create: `packages/core/src/step-loader/StepNameResolver.ts`
- Test: `packages/core/src/step-loader/StepNameResolver.test.ts`

- [ ] **Step 1: Write failing tests for StepNameResolver**

Create `packages/core/src/step-loader/StepNameResolver.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import {
  resolveShortName,
  detectCollisions,
  type StepRegistration,
} from "./StepNameResolver"

describe("resolveShortName", () => {
  test("@zl/step-build resolves to short name 'build'", () => {
    expect(resolveShortName("@zl/step-build")).toBe("build")
  })

  test("@zl/step-build-ios resolves to 'build-ios'", () => {
    expect(resolveShortName("@zl/step-build-ios")).toBe("build-ios")
  })

  test("@acme/zl-step-screenshot resolves to 'acme/screenshot'", () => {
    expect(resolveShortName("@acme/zl-step-screenshot")).toBe("acme/screenshot")
  })

  test("plain name passes through", () => {
    expect(resolveShortName("hello")).toBe("hello")
  })
})

describe("detectCollisions", () => {
  test("no collision for unique names", () => {
    const steps: StepRegistration[] = [
      { packageName: "@zl/step-build", shortName: "build" },
      { packageName: "@zl/step-sign", shortName: "sign" },
    ]
    const result = detectCollisions(steps)
    expect(result).toEqual([])
  })

  test("detects collision when two steps share a short name", () => {
    const steps: StepRegistration[] = [
      { packageName: "@zl/step-build", shortName: "build" },
      { packageName: "@acme/zl-step-build", shortName: "build" },
    ]
    const result = detectCollisions(steps)
    expect(result.length).toBe(1)
    expect(result[0].shortName).toBe("build")
    expect(result[0].packages).toEqual([
      "@zl/step-build",
      "@acme/zl-step-build",
    ])
  })

  test("@zl scoped steps take priority", () => {
    const steps: StepRegistration[] = [
      { packageName: "@zl/step-build", shortName: "build", isOfficial: true },
      { packageName: "@acme/zl-step-build", shortName: "build", isOfficial: false },
    ]
    const result = detectCollisions(steps)
    expect(result.length).toBe(1)
    expect(result[0].resolution).toBe(
      "Use 'build' for @zl/step-build (official) and 'acme/build' for @acme/zl-step-build"
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/step-loader/StepNameResolver.test.ts`
Expected: FAIL — `StepNameResolver` module not found.

- [ ] **Step 3: Implement StepNameResolver**

Create `packages/core/src/step-loader/StepNameResolver.ts`:

```typescript
export interface StepRegistration {
  readonly packageName: string
  readonly shortName: string
  readonly isOfficial?: boolean
}

export interface Collision {
  readonly shortName: string
  readonly packages: ReadonlyArray<string>
  readonly resolution: string
}

export function resolveShortName(packageName: string): string {
  // @zl/step-build → build
  const zlMatch = packageName.match(/^@zl\/step-(.+)$/)
  if (zlMatch) return zlMatch[1]

  // @acme/zl-step-screenshot → acme/screenshot
  const thirdPartyMatch = packageName.match(/^@(.+)\/zl-step-(.+)$/)
  if (thirdPartyMatch) return `${thirdPartyMatch[1]}/${thirdPartyMatch[2]}`

  // Plain name (e.g. local step)
  return packageName
}

export function detectCollisions(
  steps: ReadonlyArray<StepRegistration>
): ReadonlyArray<Collision> {
  const byShortName = new Map<string, StepRegistration[]>()

  for (const step of steps) {
    const existing = byShortName.get(step.shortName) ?? []
    existing.push(step)
    byShortName.set(step.shortName, existing)
  }

  const collisions: Collision[] = []

  for (const [shortName, registrations] of byShortName) {
    if (registrations.length <= 1) continue

    const official = registrations.find((r) => r.isOfficial)
    const others = registrations.filter((r) => !r.isOfficial)

    let resolution: string
    if (official) {
      const otherNames = others
        .map((r) => {
          const scoped = resolveShortName(r.packageName)
          return `'${scoped}' for ${r.packageName}`
        })
        .join(" and ")
      resolution = `Use '${shortName}' for ${official.packageName} (official) and ${otherNames}`
    } else {
      const allNames = registrations
        .map((r) => `'${resolveShortName(r.packageName)}' for ${r.packageName}`)
        .join(" and ")
      resolution = `Ambiguous '${shortName}'. Use scoped names: ${allNames}`
    }

    collisions.push({
      shortName,
      packages: registrations.map((r) => r.packageName),
      resolution,
    })
  }

  return collisions
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/src/step-loader/StepNameResolver.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/step-loader/StepNameResolver.ts packages/core/src/step-loader/StepNameResolver.test.ts
git commit -m "feat(core): add step name resolver with scoping and collision detection"
```

---

### Task 8: Step Loader

**Files:**
- Create: `packages/core/src/step-loader/StepLoader.ts`
- Test: `packages/core/src/step-loader/StepLoader.test.ts`

- [ ] **Step 1: Write failing test for StepLoader**

Create `packages/core/src/step-loader/StepLoader.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { loadSteps, validateStep, type LoadedStep } from "./StepLoader"
import { defineStep } from "./StepContract"

describe("validateStep", () => {
  test("accepts a valid simple step", () => {
    const step = defineStep({
      name: "hello",
      run: async () => ({ message: "hi" }),
    })
    const result = validateStep(step)
    expect(result.valid).toBe(true)
  })

  test("rejects step without name", () => {
    const step = { _tag: "simple", dependsOnSteps: [], execute: async () => ({}) } as any
    const result = validateStep(step)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("name")
  })

  test("rejects step without run/execute", () => {
    const step = { _tag: "simple", name: "broken", dependsOnSteps: [] } as any
    const result = validateStep(step)
    expect(result.valid).toBe(false)
  })
})

describe("loadSteps", () => {
  test("loads steps from an array of resolved steps", () => {
    const step1 = defineStep({ name: "hello", run: async () => ({}) })
    const step2 = defineStep({ name: "world", dependsOnSteps: ["hello"], run: async () => ({}) })

    const result = loadSteps([step1, step2])

    expect(result.steps.length).toBe(2)
    expect(result.errors.length).toBe(0)
    expect(result.steps[0].name).toBe("hello")
    expect(result.steps[1].name).toBe("world")
  })

  test("returns errors for invalid steps", () => {
    const valid = defineStep({ name: "hello", run: async () => ({}) })
    const invalid = { name: "" } as any

    const result = loadSteps([valid, invalid])

    expect(result.steps.length).toBe(1)
    expect(result.errors.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/step-loader/StepLoader.test.ts`
Expected: FAIL — `StepLoader` module not found.

- [ ] **Step 3: Implement StepLoader**

Create `packages/core/src/step-loader/StepLoader.ts`:

```typescript
import type { ResolvedStep } from "./StepContract"

export interface ValidationResult {
  readonly valid: boolean
  readonly error?: string
}

export interface LoadResult {
  readonly steps: ReadonlyArray<ResolvedStep>
  readonly errors: ReadonlyArray<string>
}

export function validateStep(step: unknown): ValidationResult {
  if (!step || typeof step !== "object") {
    return { valid: false, error: "Step must be an object" }
  }

  const s = step as Record<string, unknown>

  if (!s.name || typeof s.name !== "string") {
    return { valid: false, error: "Step must have a non-empty 'name' string" }
  }

  if (s._tag === "simple" && typeof s.execute !== "function") {
    return { valid: false, error: `Step '${s.name}' is a simple step but has no 'execute' function` }
  }

  if (s._tag === "effect" && typeof s.run !== "function") {
    return { valid: false, error: `Step '${s.name}' is an effect step but has no 'run' function` }
  }

  if (!s._tag) {
    return { valid: false, error: `Step '${s.name}' has no _tag (use defineStep or defineEffectStep)` }
  }

  return { valid: true }
}

export function loadSteps(
  rawSteps: ReadonlyArray<unknown>
): LoadResult {
  const steps: ResolvedStep[] = []
  const errors: string[] = []

  for (const raw of rawSteps) {
    const validation = validateStep(raw)
    if (validation.valid) {
      steps.push(raw as ResolvedStep)
    } else {
      errors.push(validation.error!)
    }
  }

  return { steps, errors }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/src/step-loader/StepLoader.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/step-loader/StepLoader.ts packages/core/src/step-loader/StepLoader.test.ts
git commit -m "feat(core): add step loader with validation"
```

---

### Task 9: Dependency Graph (Topological Sort)

**Files:**
- Create: `packages/core/src/engine/DependencyGraph.ts`
- Test: `packages/core/src/engine/DependencyGraph.test.ts`

- [ ] **Step 1: Write failing tests for DependencyGraph**

Create `packages/core/src/engine/DependencyGraph.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { buildExecutionOrder, CyclicDependencyError } from "./DependencyGraph"

describe("buildExecutionOrder", () => {
  test("returns steps in dependency order", () => {
    const steps = [
      { name: "deploy", dependsOnSteps: ["build"] },
      { name: "build", dependsOnSteps: ["sign"] },
      { name: "sign", dependsOnSteps: [] },
      { name: "test", dependsOnSteps: [] },
    ]

    const order = buildExecutionOrder(steps, ["test", "sign", "build", "deploy"])

    const signIdx = order.indexOf("sign")
    const buildIdx = order.indexOf("build")
    const deployIdx = order.indexOf("deploy")

    expect(signIdx).toBeLessThan(buildIdx)
    expect(buildIdx).toBeLessThan(deployIdx)
  })

  test("filters to only workflow steps", () => {
    const steps = [
      { name: "build", dependsOnSteps: [] },
      { name: "test", dependsOnSteps: [] },
      { name: "deploy", dependsOnSteps: [] },
    ]

    const order = buildExecutionOrder(steps, ["test", "build"])
    expect(order).toHaveLength(2)
    expect(order).toContain("test")
    expect(order).toContain("build")
    expect(order).not.toContain("deploy")
  })

  test("throws on cyclic dependency", () => {
    const steps = [
      { name: "a", dependsOnSteps: ["b"] },
      { name: "b", dependsOnSteps: ["a"] },
    ]

    expect(() => buildExecutionOrder(steps, ["a", "b"])).toThrow(CyclicDependencyError)
  })

  test("throws on missing step reference in workflow", () => {
    const steps = [{ name: "build", dependsOnSteps: [] }]

    expect(() => buildExecutionOrder(steps, ["build", "nonexistent"])).toThrow(
      /not found/
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/engine/DependencyGraph.test.ts`
Expected: FAIL — `DependencyGraph` module not found.

- [ ] **Step 3: Implement DependencyGraph**

Create `packages/core/src/engine/DependencyGraph.ts`:

```typescript
export class CyclicDependencyError extends Error {
  constructor(readonly cycle: ReadonlyArray<string>) {
    super(`Cyclic dependency detected: ${cycle.join(" → ")}`)
    this.name = "CyclicDependencyError"
  }
}

export class StepNotFoundError extends Error {
  constructor(readonly stepName: string) {
    super(`Step '${stepName}' not found in loaded steps`)
    this.name = "StepNotFoundError"
  }
}

interface StepNode {
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
}

export function buildExecutionOrder(
  allSteps: ReadonlyArray<StepNode>,
  workflowSteps: ReadonlyArray<string>
): ReadonlyArray<string> {
  const stepMap = new Map<string, StepNode>()
  for (const step of allSteps) {
    stepMap.set(step.name, step)
  }

  // Validate all workflow steps exist
  for (const name of workflowSteps) {
    if (!stepMap.has(name)) {
      throw new StepNotFoundError(name)
    }
  }

  const workflowSet = new Set(workflowSteps)
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const order: string[] = []

  function visit(name: string, path: string[]) {
    if (visited.has(name)) return
    if (visiting.has(name)) {
      throw new CyclicDependencyError([...path, name])
    }

    visiting.add(name)
    const step = stepMap.get(name)
    if (step) {
      for (const dep of step.dependsOnSteps) {
        if (workflowSet.has(dep)) {
          visit(dep, [...path, name])
        }
      }
    }
    visiting.delete(name)
    visited.add(name)
    order.push(name)
  }

  for (const name of workflowSteps) {
    visit(name, [])
  }

  return order
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/src/engine/DependencyGraph.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/DependencyGraph.ts packages/core/src/engine/DependencyGraph.test.ts
git commit -m "feat(core): add dependency graph with topological sort"
```

---

### Task 10: Config Loader

**Files:**
- Create: `packages/core/src/config/ConfigLoader.ts`
- Test: `packages/core/src/config/ConfigLoader.test.ts`

- [ ] **Step 1: Write failing test for ConfigLoader**

Create `packages/core/src/config/ConfigLoader.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { loadConfig, ConfigFileNotFoundError } from "./ConfigLoader"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"

describe("loadConfig", () => {
  const tmpDir = join(import.meta.dir, "__test_tmp_config__")

  test("loads and validates a zl.config.ts file", async () => {
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, "zl.config.ts"),
      `export default {
        app: { name: "TestApp", bundleId: "com.test.app" },
        platforms: {
          ios: { steps: [] },
        },
        workflows: { ci: ["test"] },
      }`
    )

    const config = await loadConfig(tmpDir)

    expect(config.app.name).toBe("TestApp")
    expect(config.workflows.ci).toEqual(["test"])

    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("throws ConfigFileNotFoundError for missing config", async () => {
    expect(loadConfig("/nonexistent/path")).rejects.toThrow(ConfigFileNotFoundError)
  })

  test("throws on invalid config (missing app)", async () => {
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, "zl.config.ts"),
      `export default { workflows: {} }`
    )

    expect(loadConfig(tmpDir)).rejects.toThrow(/app/)

    rmSync(tmpDir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/config/ConfigLoader.test.ts`
Expected: FAIL — `ConfigLoader` module not found.

- [ ] **Step 3: Implement ConfigLoader**

Create `packages/core/src/config/ConfigLoader.ts`:

```typescript
import { join } from "path"
import { existsSync } from "fs"
import type { ZlConfig } from "./ConfigTypes"

export class ConfigFileNotFoundError extends Error {
  constructor(readonly dir: string) {
    super(`No zl.config.ts found in ${dir}`)
    this.name = "ConfigFileNotFoundError"
  }
}

export class ConfigValidationError extends Error {
  constructor(readonly issues: ReadonlyArray<string>) {
    super(`Invalid config: ${issues.join(", ")}`)
    this.name = "ConfigValidationError"
  }
}

function validateConfig(raw: unknown): ZlConfig {
  const issues: string[] = []

  if (!raw || typeof raw !== "object") {
    throw new ConfigValidationError(["Config must be an object"])
  }

  const config = raw as Record<string, unknown>

  if (!config.app || typeof config.app !== "object") {
    issues.push("Missing 'app' configuration")
  } else {
    const app = config.app as Record<string, unknown>
    if (!app.name) issues.push("Missing 'app.name'")
    if (!app.bundleId) issues.push("Missing 'app.bundleId'")
  }

  if (!config.workflows || typeof config.workflows !== "object") {
    issues.push("Missing 'workflows' configuration")
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues)
  }

  return config as unknown as ZlConfig
}

export async function loadConfig(projectDir: string): Promise<ZlConfig> {
  const configPath = join(projectDir, "zl.config.ts")

  if (!existsSync(configPath)) {
    throw new ConfigFileNotFoundError(projectDir)
  }

  const mod = await import(configPath)
  const raw = mod.default ?? mod

  return validateConfig(raw)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/src/config/ConfigLoader.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/ConfigLoader.ts packages/core/src/config/ConfigLoader.test.ts
git commit -m "feat(core): add config loader with validation"
```

---

### Task 11: Pipeline Engine

**Files:**
- Create: `packages/core/src/engine/Pipeline.ts`
- Test: `packages/core/src/engine/Pipeline.test.ts`

- [ ] **Step 1: Write failing tests for Pipeline**

Create `packages/core/src/engine/Pipeline.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Pipeline, type StepResult } from "./Pipeline"
import { defineStep } from "../step-loader/StepContract"
import { LoggerService } from "../ports/LoggerService"
import { ConsoleLoggerLive } from "../adapters/ConsoleLogger"
import { MemoryArtifactStoreLive } from "../adapters/MemoryArtifactStore"
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/src/engine/Pipeline.test.ts`
Expected: FAIL — `Pipeline` module not found.

- [ ] **Step 3: Implement Pipeline**

Create `packages/core/src/engine/Pipeline.ts`:

```typescript
import { buildExecutionOrder } from "./DependencyGraph"
import type { ResolvedStep, StepContext } from "../step-loader/StepContract"

export interface StepResult {
  readonly name: string
  readonly status: "pass" | "fail" | "skipped"
  readonly durationMs: number
  readonly error?: string
  readonly output?: Record<string, unknown>
}

export interface PipelineConfig {
  readonly steps: ReadonlyArray<ResolvedStep>
  readonly workflow: ReadonlyArray<string>
  readonly context?: Partial<StepContext>
}

function makeDefaultContext(overrides?: Partial<StepContext>): StepContext {
  return {
    logger: {
      info: (msg) => console.log(`[INFO] ${msg}`),
      warn: (msg) => console.warn(`[WARN] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`),
      debug: () => {},
    },
    config: {
      env: (key) => process.env[key],
      secret: () => undefined,
    },
    platform: {
      os: () => process.platform,
      availableToolchains: () => [],
      supports: () => true,
    },
    artifacts: {
      put: () => {},
      get: () => undefined,
      list: () => [],
    },
    ...overrides,
  }
}

export class Pipeline {
  private readonly steps: ReadonlyArray<ResolvedStep>
  private readonly workflow: ReadonlyArray<string>
  private readonly context: StepContext

  constructor(config: PipelineConfig) {
    this.steps = config.steps
    this.workflow = config.workflow
    this.context = makeDefaultContext(config.context)
  }

  async execute(): Promise<ReadonlyArray<StepResult>> {
    const executionOrder = buildExecutionOrder(this.steps, this.workflow)
    const stepMap = new Map<string, ResolvedStep>()
    for (const step of this.steps) {
      stepMap.set(step.name, step)
    }

    const results: StepResult[] = []

    for (const name of executionOrder) {
      const step = stepMap.get(name)!
      const start = performance.now()

      try {
        let output: Record<string, unknown>
        if (step._tag === "simple") {
          output = await step.execute({}, this.context)
        } else {
          const { Effect } = await import("effect")
          output = await Effect.runPromise(step.run({}))
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
          error: err instanceof Error ? err.message : String(err),
        })
        // Skip remaining steps that depend on this one
        break
      }
    }

    // Mark remaining unexecuted steps as skipped
    const executed = new Set(results.map((r) => r.name))
    for (const name of executionOrder) {
      if (!executed.has(name)) {
        results.push({ name, status: "skipped", durationMs: 0 })
      }
    }

    return results
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/src/engine/Pipeline.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/Pipeline.ts packages/core/src/engine/Pipeline.test.ts
git commit -m "feat(core): add pipeline engine with step execution and failure handling"
```

---

### Task 12: Core Public API (index.ts + ports/index.ts)

**Files:**
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/ports/index.ts`

- [ ] **Step 1: Create ports barrel export**

Create `packages/core/src/ports/index.ts`:

```typescript
export { LoggerService, type ILoggerService } from "./LoggerService"
export { ConfigService, type IConfigService, ConfigLoadError, SecretNotFoundError } from "./ConfigService"
export { PlatformService, type IPlatformService, type OS, type Toolchain } from "./PlatformService"
export { ArtifactService, type IArtifactService, type Artifact } from "./ArtifactService"
```

- [ ] **Step 2: Create main barrel export**

Create `packages/core/src/index.ts`:

```typescript
// Step contract
export { defineStep, defineEffectStep, type StepContext, type ResolvedStep } from "./step-loader/StepContract"
export { loadSteps } from "./step-loader/StepLoader"
export { resolveShortName, detectCollisions } from "./step-loader/StepNameResolver"

// Config
export { defineConfig, type ZlConfig, type Platform, type StepInstance } from "./config/ConfigTypes"
export { loadConfig, ConfigFileNotFoundError, ConfigValidationError } from "./config/ConfigLoader"

// Engine
export { Pipeline, type StepResult, type PipelineConfig } from "./engine/Pipeline"
export { buildExecutionOrder, CyclicDependencyError } from "./engine/DependencyGraph"

// Ports (re-export from subpath)
export { LoggerService, ConfigService, PlatformService, ArtifactService } from "./ports/index"

// Adapters
export { ConsoleLoggerLive } from "./adapters/ConsoleLogger"
export { makeFileConfigLayer } from "./adapters/FileConfig"
export { LocalPlatformLive } from "./adapters/LocalPlatform"
export { MemoryArtifactStoreLive } from "./adapters/MemoryArtifactStore"
```

- [ ] **Step 3: Verify the exports resolve**

Run: `bun -e "import('@zl/core').then(m => console.log(Object.keys(m).sort().join(', ')))"`
Expected: Lists all exported names without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/ports/index.ts
git commit -m "feat(core): add public API barrel exports"
```

---

### Task 13: Example Step (@zl/step-hello)

**Files:**
- Create: `packages/steps/hello/hello/src/index.ts`
- Test: `packages/steps/hello/hello/src/index.test.ts`

- [ ] **Step 1: Write failing test for the hello step**

Create `packages/steps/hello/hello/src/index.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import helloStep from "./index"

describe("@zl/step-hello", () => {
  test("has correct name", () => {
    expect(helloStep.name).toBe("hello")
  })

  test("has no dependencies", () => {
    expect(helloStep.dependsOnSteps).toEqual([])
  })

  test("run returns a greeting", async () => {
    const ctx = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      config: { env: () => undefined, secret: () => undefined },
      platform: { os: () => "darwin", availableToolchains: () => [], supports: () => true },
      artifacts: { put: () => {}, get: () => undefined, list: () => [] },
    } as any

    const result = await helloStep.execute({ name: "world" }, ctx)
    expect(result).toEqual({ greeting: "Hello, world!" })
  })

  test("defaults name to 'zero-line'", async () => {
    const ctx = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      config: { env: () => undefined, secret: () => undefined },
      platform: { os: () => "darwin", availableToolchains: () => [], supports: () => true },
      artifacts: { put: () => {}, get: () => undefined, list: () => [] },
    } as any

    const result = await helloStep.execute({}, ctx)
    expect(result).toEqual({ greeting: "Hello, zero-line!" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/steps/hello/hello/src/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hello step**

Create `packages/steps/hello/hello/src/index.ts`:

```typescript
import { defineStep } from "@zl/core"

export default defineStep({
  name: "hello",
  run: async (opts: { name?: string }, ctx) => {
    const name = opts.name ?? "zero-line"
    ctx.logger.info(`Hello, ${name}!`)
    return { greeting: `Hello, ${name}!` }
  },
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/steps/hello/hello/src/index.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/steps/hello/hello/src/
git commit -m "feat(steps): add @zl/step-hello example step"
```

---

### Task 14: CLI — Entry Point + Run Command

**Files:**
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/run.ts`
- Create: `packages/cli/src/output/Renderer.ts`
- Test: `packages/cli/src/commands/run.test.ts`

- [ ] **Step 1: Implement the Renderer (output formatting)**

Create `packages/cli/src/output/Renderer.ts`:

```typescript
import type { StepResult } from "@zl/core"

const PASS = "\x1b[32m✓\x1b[0m"
const FAIL = "\x1b[31m✗\x1b[0m"
const SKIP = "\x1b[33m○\x1b[0m"

export function renderStepResult(result: StepResult): string {
  const icon = result.status === "pass" ? PASS : result.status === "fail" ? FAIL : SKIP
  const duration = result.durationMs > 0 ? ` (${result.durationMs}ms)` : ""
  const error = result.error ? `\n    Error: ${result.error}` : ""
  return `  ${icon} ${result.name}${duration}${error}`
}

export function renderResults(results: ReadonlyArray<StepResult>): string {
  const lines = results.map(renderStepResult)
  const passed = results.filter((r) => r.status === "pass").length
  const failed = results.filter((r) => r.status === "fail").length
  const skipped = results.filter((r) => r.status === "skipped").length

  lines.push("")
  lines.push(`  ${passed} passed, ${failed} failed, ${skipped} skipped`)

  return lines.join("\n")
}
```

- [ ] **Step 2: Implement the run command**

Create `packages/cli/src/commands/run.ts`:

```typescript
import { loadConfig } from "@zl/core"
import { Pipeline } from "@zl/core"
import type { ResolvedStep } from "@zl/core"
import { renderResults } from "../output/Renderer"

export interface RunOptions {
  readonly workflowName: string
  readonly projectDir: string
  readonly platform?: "ios" | "android"
  readonly verbose?: boolean
  readonly steps: ReadonlyArray<ResolvedStep>
}

export async function runWorkflow(options: RunOptions): Promise<boolean> {
  const config = await loadConfig(options.projectDir)

  const workflow = config.workflows[options.workflowName]
  if (!workflow) {
    console.error(`Workflow '${options.workflowName}' not found.`)
    console.error(`Available workflows: ${Object.keys(config.workflows).join(", ")}`)
    return false
  }

  console.log(`\nRunning workflow: ${options.workflowName}\n`)

  const pipeline = new Pipeline({
    steps: options.steps,
    workflow,
  })

  const results = await pipeline.execute()

  console.log(renderResults(results))

  return results.every((r) => r.status !== "fail")
}
```

- [ ] **Step 3: Implement CLI entry point**

Create `packages/cli/src/index.ts`:

```typescript
#!/usr/bin/env bun
import { loadConfig, loadSteps } from "@zl/core"
import { runWorkflow } from "./commands/run"

const args = process.argv.slice(2)
const command = args[0]

if (!command || command === "--help" || command === "-h") {
  console.log(`
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
  --verbose                  Show debug output
`)
  process.exit(0)
}

const projectDir = process.cwd()
const platformFlag = args.indexOf("--platform")
const platform = platformFlag !== -1 ? (args[platformFlag + 1] as "ios" | "android") : undefined
const verbose = args.includes("--verbose")

async function main() {
  try {
    const workflowName = command === "run" ? args[1] : command

    if (!workflowName) {
      console.error("Please specify a workflow name. Run 'zl --help' for usage.")
      process.exit(1)
    }

    if (command === "list") {
      const config = await loadConfig(projectDir)
      console.log("\nWorkflows:")
      for (const [name, steps] of Object.entries(config.workflows)) {
        console.log(`  ${name}: ${(steps as string[]).join(" → ")}`)
      }
      process.exit(0)
    }

    // Load steps from config imports
    // For now, steps are loaded via the config file's imports
    const config = await loadConfig(projectDir)

    // Collect steps from platform configs and shared steps
    const allStepInstances = [
      ...(config.steps ?? []),
      ...(platform
        ? config.platforms[platform]?.steps ?? []
        : Object.values(config.platforms).flatMap((p) => p?.steps ?? [])),
    ]

    const success = await runWorkflow({
      workflowName,
      projectDir,
      platform,
      verbose,
      steps: allStepInstances as any,
    })

    process.exit(success ? 0 : 1)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main()
```

- [ ] **Step 4: Write test for run command**

Create `packages/cli/src/commands/run.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { renderResults } from "../output/Renderer"
import type { StepResult } from "@zl/core"

describe("Renderer", () => {
  test("renders passing results", () => {
    const results: StepResult[] = [
      { name: "test", status: "pass", durationMs: 120 },
      { name: "build", status: "pass", durationMs: 3400 },
    ]

    const output = renderResults(results)
    expect(output).toContain("test")
    expect(output).toContain("build")
    expect(output).toContain("2 passed, 0 failed, 0 skipped")
  })

  test("renders failures with error message", () => {
    const results: StepResult[] = [
      { name: "test", status: "fail", durationMs: 50, error: "Tests failed" },
      { name: "build", status: "skipped", durationMs: 0 },
    ]

    const output = renderResults(results)
    expect(output).toContain("Tests failed")
    expect(output).toContain("0 passed, 1 failed, 1 skipped")
  })
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/cli/src/commands/run.test.ts`
Expected: PASS (both tests)

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/
git commit -m "feat(cli): add CLI entry point, run command, and output renderer"
```

---

### Task 15: End-to-End Integration Test

**Files:**
- Test: `packages/cli/src/e2e.test.ts`

- [ ] **Step 1: Write E2E test that runs a full pipeline**

Create `packages/cli/src/e2e.test.ts`:

```typescript
import { describe, test, expect } from "bun:test"
import { Pipeline, defineStep } from "@zl/core"

describe("E2E: full pipeline execution", () => {
  test("runs a workflow with multiple steps end-to-end", async () => {
    const log: string[] = []

    const greet = defineStep({
      name: "greet",
      run: async (opts, ctx) => {
        log.push("greet")
        ctx.logger.info("Greeting!")
        return { message: "hello" }
      },
    })

    const shout = defineStep({
      name: "shout",
      dependsOnSteps: ["greet"],
      run: async (opts, ctx) => {
        log.push("shout")
        ctx.logger.info("SHOUTING!")
        return { message: "HELLO" }
      },
    })

    const pipeline = new Pipeline({
      steps: [greet, shout],
      workflow: ["greet", "shout"],
    })

    const results = await pipeline.execute()

    expect(log).toEqual(["greet", "shout"])
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ name: "greet", status: "pass" })
    expect(results[1]).toMatchObject({ name: "shout", status: "pass" })
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0)
    expect(results[1].durationMs).toBeGreaterThanOrEqual(0)
  })

  test("handles step failure gracefully", async () => {
    const boom = defineStep({
      name: "boom",
      run: async () => {
        throw new Error("kaboom")
      },
    })

    const after = defineStep({
      name: "after",
      dependsOnSteps: ["boom"],
      run: async () => ({ ok: true }),
    })

    const pipeline = new Pipeline({
      steps: [boom, after],
      workflow: ["boom", "after"],
    })

    const results = await pipeline.execute()

    expect(results[0]).toMatchObject({ name: "boom", status: "fail", error: "kaboom" })
    expect(results[1]).toMatchObject({ name: "after", status: "skipped" })
  })
})
```

- [ ] **Step 2: Run E2E test**

Run: `bun test packages/cli/src/e2e.test.ts`
Expected: PASS (both tests)

- [ ] **Step 3: Run ALL tests across the monorepo**

Run: `bun test --recursive packages/`
Expected: All tests pass (should be ~20+ tests total).

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/e2e.test.ts
git commit -m "test: add end-to-end pipeline integration tests"
```

---

### Task 16: Compiled Binary

**Files:**
- Modify: `packages/cli/package.json` (add build script)

- [ ] **Step 1: Add build script to CLI package.json**

Add to `packages/cli/package.json` scripts:

```json
{
  "scripts": {
    "build": "bun build src/index.ts --compile --outfile zl"
  }
}
```

- [ ] **Step 2: Build the binary**

Run: `cd packages/cli && bun run build`
Expected: Produces a `zl` binary in `packages/cli/`.

- [ ] **Step 3: Verify the binary runs**

Run: `./packages/cli/zl --help`
Expected: Shows the help text with usage info.

- [ ] **Step 4: Add zl binary to .gitignore**

Add to root `.gitignore`:
```
packages/cli/zl
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/package.json .gitignore
git commit -m "feat(cli): add bun build --compile for standalone zl binary"
```

---

### Task 17: Run Full Test Suite + Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `bun test --recursive packages/`
Expected: All tests pass.

- [ ] **Step 2: Verify binary compilation**

Run: `cd packages/cli && bun run build && ./zl --help`
Expected: Help text displays correctly.

- [ ] **Step 3: Type-check the entire project**

Run: `bunx tsc --noEmit -p packages/core/tsconfig.json && bunx tsc --noEmit -p packages/cli/tsconfig.json`
Expected: No type errors.

- [ ] **Step 4: Final commit with all green**

```bash
git add -A
git commit -m "chore: verify all tests pass and binary compiles"
```
