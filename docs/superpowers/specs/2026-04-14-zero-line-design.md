# zero-line (zl) — Design Specification

> A modern, TypeScript-native mobile CI/CD toolkit that replaces fastlane.
> Built with Bun, Effect.ts, and a step-based architecture.

## Overview

zero-line is a CLI tool (`zl`) for automating mobile app builds, signing, testing, and deployment. It replaces fastlane's Ruby-based ecosystem with TypeScript and the npm ecosystem. The core is a thin execution engine; all capabilities are delivered as **steps** — reusable, composable units of work.

### Goals

- Replace fastlane with a developer-friendly TypeScript alternative
- Small, domain-agnostic core extended by steps
- Leverage Bun for runtime performance and TypeScript-native execution
- Use npm ecosystem for step distribution
- Both platforms (iOS first, then Android for each feature)
- Open-source from day one, built for own team's needs first

### Vision

The core engine is deliberately domain-agnostic. While the initial focus is mobile CI/CD, the architecture (execution engine + step contract + workflows) can support any domain. Mobile is the first vertical — the architecture must not bake in mobile-specific assumptions.

---

## Architecture

### Hexagonal / Ports & Adapters

The core follows hexagonal architecture using Effect.ts:

- **Ports** — Effect `Service` definitions that declare capabilities (e.g. `BuildService`, `LoggerService`)
- **Adapters** — Effect `Layer` implementations provided by steps
- **Core** — never imports platform-specific code; all platform logic lives in steps

Effect.ts mapping:
- `Context.Tag` / `Service` = hexagonal port
- `Layer` = hexagonal adapter
- `Effect.gen` = orchestration within adapters

### Core Responsibilities

1. **Step loading** — resolve steps from `node_modules`, validate contracts, assemble Layer graph
2. **Pipeline execution** — run workflows as ordered step sequences with dependency resolution, parallelism, and error handling
3. **Shared services** — provide logging, config, platform detection, and artifact passing to all steps

---

## Monorepo Structure

```
zero-line/
├── packages/
│   ├── core/                    # Execution engine, step contract, shared services
│   │   ├── src/
│   │   │   ├── ports/           # Service interfaces (hexagonal ports)
│   │   │   ├── adapters/        # Default/built-in adapters
│   │   │   ├── engine/          # Pipeline execution, step resolution, parallelism
│   │   │   ├── step-loader/     # Step loader, validator, registry
│   │   │   ├── config/          # Config file loading (zl.config.ts)
│   │   │   └── index.ts         # Public API
│   │   └── package.json         # "@zl/core"
│   │
│   ├── cli/                     # CLI entry point (thin — delegates to core)
│   │   ├── src/
│   │   └── package.json         # "@zl/cli" → installs as `zl`
│   │
│   └── steps/                   # Official steps (federated, grouped by feature)
│       ├── build/
│       │   ├── interface/       # @zl/step-build-interface (port definition)
│       │   ├── ios/             # @zl/step-build-ios (xcodebuild adapter)
│       │   ├── android/         # @zl/step-build-android (gradle adapter)
│       │   └── app/             # @zl/step-build (app-facing, resolves platform)
│       ├── sign/
│       │   ├── interface/       # @zl/step-sign-interface
│       │   ├── ios/             # @zl/step-sign-ios (certs, profiles)
│       │   ├── android/         # @zl/step-sign-android (keystore)
│       │   └── app/             # @zl/step-sign
│       ├── test/
│       │   ├── interface/       # @zl/step-test-interface
│       │   ├── ios/             # @zl/step-test-ios
│       │   ├── android/         # @zl/step-test-android
│       │   └── app/             # @zl/step-test
│       ├── deploy/
│       │   ├── interface/       # @zl/step-deploy-interface
│       │   ├── ios/             # @zl/step-deploy-ios (TestFlight, Firebase)
│       │   ├── android/         # @zl/step-deploy-android (Play Store, Firebase)
│       │   └── app/             # @zl/step-deploy
│       └── version/
│           └── app/             # @zl/step-version (no federation needed)
│
├── docs/
├── bun.lockb
├── bunfig.toml
├── package.json                 # Workspace root (Bun workspaces)
└── tsconfig.json
```

### Federated Step Model (inspired by Flutter)

Platform-specific steps follow a federated architecture:

