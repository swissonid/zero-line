# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until `zl` ships its first tagged release, every user-visible change lands under
`## [Unreleased]`. The release tooling promotes these entries under a real
version heading at tag time.

## [Unreleased]

### Added

- Step contract (`defineStep` / `defineEffectStep`) with name scoping, typed
  options schemas (via `effect/Schema`), declared requirements
  (`requiredSecrets`, `requiredToolchains`, `requiredEnv`), and the
  `subcommands` field for step-author-defined `step:sub` verbs.
- `defineConfig` helper for authoring `zl.config.ts` with full type inference
  across `app`, `platforms`, `steps`, and `workflows`.
- `zl` CLI with `zl run <workflow>`, `zl <workflow>` (shorthand),
  `zl list`, and `zl --help`. Supports `--platform ios|android` to scope a
  run to a single platform.
- `@zl/step-hello` example step demonstrating the step contract end-to-end.
- Structured `StepError` class with documented error codes, surfaced through
  pipeline results and the CLI error renderer so failures print a readable
  single-line message instead of a raw stack.
- Effect-based service ports — `LoggerService`, `ConfigService`,
  `PlatformService`, `ArtifactService`, `ShellService` — with ready-to-use
  adapters (`ConsoleLogger`, `FileConfig`, `LocalPlatform`,
  `MemoryArtifactStore`, `LocalShell`).
- `LocalShell` adapter: Effect-interrupt-aware process execution with
  SIGTERM→SIGKILL escalation on cancellation and a configurable timeout.
- Step instance resolver (`resolveStepInstances`) that dynamically imports
  step packages and binds per-workflow options declared in `zl.config.ts`.
- Config-load-time options validation: misconfigured steps fail before the
  pipeline starts with an error that names the offending field.
- Secret lookup via environment variables (`ctx.secret(key)`), used as a
  stand-in until the macOS keychain-backed `SecretStore` lands.

### Changed

### Deprecated

### Removed

### Fixed

### Security
