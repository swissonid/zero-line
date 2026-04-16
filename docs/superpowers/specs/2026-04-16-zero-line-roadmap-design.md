# zero-line post-MVP roadmap — design

**Status:** Draft
**Date:** 2026-04-16
**Scope:** Full roadmap from the current MVP state to v1.0.
**Outcome target:** v1.0 is **publicly released (`brew install zl`, documented, a stranger can clone an example repo and run a workflow)** *and* **dogfooded on a real private mobile app** (code → prod, iOS + Android).

## Context

The MVP shipped in PR #1 (landed on `main` at commit `a952a71`):

- `@zl/core` — step contract (`defineStep`/`defineEffectStep`), step loader with name scoping, dependency graph, pipeline engine, config loader, effect-based service ports (Logger / Config / Platform / Artifact) with adapters.
- `@zl/cli` — `zl run`, `zl list`, `zl --help`; 100% test coverage across packages.
- `@zl/step-hello` — one working example step proving the contract.

Follow-up P2 fixes are in flight (PRs #43/#44/#45 → ZER-97/98/99). Beyond that, open scope covers step packages (iOS + Android for test/build/sign/deploy), CLI polish (`init`/`doctor`/`secret`), release tooling (CI / Homebrew / multi-arch binaries), OS keychain secrets, and the step instance resolver (ZER-96) that makes `StepInstance` configs actually runnable.

This document defines how we get from here to v1.0.

## Guiding principles

1. **Core is frozen after M-A.** `@zl/core`'s public API is locked at `@zl/core@0.1.0` at the end of M-A. Every subsequent milestone is plugin work. Any need to touch core during M-B through M-F is a signal — either a gap we missed in the M-A audit (file a core hotfix ticket) or a plugin reaching past its boundary (redesign the plugin).
2. **Each milestone is user-visible.** No invisible scaffolding milestone after M-A. Every tag is something a user can `brew upgrade` to and do more with than they could before.
3. **One Linear issue = one PR = one merge to `main`.** Trunk-based, tags drive releases. No `develop` branch, no release branches (until post-v1.0 if needed).
4. **AI-first development.** The project is an open experiment in AI-driven engineering. Linear tickets, PRs, and review cadence reflect that.
5. **Dogfood before v1.0 ships.** M-F holds a dogfooding gate: a real mobile app runs its full code → prod pipeline through zl before we tag `v1.0.0`.

## Branching & release model

- **`main`** is always releasable. Every PR (one per Linear issue) lands here.
- **Releases** are annotated tags of the form `vX.Y.Z` on `main`. Pushing a tag triggers the GitHub Actions release workflow: multi-arch `bun build --compile` (`darwin-arm64`, `darwin-x64`, `linux-x64`) → GitHub Release with SHA-256 sums → Homebrew tap formula updated.
- **Each roadmap milestone closes with a tag.** See the version mapping below.
- **Hotfixes** branch off the affected tag, cherry-pick back to `main`, then tag a new patch (e.g. `v0.2.1`).
- **Milestones in Linear** are Linear Milestones inside the `zero-line MVP` project. Every ticket for a milestone is attached to its Linear Milestone. v1.0 ships when all six Linear Milestones are marked Done.

## Changelog & release notes

- **`CHANGELOG.md`** at the repo root, following the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format with sections `Added / Changed / Deprecated / Removed / Fixed / Security`.
- **Per-PR discipline:** every PR adds at least one bullet under `## [Unreleased]`. The bullet is phrased for *users*, not code reviewers (e.g. "Added `zl doctor` command for checking installed toolchains", not "Wire up DoctorCommand.ts").
- **On tag:** the `## [Unreleased]` section is renamed to `## [X.Y.Z] - YYYY-MM-DD` and a fresh empty `## [Unreleased]` is seeded above it, all in the same commit that tags the release.
- **GitHub Release body:** the release workflow extracts the new version's CHANGELOG section and posts it verbatim as the GitHub Release body, plus install instructions (Homebrew snippet + SHA-256 sums).
- **Scope:** one root CHANGELOG covering the CLI + all workspace packages for v1.0. Per-package CHANGELOGs are deferred unless plugin-ecosystem growth post-v1.0 makes the noise-to-signal ratio painful.

## Milestone shape and timeline

Six milestones at an aggressive AI-driven cadence — ~2 weeks each (M-A slightly longer), targeting v1.0 in ~12–13 weeks (~3 months).

| Milestone | Duration | Tag | Headline |
|---|---|---|---|
| **M-A Foundation** | 2–3 wk | `v0.1.0` | `brew install zl && zl init && zl doctor && zl run hello` works end-to-end. Core API frozen. |
| **M-B iOS archive** | 2 wk | `v0.2.0` | `zl run build` produces a signed `.xcarchive` / `.ipa`. |
| **M-C iOS → TestFlight** | 2 wk | `v0.3.0` | `zl run release:testflight` ships a build to TestFlight. |
| **M-D iOS → App Store + Android archive** | 2 wk | `v0.4.0` | iOS App Store phased submission; Android `.aab`/`.apk` produced and signed. |
| **M-E Android → Firebase / Play Internal** | 2 wk | `v0.5.0` | `zl run release:internal-android` distributes to Firebase App Distribution + Play internal track. |
| **M-F Play Store + v1.0 release** | 2 wk | `v1.0.0` | Play Store alpha/beta/prod submission; dogfooding pass; public v1.0 announcement. |

Patch tags (`v0.2.1`, etc.) land between milestones for hotfixes. `v1.0.0-rc.N` is optional during M-F before the final tag.

## M-A — Foundation (core hardening + distribution + CLI polish)

**Goal:** freeze `@zl/core@0.1.0` as a complete plugin-ready surface; ship a public-installable CLI; complete the CLI's user-facing subcommands (`init`/`doctor`/`secret`); put CI and release automation in place.

### Distribution & docs

- README covering vision, the AI-experiment framing, and ≥2 runnable examples (tracked as **ZER-101**).
- CI workflow (`.github/workflows/ci.yml`): typecheck + lint + test on PRs and pushes to `main`. Branch protection requires green CI before merge.
- Release workflow (`.github/workflows/release.yml`): triggered on `v*` tags. Matrix build for `darwin-arm64`, `darwin-x64`, `linux-x64`. Extracts the tag's section from `CHANGELOG.md` and posts it as the GitHub Release body. Uploads binaries + SHA-256 sums to GitHub Release. Publishes each changed workspace package (`@zl/core`, `@zl/cli`, `@zl/step-*`) to npm. Updates `swissonid/homebrew-tap` formula in the same workflow.
- Seed `CHANGELOG.md` at repo root (Keep a Changelog format) with the historical MVP work as the initial `## [0.1.0]` section; future PRs add to `## [Unreleased]`.
- Own Homebrew tap: `swissonid/homebrew-tap` repo with a `Formula/zl.rb` file that's updated by the release workflow.

### CLI subcommands

- `zl init` — interactive scaffold: ask for app name / bundle id / target platforms, write a `zl.config.ts`, create the expected folder layout, install example steps as dev dependencies.
- `zl doctor` — environment checks: Xcode (`xcode-select -p`, `xcodebuild -version`), Android SDK (`$ANDROID_HOME` + `adb`), Gradle, keychain access, Bun version. Structured output; non-zero exit on missing mandatory toolchains.
- `zl secret set/get/list/delete` — OS keychain-backed secret store. macOS uses the `security` CLI. Linux uses `secret-tool` (libsecret) — can be stubbed in M-A with a clear "Linux keychain not yet implemented" error if needed to hit the timeline; fully wired up before v1.0.

### Core hardening (the audit result — all in M-A)

1. **Step instance resolver (ZER-96)** — dynamic import of `StepInstance.name` → `ResolvedStep`, with `options` bound at invocation time. Honours the existing name-scoping rules from `StepNameResolver`. This is the single blocker that makes plugins loadable from `zl.config.ts`.
2. **Step options schema validation** — `defineStep({ optionsSchema })` using `effect/Schema`. `loadConfig` validates every `StepInstance.options` against the resolved plugin's schema at config load time. A misconfigured `build-ios` step fails with a readable error naming the offending field *before* any side effects run.
3. **`ShellService` port + `LocalShell` adapter** — Effect-based shell primitive. One canonical API for argv quoting, streaming stdout/stderr to `LoggerService`, exit-code → structured error, cwd / env override, and timeout. Every step that shells out in M-B+ uses this; plugins never spawn processes directly.
   - **Cancellation is first-class** in the port contract from day one: returning an `Effect` that honours `Effect.interrupt` must terminate the child process cleanly (SIGTERM then SIGKILL after a grace period). This is non-negotiable — if the Bun subprocess API makes it awkward, the `LocalShell` adapter absorbs the awkwardness, not the port. Long-running step cancellation (Ctrl-C during `xcodebuild`, pipeline timeout) depends on it.
4. **Step sub-command registration** — `defineStep({ subcommands })`. CLI dispatches `zl sign:init` → resolved step's `subcommands.init` handler. StepLoader collects subcommands alongside steps. Needed before M-B's `sign-ios:init` interactive flow.
5. **Structured `StepError` class** — `{ code, message, cause }`. Pipeline's `StepResult.error` becomes `StepError` (not a stringified message). Renderer displays code; plugins fail with documented codes that map to docs sections.
6. **Step-declared requirements + pipeline pre-flight** — plugins declare what they need before they can run, the pipeline verifies everything is present before executing the first step. Fail fast, with a clear message naming the missing item and the step that needs it.
   - Extend the step contract: `defineStep({ requiredSecrets, requiredToolchains, requiredEnv, ... })` where each field is either a static array of keys or a function of `options` (for cases like `requiredSecrets: (opts) => [\`APPLE_KEY_\${opts.teamId}\`]`).
   - `Pipeline.execute()` gathers all resolved steps' requirements (passing their bound `options` to dynamic functions), queries `ConfigService.secret` / `PlatformService.availableToolchains` / env, and fails with structured errors (`PREFLIGHT_MISSING_SECRETS`, `PREFLIGHT_MISSING_TOOLCHAINS`, `PREFLIGHT_MISSING_ENV`) listing every missing item — not just the first one found.
   - `zl doctor` (standalone) runs the same check mechanism but over every step registered in `zl.config.ts`, surfacing *all* potential gaps for the project.
   - Pre-flight is opt-in bypassable via `zl run --skip-preflight` for debugging, but the default is always to run it.

### Infrastructure

- E2E integration test (**ZER-28**): a fresh temp project, `zl init`, run the hello workflow end-to-end through the compiled binary. One happy-path test first; regression cases added as issues surface.
- Freeze `@zl/core@0.1.0` — publish to npm under the `@zl` scope; commit to API stability through v1.0. API-breaking changes in `@zl/core` go in `@zl/core@2.0` post-v1. Plugins consume `@zl/core` as a normal npm dependency from M-B onward.

### Exit criteria — M-A

- Fresh macOS user can `brew install zl && zl init && zl doctor && zl run hello` on a clean machine and it all works.
- CI is green on `main`; pushing a `v0.1.0` tag produces a working Homebrew bottle.
- A deliberately-misconfigured step (bad `options`) fails at config load with a readable error naming the offending field and the schema expectation.
- A trivial test plugin exercising `ShellService` + `StepError` + `subcommands` works end-to-end.
- Pre-flight: running a workflow with a missing `requiredSecret` fails with `PREFLIGHT_MISSING_SECRETS`, naming every missing secret and the step that declared it, before any step's `run` is invoked.
- `@zl/core@0.1.0` is published to npm and its public exports are documented in README.

## M-B — iOS archive

**Goal:** produce a signed iOS archive. No upload yet. First plugin work post-foundation.

- `@zl/step-build-ios` — wraps `xcodebuild -scheme -configuration -workspace|-project archive`. Streams stdout via `ShellService`. Reads inputs from `options` (scheme, configuration, workspace, project, archive-path). Emits `BuildArtifact` (path to `.xcarchive`) via `ArtifactService`.
- `@zl/step-sign-ios` — codesign + provisioning profile resolution. Options include cert name, profile path or UUID, and entitlements path. Resolves signing secrets from `zl secret` (API key password, cert passphrase). Emits signed `.ipa` artifact.
- `@zl/step-test-ios` — `xcodebuild test` wrapper. Minimal for now: pass/fail exit code, path to junit XML on the `ArtifactService`.
- `zl sign:init` subcommand — interactive bootstrap that imports a cert + profile, stores passphrase in keychain, writes the canonical sign options to `zl.config.ts`.
- **`examples/smoke-app/ios/`** — a real, minimal but releasable iOS app: empty SwiftUI screen, project-owned bundle ID (e.g. `ch.zero-line.smoke`), committed signing scaffolding (certs/profiles staged in the repo's keychain docs, real values in project maintainer's keychain). Serves both as the documentation example AND the canonical release-rehearsal target from M-C onward. `zl.config.ts` in this folder exercises test → build → sign.

### Exit criteria — M-B

- On the `examples/smoke-app/ios/` project, `zl run build` produces a signed `.ipa` on a developer machine with Xcode + valid signing assets.
- CI runs `zl run test` against the example on macOS runners.
- `v0.2.0` tag triggers a Homebrew release with the new step packages bundled.

## M-C — iOS → TestFlight

**Goal:** end-to-end "code → TestFlight testers" in one zl command.

- `@zl/step-deploy-ios` — first cut: TestFlight-only. JWT auth against App Store Connect API (API key id + issuer id + private key path all from `zl secret`). Uploads `.ipa`, polls processing, optionally assigns to an internal test group.
- Structured `StepError` codes: `ASC_AUTH_FAILED`, `ASC_UPLOAD_FAILED`, `ASC_PROCESSING_TIMEOUT`.
- Library choice: direct REST against App Store Connect API using a maintained node library (e.g. `appstore-connect-sdk`). Avoid wrapping the Java `Transporter` tool or Fastlane's `altool` shim.
- Example: `examples/smoke-app/ios/` workflow extended with `release:testflight`.

### Exit criteria — M-C

- `zl run release:testflight` against the example (with real signing assets + ASC API key) successfully uploads and makes the build available to TestFlight.
- `v0.3.0` tag ships.

## M-D — iOS → App Store + Android archive

**Goal:** iOS reaches the App Store; Android pipeline begins.

- `@zl/step-deploy-ios` gains App Store submission mode — `options.track = "appstore"` path: submit for review with metadata (version, build number, release notes, phased-release percentage). New error codes: `ASC_METADATA_REJECTED`, `ASC_SUBMIT_FAILED`.
- `@zl/step-build-android` — Gradle wrapper via `ShellService`. Options: module path, variant, flavor, build-type. Emits `.aab` or `.apk` artifact.
- `@zl/step-sign-android` — keystore management. Keystore path + alias from options; passwords resolved from `zl secret`. Produces signed artifact.
- `@zl/step-test-android` — `gradle :test` wrapper; junit-xml artifact.
- **`examples/smoke-app/android/`** — the Android half of the smoke app: empty Jetpack Compose screen, project-owned package name (e.g. `ch.zero-line.smoke`), keystore scaffolding. Parallel to the iOS smoke app; uses the same `zl.config.ts` root when reasonable (or a sibling workflow).

### Exit criteria — M-D

- iOS example can submit to App Store review end-to-end (exercised in a manual test run with a real app).
- `zl run build-android` on `examples/smoke-app/android/` produces a signed `.aab`.
- `v0.4.0` tag ships.

## M-E — Android → Firebase / Play Internal

**Goal:** Android internal distribution working.

- `@zl/step-deploy-android` — first cut: Firebase App Distribution (service-account JSON from `zl secret`) + Play Developer Publishing API internal track (same auth model). `options.channels: Array<"firebase" | "play-internal">` so a single step instance can publish to both.
- Structured error codes: `FIREBASE_AUTH_FAILED`, `PLAY_AUTH_FAILED`, `PLAY_UPLOAD_FAILED`.
- `examples/smoke-app/android/` workflow extended with `release:internal-android`. Tagging `v0.5.0` should push the smoke app to Firebase App Distribution + Play internal track.

### Exit criteria — M-E

- `zl run release:internal-android` against the example distributes a build to both Firebase and Play internal track.
- `v0.5.0` tag ships.

## M-F — Play Store + v1.0 release

**Goal:** complete Android → Play Store pathway; run v1.0 dogfooding gate; ship.

- `@zl/step-deploy-android` gains alpha/beta/production track submission — `options.channels` extended to `"play-alpha" | "play-beta" | "play-production"`. Staged rollout percentage support.
- **Dogfooding gate:** the `examples/smoke-app/{ios,android}/` completes the full `code → App Store + Play Store` pipeline end-to-end via zl on CI. The smoke apps are published to both stores (internal testing track for Play; closed beta / internal TestFlight for App Store) as the canonical rehearsal. If a friend's app has materialised by M-F, port it in parallel as a second data point — nice-to-have, not gating. Document rough edges from either run; patch them.
- Documentation polish: README examples updated to v1.0 shapes. Quickstart works cold on a fresh machine with no prior context.
- **GitHub Pages site** live at `https://swissonid.github.io/zero-line/` (or a custom domain) before the `v1.0.0` tag. Scope: landing page (pitch + install + quickstart), plugin catalogue, generated API reference for `@zl/core`, changelog view. Default generator: **MkDocs Material** (mature, dev-tool-friendly, low config); fallback to Jekyll (GH Pages default) if MkDocs ergonomics disappoint. Build + deploy wired into `.github/workflows/pages.yml`, triggered on pushes to `main` that touch `docs/site/**` or `README.md`, with a separate pre-release deploy from a `gh-pages-staging` branch if needed.
- Optional: `v1.0.0-rc.N` tags during the dogfooding pass.
- Final: `v1.0.0` tag → Homebrew auto-update → announcement.

### Exit criteria — M-F

- The smoke app runs its full release to both App Store (closed / internal TestFlight) and Play Store (internal / alpha) via zl on CI. A friend's real app, if available, is an additional data point — not required for v1.0.
- All six Linear Milestones marked Done.
- `v1.0.0` tag shipped and installable via Homebrew.
- GitHub Pages site live with landing / install / quickstart / plugin catalogue / API reference.

## Cross-cutting conventions

- **Every new plugin ships with:** contract (options + result + error types) + options schema (`effect/Schema`) + declared `requiredSecrets` / `requiredToolchains` / `requiredEnv` (static array or function of options) + unit tests (100% coverage on plugin logic) + one example in `examples/` + a runbook section in the plugin's README + a bullet in `CHANGELOG.md` under `## [Unreleased]`.
- **Plugin dependency discipline:** plugins depend only on `@zl/core` and their own tooling ecosystem (e.g. `appstore-connect-sdk`). Plugins never depend on each other.
- **Plugin publishing:** each plugin is a separate npm package published under the `@zl/` scope on the public npm registry; versions track the CLI's minor version (plugins bumped to `0.3.0` when CLI hits `v0.3.0`, etc.) until post-v1.0 when they can move independently. The release workflow publishes all changed workspace packages to npm on every tag.
- **Secrets discipline:** no `.env` files. Every secret a plugin needs is resolved via `ctx.config.secret(key)` or `ConfigService.secret(key)` → OS keychain. Plugins declare `requiredSecrets` so the pipeline pre-flight can verify them before any step runs; `zl doctor` surfaces the same information across the whole config.

## Risks and open questions

- **External dogfooding app is bonus, not gating.** The `examples/smoke-app/` iOS+Android apps — real minimal apps with project-owned bundle IDs — are built across M-B..M-E and serve as the canonical release-rehearsal target at each milestone tag. A friend's real app, if it arrives in time for M-F, adds a second data point but isn't required for v1.0.
- **Apple / Google Store API flakiness.** Mitigation: every deploy step has structured retry knobs (`options.retry = {attempts, backoff}`) and explicit error codes that the Renderer surfaces.
- **Linux keychain (libsecret).** If `secret-tool` integration slows M-A, ship macOS-only keychain in M-A with a clear "Linux not yet" error; flesh out before v1.0 (likely M-E or M-F).
- **Options schema library choice — resolved by a week-1 M-A spike.** Default preference is `effect/Schema` (already a transitive dep via Effect, composes natively with existing ports). Fallback is `zod` (broader ecosystem familiarity, friendlier default errors). The choice shows up in `defineStep`'s public contract, so it's a one-shot decision: changing after plugins exist breaks all of them.
  - **Spike:** in the first week of M-A, write the same three realistic step-option schemas (e.g. `build-ios`, `sign-ios`, `deploy-ios`) in both libraries. Compare: schema terseness, error-message quality on a deliberately-bad config, composition with `Effect.Effect<_, StepError>`, and TypeScript inference ergonomics for the step author.
  - **Output:** a short decision note appended to M-A's implementation plan recording the call and the reasons. The plan then commits to one library for every plugin from M-B onward.
- **Plugin version coupling.** Tying all plugins to the CLI minor version is simple but imprecise. If this causes friction during M-D+ we can switch to independent plugin versioning with an explicit compatibility matrix — treat as a v1.0 decision, not an M-A decision.

## What this document does not specify

- Per-PR implementation plans — produced downstream by the `writing-plans` skill for each milestone.
- Ticket-level decomposition of M-B through M-F — added to Linear as each milestone approaches (keeps Linear uncluttered; detailed scope is known best when the prior milestone's learnings are fresh).
- Post-v1.0 roadmap — explicitly deferred. Step registry (ZER-12), general-purpose (non-mobile) CI positioning, hosted runner integrations all post-v1.0.