- **App-facing package** (`@zl/step-build`) — what users import in `zl.config.ts`. Resolves the correct platform implementation based on config.
- **Interface package** (`@zl/step-build-interface`) — defines the port: types, options, artifacts, errors. Shared by all platform adapters.
- **Platform packages** (`@zl/step-build-ios`, `@zl/step-build-android`) — concrete adapters per platform. Each has its own dependencies (no Xcode deps on Android-only machines).

Platform-agnostic steps (e.g. `version`) don't need federation — just a single `app/` package.

Community members can add new platforms by implementing the interface (e.g. `@zl/step-build-flutter`) without modifying official packages.

All related packages for a step are grouped in a single folder (feature-sliced organization).

Key decisions:
- **Bun workspaces** for monorepo management
- **CLI is a separate package** — independently versioned, depends on core
- **Each official step is its own npm package** under `@zl/` scope
- **Core has no platform-specific code**
- **Federated steps** — platform implementations are separate packages, grouped by feature

---

## Step Contract

Every step (official or third-party) exports a `defineStep` call. Two authoring paths:

### Simple Path (plain TypeScript)

For step authors who don't know or need Effect:

```typescript
import { defineStep } from "@zl/core"

export default defineStep({
  name: "build",
  dependsOnSteps: ["sign"],

  run: async (opts, ctx) => {
    ctx.logger.info("Building...")
    // plain async/await
    // ctx provides: logger, config, platform, artifacts
    return { artifact: "/path/to/build" }
  },
})
```

### Effect Path (full power)

For steps that need retries, concurrency, resource management:

```typescript
import { defineEffectStep } from "@zl/core"
import { BuildService } from "@zl/core/ports"

export default defineEffectStep({
  name: "build",
  dependsOnSteps: ["sign"],
  provides: [BuildService],

  layer: Layer.succeed(BuildService, {
    build: (opts) =>
      Effect.gen(function* () {
        // full Effect power: retries, fibers, concurrency
      }),
  }),
})
```

### Step Contract Rules

- **`name`** — identifies the step. Used in workflow references and dependency declarations.
- **`dependsOnSteps`** — declares which steps must complete before this one runs. The engine resolves execution order from these declarations.
- **`run`** (simple) / **`layer`** (Effect) — the implementation. Simple path is automatically wrapped into Effect Layers internally.
- **Steps can register CLI subcommands** — e.g. `step-sign` adds `zl sign:init`
- **Steps can declare a config schema** — core validates user config before execution

Under the hood, `defineStep` wraps async functions into Effect `Layer` implementations. The core always runs Effect internally — the simple API is a facade.

---

## User Configuration

Users define their setup in `zl.config.ts` at the project root:

```typescript
import { defineConfig } from "@zl/core"
import test from "@zl/step-test"
import sign from "@zl/step-sign"
import build from "@zl/step-build"
import deploy from "@zl/step-deploy"
import version from "@zl/step-version"

export default defineConfig({
  app: {
    name: "MyApp",
    bundleId: "com.example.myapp",
  },

  platforms: {
    ios: {
      steps: [
        test({ unit: true, integration: true }),
        sign({ type: "appstore", teamId: "XXXXX" }),
        build({ scheme: "MyApp", configuration: "Release" }),
        deploy({ testflight: { groups: ["internal-testers"] } }),
      ],
    },
    android: {
      steps: [
        test({ unit: true, integration: true }),
        sign({ keystore: "./release.keystore" }),
        build({ variant: "release" }),
        deploy({ track: "alpha" }),
      ],
    },
  },

  // Shared steps (platform-agnostic)
  steps: [
    version({ bump: "patch" }),
  ],

  workflows: {
    beta: ["test", "sign", "build", "deploy"],
    release: ["test", "sign", "build", "deploy"],
  },
})
```

### Config Design Decisions

- **Platform-scoped steps** — each platform block is self-contained. No cross-platform nesting inside step configs.
- **Shared steps** — platform-agnostic steps (versioning, changelog) at the top level.
- **Workflows are named step sequences** — `zl beta` runs the `beta` workflow. Steps are referenced by name. The workflow array defines which steps to run; `dependsOnSteps` in step definitions adds additional ordering constraints (e.g. a step that must always run after another regardless of workflow order).
- **Type-safe** — full TypeScript autocomplete and validation at config time.
- **Secrets stay out** — sensitive values via env vars or `.env`, referenced as `process.env.TEAM_ID`.
- **Future: declarative config** — YAML/JSON support can be added later, compiling down to the same TypeScript representation.

---

## Step Name Scoping & Collision Handling

### Naming Convention

