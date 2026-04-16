# zero-line (`zl`)

> A mobile-first CI/CD toolkit with a domain-agnostic core.
> TypeScript-native. Bun-powered. Hexagonal under the hood.

## What is `zl`?

`zl` is a pipeline engine for mobile builds (iOS and Android first) that you configure in a real TypeScript file — `zl.config.ts` — and invoke from any CI runner. Its core is deliberately kept free of mobile-specific assumptions, so the same engine can grow into a general-purpose CI tool over time.

### The problem it solves

Existing CI/CD tools — Fastlane, GitHub Actions, Bitrise — collapse three different concerns into one surface:

- **Orchestration** (what runs, in what order, with what dependencies)
- **Platform logic** (how to actually build, sign, test, deploy)
- **Secrets and environment** (credentials, keys, tokens)

The result is usually a pile of YAML or Ruby where those layers leak into each other. `zl` separates them through hexagonal architecture:

- A **typed TypeScript config** (`zl.config.ts`) describes *what* you want to run.
- **Federated step packages** provide platform logic, each distributed as its own npm package.
- **Effect-based service ports** (logger, config, platform, artifacts) isolate side effects from orchestration.

The core engine orchestrates; steps supply capability; ports mediate everything that touches the outside world.

### Non-goals (for now)

- **Not a hosted runner.** `zl` does not replace GitHub Actions, Bitrise, or your Jenkins install as a scheduler. You invoke it from whatever runner you already use.
- **Not a build system.** It orchestrates the tools that build your app; it does not replace `xcodebuild` or `gradle`.
- **Not backwards-compatible with Fastlane lanes.** The config shape and step model are different by design.

---

## An AI experiment

This codebase is written nearly 100% with AI — specifically Claude Code. That's not a gimmick or a disclaimer; it's a deliberate experiment in what AI-driven engineering looks like on a real, long-lived project with production aspirations.

What that means for contributors:

- **PRs, Linear tickets, and review cadence mirror what an AI agent produces**, with a human approval gate on every merge. Each Linear issue corresponds to a single PR; the scope is kept narrow on purpose.
- **Reviews are not a formality.** Greptile runs on every PR, a human reviews after, and the AI iterates on feedback before merge.
- **Architecture and taste decisions are still human-owned.** The agent drafts; a human says yes, no, or "try again with this constraint."

You can see the working cadence on the [project's Linear board](https://linear.app/splitcast/team/ZER) and in the design spec at [`docs/superpowers/specs/2026-04-14-zero-line-design.md`](docs/superpowers/specs/2026-04-14-zero-line-design.md).

---

## Examples

### 1. Hello-world workflow

The repo ships with one real step, `@zl/step-hello`. Drop this into a `zl.config.ts` at the root of any project:

```ts
// zl.config.ts
import { defineConfig } from "@zl/core"
import helloStep from "@zl/step-hello"

export default defineConfig({
  app: { name: "demo", bundleId: "com.example.demo" },
  platforms: {
    ios: { steps: [helloStep] },
    android: { steps: [helloStep] },
  },
  workflows: {
    greet: ["hello"],
  },
})
```

Then run:

```sh
zl run greet
```

The workflow resolves the short name `"hello"` against the loaded steps, executes it, and prints the result.

### 2. Multiple platforms with `dependsOnSteps`

A slightly richer shape — two platform-specific stub steps and an explicit dependency. Real platform steps (`build`, `sign`, `test`, `deploy`) will look the same; this is the shape you're targeting.

```ts
// zl.config.ts
import { defineConfig, defineStep } from "@zl/core"

const signIos = defineStep({
  name: "sign",
  run: async (_opts, ctx) => {
    ctx.logger.info("Signing iOS build…")
    return { signed: true }
  },
})

const buildIos = defineStep({
  name: "build",
  dependsOnSteps: ["sign"],
  run: async (_opts, ctx) => {
    ctx.logger.info("Building iOS app…")
    return { artifact: "/tmp/demo.ipa" }
  },
})

const buildAndroid = defineStep({
  name: "build",
  run: async (_opts, ctx) => {
    ctx.logger.info("Building Android app…")
    return { artifact: "/tmp/demo.apk" }
  },
})

export default defineConfig({
  app: { name: "demo", bundleId: "com.example.demo" },
  platforms: {
    ios: { steps: [signIos, buildIos] },
    android: { steps: [buildAndroid] },
  },
  workflows: {
    release: ["sign", "build"],
    "release-android": ["build"],
  },
})
```

Run a single platform:

```sh
zl run release --platform ios
zl run release-android --platform android
```

The engine topologically sorts `sign` → `build` via `dependsOnSteps`, runs them in order, and surfaces artifacts through the shared `ArtifactService` port.

---

## Install

`zl` is not yet on Homebrew or npm as a compiled binary — that ships with [ZER-10](https://linear.app/splitcast/issue/ZER-10). Until then, build from source:

```sh
git clone https://github.com/swissonid/zero-line.git
cd zero-line
bun install
bun --cwd packages/cli run build   # produces packages/cli/zl
```

That gives you a standalone binary at `packages/cli/zl` which you can put on your `PATH`.

Minimum requirements:

- [Bun](https://bun.sh) ≥ 1.3
- TypeScript-capable project (the config file is `zl.config.ts`)

---

## Project status

Pre-MVP. Architecture is in place (core engine, step contract, config loader, hello step, CLI); official platform steps (`build`, `sign`, `test`, `deploy`) are not yet implemented. Tracking is public on Linear under the [**zero-line** team (`ZER`)](https://linear.app/splitcast/team/ZER).

CI status badge will land with the CI ticket.

---

## Documentation

- **Design spec** — [`docs/superpowers/specs/2026-04-14-zero-line-design.md`](docs/superpowers/specs/2026-04-14-zero-line-design.md) covers architecture, step contract, federation model, and the roadmap.
- **Public API** — re-exported from `packages/core/src/index.ts` (`defineConfig`, `defineStep`, `defineEffectStep`, ports, adapters).

---

## Licence

TBD — tracked as its own ticket.