- Official steps: `@zl/step-<name>` (e.g. `@zl/step-build`)
- Third-party (verified): `@zl/step-<name>` (after passing registry quality gate)
- Third-party (unverified): `@<author>/zl-step-<name>` (e.g. `@acme/zl-step-screenshot`)

### Collision Rules

1. Each step has a full scoped name derived from its npm package (`@zl/step-build` → `zl/build`)
2. Steps under `@zl/` own the short name (`build`)
3. Unverified third-party steps must use scoped references if there's a conflict
4. Core validates at config load time — duplicate short names throw a clear error with resolution instructions
5. If two third-party steps collide, both must use scoped names

### Implementation

The step-loader resolves names in this order:
1. Exact scoped match (`zl/build`)
2. Short name match among `@zl/` steps (`build` → `zl/build`)
3. Ambiguous match → error with list of candidates

---

## CLI Design

The `zl` binary is a **compiled Bun binary** — single file, no runtime dependency required.

### Distribution

- **Homebrew** — `brew install zero-line` → provides `zl` command
- **npm** — `bunx zl` / `npx zl` for JS ecosystem users

### Commands

```
zl <workflow>              Run a workflow         (zl beta, zl release)
zl run <workflow>          Explicit run           (same as above)
zl init                    Scaffold zl.config.ts in current project
zl doctor                  Check environment      (Xcode, Android SDK, certs)
zl list                    List available workflows and steps
zl <step:command>          Step-registered commands (zl sign:init, zl deploy:status)
```

### Behavior

- **`zl beta`** — resolves the `beta` workflow from config, loads required steps, builds the Effect Layer graph, executes in order
- **`zl beta --platform ios`** — runs only the iOS platform
- **`zl init`** — interactive setup: detects project type, installs recommended steps, generates starter config
- **`zl doctor`** — each loaded step can expose an optional `diagnose` function. Core collects and runs all, reports issues.

### Output

- Structured step-by-step progress (step name, duration, pass/fail)
- Errors show which step failed and why
- Verbose mode (`--verbose`) for debugging

---

## Shared Services (Core-Provided)

These are always available to steps via `ctx` (simple path) or Effect services (Effect path):

| Service | Purpose |
|---|---|
| `LoggerService` | Structured logging with levels |
| `ConfigService` | Read `zl.config.ts`, env vars, secrets |
| `PlatformService` | Detect OS, available toolchains (Xcode, Android SDK) |
| `ArtifactService` | Typed artifact passing between steps |

---

## Future: Step Registry

A curated registry for step discovery, quality assurance, and namespace management.

### Concept

- **Official steps** — maintained in the monorepo, always trusted
- **Verified steps** — third-party authors submit, reviewed for quality/security, get `@zl/` namespace access
- **Community steps** — any npm package, unverified, own namespace

### Quality Gates (for verified status)

- Type-checks cleanly
- Exports a valid `defineStep`
- Has tests
- No known vulnerabilities

### Discoverability

- `zl search <keyword>` finds steps from the registry

### Implementation Phases

1. **MVP (now):** No registry. Official steps in monorepo + npm packages via scoped names. Name collision handling in core.
2. **Phase 2:** Registry as a GitHub repo with a JSON manifest. PR-based submission. CLI fetches manifest for `zl search`.
3. **Phase 3:** Registry service if ecosystem growth warrants it.

The naming/scoping system is designed from day one to support the registry without breaking changes.

---

## Technology Stack

| Component | Technology |
|---|---|
| Runtime | Bun |
| Language | TypeScript |
| Core framework | Effect.ts |
| Architecture | Hexagonal (ports & adapters) / Feature-sliced |
| Monorepo | Bun workspaces |
| Binary | `bun build --compile` |
| Distribution | Homebrew, npm |
| Step distribution | npm (`@zl/` scope) |
| Testing | Bun test (built-in) |

---

## MVP Scope

The first implementation should deliver:

1. **Core** — step-loader, pipeline engine, shared services, config loading
2. **CLI** — `zl <workflow>`, `zl init`, `zl doctor`, `zl list`
3. **Steps (iOS first, then Android):**
   - `@zl/step-test` — run unit and integration tests
   - `@zl/step-sign` — certificate and provisioning profile management
   - `@zl/step-build` — compile app to artifact
   - `@zl/step-deploy` — upload to TestFlight / Firebase Distribution / Play Store
4. **Config** — `zl.config.ts` with platform scoping and workflows
5. **Compiled binary** — `zl` via `bun build --compile`
