# M-A3 — Release Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the complete release pipeline in place so pushing a `v*` tag to `main` produces: (a) multi-arch `zl` binaries on a GitHub Release with SHA-256 sums, (b) npm-published workspace packages (`@zl/core`, `@zl/cli`, `@zl/step-hello`), (c) an updated `swissonid/homebrew-tap` formula, (d) release notes extracted from `CHANGELOG.md` — and PRs to `main` are gated by a green CI workflow.

**Architecture:** Release logic lives in a new `scripts/release/` folder as small, individually testable Bun scripts (extract/promote CHANGELOG, build binaries, compute checksums, render Homebrew formula). Two GitHub Actions workflows (`ci.yml`, `release.yml`) orchestrate those scripts. `CHANGELOG.md` sits at the repo root, Keep-a-Changelog format, discipline enforced by the release scripts themselves (promote fails if `## [Unreleased]` is empty). The Homebrew tap lives in a separate repo (`swissonid/homebrew-tap`) — this plan seeds its initial `Formula/zl.rb` and wires the release workflow to push updates to it.

**Tech Stack:** Bun (runtime + `bun build --compile` + `bun publish` + `bun test`), GitHub Actions, TypeScript, Homebrew (Ruby formula generator), `sha256sum` / `shasum -a 256` (macOS and Linux).

**Related spec:** `docs/superpowers/specs/2026-04-16-zero-line-roadmap-design.md` — sections "M-A — Foundation → Distribution & docs" and "Branching & release model" and "Changelog & release notes".

**Linear ticket(s):** M-A3 sub-milestone under Linear Milestone "M-A Foundation" (project `zero-line MVP`). Each task below maps to a single Linear issue + single PR.

**Prerequisites (external to this plan):**
- `NPM_TOKEN` secret configured on the `zero-line` GitHub repo (scope: publish to `@zl`).
- `HOMEBREW_TAP_TOKEN` secret configured (GitHub PAT with `repo` scope on `swissonid/homebrew-tap`).
- `swissonid/homebrew-tap` repo created on GitHub, empty aside from `.gitkeep` / readme — this plan's Task 11 lands the initial `Formula/zl.rb`.
- Branch protection rule on `main` is set *after* Task 7 lands CI (Task 13 documents how).

---

## Scope check — what this plan does NOT cover

- **Core hardening** → M-A1 (`2026-04-16-m-a1-core-hardening.md`).
- **CLI subcommands (`zl init`, `zl doctor`, `zl secret`)** → M-A2 (planned separately).
- **Actual `v0.1.0` tag / release cut** → M-A4 (planned separately). M-A3 delivers the *machinery*; M-A4 pushes the first tag.
- **E2E integration test (ZER-28)** — landed under M-A4 alongside the release dry-run.
- **README updates (ZER-101)** — already Done.

---

## File structure

### New files — at repo root

| Path | Responsibility |
|---|---|
| `CHANGELOG.md` | Keep-a-Changelog format. Seeded with MVP history as `## [0.1.0] - YYYY-MM-DD` (unreleased; date filled at M-A4 tag time). Active `## [Unreleased]` section at the top receives per-PR bullets going forward. |
| `.github/workflows/ci.yml` | PR + push-to-`main` gate: `bun install`, `bun run typecheck`, `bun run lint`, `bun test` (with coverage threshold from `bunfig.toml`). Runs on `ubuntu-latest` and `macos-latest`. |
| `.github/workflows/release.yml` | Triggered by `v*` tags. Matrix build binaries → compute checksums → extract CHANGELOG → create GH Release → publish npm packages → update Homebrew formula. |

### New files — in `scripts/release/`

| Path | Responsibility |
|---|---|
| `scripts/release/extractChangelog.ts` | Pure function + CLI. Input: `(changelogText, version)`. Output: the text of that version's section, *without* the `## [X.Y.Z]` heading. Errors if the section is missing. |
| `scripts/release/extractChangelog.test.ts` | Unit tests. |
| `scripts/release/promoteChangelog.ts` | Pure function + CLI. Input: `(changelogText, version, isoDate)`. Output: new changelog where `## [Unreleased]` is renamed `## [X.Y.Z] - YYYY-MM-DD` and a fresh empty `## [Unreleased]` section (with the standard sub-headings) is inserted above it. Errors if `## [Unreleased]` is missing OR empty (no bullets under any sub-heading). |
| `scripts/release/promoteChangelog.test.ts` | Unit tests. |
| `scripts/release/buildBinaries.ts` | Invokes `bun build packages/cli/src/index.ts --compile --target=<target> --outfile <out>` for each of `darwin-arm64`, `darwin-x64`, `linux-x64`. Produces `dist/zl-<target>` files. Takes a single `--target` flag for single-target builds in CI matrix. |
| `scripts/release/buildBinaries.test.ts` | Unit tests against the target list helpers. |
| `scripts/release/computeChecksums.ts` | Pure function + CLI. Reads each file in a supplied list, emits `<sha256>  <basename>` lines to `dist/SHA256SUMS.txt`. Uses `crypto.subtle.digest("SHA-256", ...)` via Bun's Web Crypto. |
| `scripts/release/computeChecksums.test.ts` | Unit tests. |
| `scripts/release/renderHomebrewFormula.ts` | Pure function + CLI. Input: `{ version, darwinArm64Sha256, darwinX64Sha256, linuxX64Sha256, releaseUrlBase }`. Output: a `Formula/zl.rb` string. |
| `scripts/release/renderHomebrewFormula.test.ts` | Unit tests. |
| `scripts/release/preparePublish.ts` | Reads every workspace `package.json`, returns the publish order (topologically sorted by workspace deps). Output to stdout as newline-separated package directories relative to repo root. |
| `scripts/release/preparePublish.test.ts` | Unit tests. |

### New files — documentation

| Path | Responsibility |
|---|---|
| `docs/superpowers/notes/releasing.md` | Release runbook. Covers: how a tag flows through the workflow, how to add an `## [Unreleased]` bullet in a PR, how to prepare a hotfix, how to roll a release back, what the required GH secrets are, how branch protection is configured. |

### Modified files

| Path | Change |
|---|---|
| `package.json` | Add `release:changelog:extract`, `release:changelog:promote`, `release:build`, `release:checksums`, `release:homebrew`, `release:prepare-publish` scripts. |
| `.gitignore` | Add `dist/`. |
| `README.md` | Add a short "Install" section pointing at `brew install swissonid/tap/zl`. |

---

## Task 1: Seed `CHANGELOG.md`

**Files:**
- Create: `CHANGELOG.md`
- Modify: `.gitignore`

- [ ] **Step 1: Create `CHANGELOG.md`**

Create `CHANGELOG.md` at repo root with this exact content:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [0.1.0] - TBD

### Added

- `@zl/core` — step contract (`defineStep` / `defineEffectStep`), step loader with name scoping, dependency graph, pipeline engine, config loader, Effect-based service ports (Logger / Config / Platform / Artifact) with adapters.
- `@zl/cli` — `zl run`, `zl list`, `zl --help` with 100% test coverage across packages.
- `@zl/step-hello` — one working example step proving the contract.
- Structured `StepError` class with documented error codes, propagated through pipeline results and the CLI renderer.
- `ShellService` port and `LocalShell` adapter (Effect-interrupt-aware, SIGTERM→SIGKILL on cancellation, configurable timeout).
- Step instance resolver (`resolveStepInstances`) that dynamically imports plugin packages and binds options from `zl.config.ts`.
- `defineStep` extended with `optionsSchema` (`effect/Schema`), `requiredSecrets`, `requiredToolchains`, `requiredEnv`, and `subcommands` fields.
- Pipeline pre-flight: missing secrets / toolchains / env are reported as a single aggregated `PREFLIGHT_MISSING_*` error before any step runs. Bypass via `zl run --skip-preflight`.
- Options validation at config load time via `optionsSchema` — misconfigured steps fail with a readable error naming the offending field.
- Sub-command dispatch: `zl <step>:<sub>` routes to a step's declared `subcommands[sub]` handler.
```

The `## [0.1.0]` date is intentionally `TBD` — the `promoteChangelog` script fills it in when the tag is pushed (but `## [0.1.0]` itself is seeded here so the historical MVP work has a home; M-A4 will move the then-accumulated `## [Unreleased]` bullets *above* the `[0.1.0]` section by calling `promoteChangelog` with the actual tag, producing a second `## [0.1.0]` section — fine because the heading for seeded content is renamed to `## [0.1.0-mvp-seed]` in Task 3's script behaviour via the "seed-only" section convention. See Task 3 for how the script distinguishes them).

Actually: to avoid the double-heading edge case, use this simpler approach — rename the seed heading now:

Replace the `## [0.1.0] - TBD` line with `## [0.1.0-mvp-seed]` and keep its content. The real `## [0.1.0]` will appear above it when `promoteChangelog` runs at M-A4 tag time.

Final `CHANGELOG.md` content to write:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [0.1.0-mvp-seed]

### Added

- `@zl/core` — step contract (`defineStep` / `defineEffectStep`), step loader with name scoping, dependency graph, pipeline engine, config loader, Effect-based service ports (Logger / Config / Platform / Artifact) with adapters.
- `@zl/cli` — `zl run`, `zl list`, `zl --help` with 100% test coverage across packages.
- `@zl/step-hello` — one working example step proving the contract.
- Structured `StepError` class with documented error codes, propagated through pipeline results and the CLI renderer.
- `ShellService` port and `LocalShell` adapter (Effect-interrupt-aware, SIGTERM→SIGKILL on cancellation, configurable timeout).
- Step instance resolver (`resolveStepInstances`) that dynamically imports plugin packages and binds options from `zl.config.ts`.
- `defineStep` extended with `optionsSchema` (`effect/Schema`), `requiredSecrets`, `requiredToolchains`, `requiredEnv`, and `subcommands` fields.
- Pipeline pre-flight: missing secrets / toolchains / env are reported as a single aggregated `PREFLIGHT_MISSING_*` error before any step runs. Bypass via `zl run --skip-preflight`.
- Options validation at config load time via `optionsSchema` — misconfigured steps fail with a readable error naming the offending field.
- Sub-command dispatch: `zl <step>:<sub>` routes to a step's declared `subcommands[sub]` handler.
```

- [ ] **Step 2: Add `dist/` to `.gitignore`**

Read `.gitignore` first to confirm current content, then append `dist/` on a new line if not already present:

```bash
grep -q '^dist/$' .gitignore || printf '\ndist/\n' >> .gitignore
```

Expected: `dist/` appears as its own line.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md .gitignore
git commit -m "chore: seed CHANGELOG.md with MVP baseline and ignore dist/"
```

---

## Task 2: `extractChangelog` script — extract a version's section

**Files:**
- Create: `scripts/release/extractChangelog.ts`
- Create: `scripts/release/extractChangelog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/release/extractChangelog.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { extractChangelog } from "./extractChangelog"

const SAMPLE = `# Changelog

## [Unreleased]

### Added

- WIP thing

## [0.2.0] - 2026-05-21

### Added

- Feature A
- Feature B

### Fixed

- Bug X

## [0.1.0] - 2026-05-07

### Added

- Initial release
`

describe("extractChangelog", () => {
  it("returns the body of the requested version without its heading", () => {
    const result = extractChangelog(SAMPLE, "0.2.0")
    expect(result).toContain("- Feature A")
    expect(result).toContain("- Feature B")
    expect(result).toContain("- Bug X")
    expect(result).not.toContain("## [0.2.0]")
    expect(result).not.toContain("## [0.1.0]")
    expect(result).not.toContain("## [Unreleased]")
  })

  it("trims leading and trailing blank lines", () => {
    const result = extractChangelog(SAMPLE, "0.2.0")
    expect(result.startsWith("\n")).toBe(false)
    expect(result.endsWith("\n\n")).toBe(false)
  })

  it("throws a descriptive error when the version section is missing", () => {
    expect(() => extractChangelog(SAMPLE, "9.9.9")).toThrow(
      /section not found for version 9\.9\.9/i,
    )
  })

  it("handles the final section in the file (no trailing ## heading)", () => {
    const result = extractChangelog(SAMPLE, "0.1.0")
    expect(result).toContain("- Initial release")
  })

  it("rejects non-semver-looking version strings", () => {
    expect(() => extractChangelog(SAMPLE, "not-a-version")).toThrow(
      /invalid version/i,
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/release/extractChangelog.test.ts`
Expected: FAIL — `Cannot find module "./extractChangelog"`.

- [ ] **Step 3: Implement `extractChangelog`**

Create `scripts/release/extractChangelog.ts`:

```ts
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/

export function extractChangelog(text: string, version: string): string {
  if (!VERSION_RE.test(version)) {
    throw new Error(`invalid version: ${version}`)
  }
  const heading = `## [${version}]`
  const lines = text.split("\n")
  const startIdx = lines.findIndex((l) => l.startsWith(heading))
  if (startIdx === -1) {
    throw new Error(`section not found for version ${version}`)
  }
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      endIdx = i
      break
    }
  }
  const body = lines.slice(startIdx + 1, endIdx).join("\n")
  return body.replace(/^\n+/, "").replace(/\n+$/, "")
}

if (import.meta.main) {
  const [version] = Bun.argv.slice(2)
  if (!version) {
    console.error("usage: bun scripts/release/extractChangelog.ts <version>")
    process.exit(2)
  }
  const text = await Bun.file("CHANGELOG.md").text()
  process.stdout.write(extractChangelog(text, version) + "\n")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/release/extractChangelog.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Smoke-test the CLI path against real `CHANGELOG.md`**

Run: `bun scripts/release/extractChangelog.ts 0.1.0-mvp-seed | head -5`
Expected: First few bullets from the seeded section, no heading.

- [ ] **Step 6: Commit**

```bash
git add scripts/release/extractChangelog.ts scripts/release/extractChangelog.test.ts
git commit -m "feat(release): add extractChangelog script"
```

---

## Task 3: `promoteChangelog` script — rename `[Unreleased]` → `[X.Y.Z]`

**Files:**
- Create: `scripts/release/promoteChangelog.ts`
- Create: `scripts/release/promoteChangelog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/release/promoteChangelog.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { promoteChangelog } from "./promoteChangelog"

const FRESH_UNRELEASED = `## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security
`

const UNRELEASED_WITH_BULLETS = `## [Unreleased]

### Added

- New thing

### Changed

### Deprecated

### Removed

### Fixed

### Security
`

describe("promoteChangelog", () => {
  it("renames [Unreleased] to [version] - date and seeds a fresh empty [Unreleased] above it", () => {
    const input = `# Changelog

${UNRELEASED_WITH_BULLETS}
## [0.1.0-mvp-seed]

### Added

- old
`
    const out = promoteChangelog(input, "0.2.0", "2026-05-21")
    expect(out).toMatch(/## \[Unreleased\]\s+### Added\s+### Changed/)
    expect(out).toMatch(/## \[0\.2\.0\] - 2026-05-21\s+### Added\s+- New thing/)
    expect(out).toContain("## [0.1.0-mvp-seed]")
    expect(out.indexOf("## [Unreleased]")).toBeLessThan(
      out.indexOf("## [0.2.0]"),
    )
  })

  it("throws when [Unreleased] has no bullets", () => {
    const input = `# Changelog

${FRESH_UNRELEASED}
## [0.1.0-mvp-seed]
`
    expect(() => promoteChangelog(input, "0.2.0", "2026-05-21")).toThrow(
      /empty/i,
    )
  })

  it("throws when [Unreleased] is missing", () => {
    const input = `# Changelog

## [0.1.0-mvp-seed]

### Added
- old
`
    expect(() => promoteChangelog(input, "0.2.0", "2026-05-21")).toThrow(
      /unreleased section not found/i,
    )
  })

  it("rejects bad version strings", () => {
    expect(() => promoteChangelog("## [Unreleased]\n", "nope", "2026-05-21"))
      .toThrow(/invalid version/i)
  })

  it("rejects bad ISO dates", () => {
    const input = `## [Unreleased]\n\n### Added\n- thing\n`
    expect(() => promoteChangelog(input, "0.2.0", "21-05-2026")).toThrow(
      /invalid date/i,
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/release/promoteChangelog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `promoteChangelog`**

Create `scripts/release/promoteChangelog.ts`:

```ts
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UNRELEASED_HEADING = "## [Unreleased]"

const FRESH_UNRELEASED = `${UNRELEASED_HEADING}

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security
`

export function promoteChangelog(
  text: string,
  version: string,
  isoDate: string,
): string {
  if (!VERSION_RE.test(version)) {
    throw new Error(`invalid version: ${version}`)
  }
  if (!DATE_RE.test(isoDate)) {
    throw new Error(`invalid date (expected YYYY-MM-DD): ${isoDate}`)
  }
  const lines = text.split("\n")
  const startIdx = lines.findIndex((l) => l.trim() === UNRELEASED_HEADING)
  if (startIdx === -1) {
    throw new Error("Unreleased section not found")
  }
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      endIdx = i
      break
    }
  }
  const body = lines.slice(startIdx + 1, endIdx).join("\n")
  const hasBullets = /^\s*-\s+\S/m.test(body)
  if (!hasBullets) {
    throw new Error(
      "[Unreleased] section is empty — add at least one bullet before tagging a release",
    )
  }

  const renamed = `## [${version}] - ${isoDate}${body.endsWith("\n") ? "" : "\n"}`
  const replacedLines = [
    ...lines.slice(0, startIdx),
    ...FRESH_UNRELEASED.split("\n"),
    "",
    renamed.replace(/\n$/, ""),
    ...lines.slice(startIdx + 1, endIdx),
    ...lines.slice(endIdx),
  ]
  return replacedLines.join("\n")
}

if (import.meta.main) {
  const [version, date] = Bun.argv.slice(2)
  if (!version || !date) {
    console.error(
      "usage: bun scripts/release/promoteChangelog.ts <version> <YYYY-MM-DD>",
    )
    process.exit(2)
  }
  const path = "CHANGELOG.md"
  const text = await Bun.file(path).text()
  const next = promoteChangelog(text, version, date)
  await Bun.write(path, next)
  console.log(`promoted [Unreleased] → [${version}] - ${date}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/release/promoteChangelog.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/promoteChangelog.ts scripts/release/promoteChangelog.test.ts
git commit -m "feat(release): add promoteChangelog script"
```

---

## Task 4: `buildBinaries` — compile multi-arch `zl` binaries

**Files:**
- Create: `scripts/release/buildBinaries.ts`
- Create: `scripts/release/buildBinaries.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/release/buildBinaries.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import {
  ALL_TARGETS,
  parseBuildArgs,
  targetToBunFlag,
  outFileForTarget,
} from "./buildBinaries"

describe("buildBinaries helpers", () => {
  it("lists exactly the three supported targets in the required order", () => {
    expect(ALL_TARGETS).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-x64",
    ])
  })

  it("maps each target to the correct bun --target flag", () => {
    expect(targetToBunFlag("darwin-arm64")).toBe("bun-darwin-arm64")
    expect(targetToBunFlag("darwin-x64")).toBe("bun-darwin-x64")
    expect(targetToBunFlag("linux-x64")).toBe("bun-linux-x64")
  })

  it("computes per-target outfile paths under dist/", () => {
    expect(outFileForTarget("darwin-arm64")).toBe("dist/zl-darwin-arm64")
    expect(outFileForTarget("linux-x64")).toBe("dist/zl-linux-x64")
  })

  it("parseBuildArgs defaults to all targets when --target is absent", () => {
    expect(parseBuildArgs([])).toEqual(ALL_TARGETS)
  })

  it("parseBuildArgs returns a single target when --target is provided", () => {
    expect(parseBuildArgs(["--target", "linux-x64"])).toEqual(["linux-x64"])
  })

  it("parseBuildArgs throws on an unknown target", () => {
    expect(() => parseBuildArgs(["--target", "windows-x64"])).toThrow(
      /unknown target/i,
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/release/buildBinaries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildBinaries`**

Create `scripts/release/buildBinaries.ts`:

```ts
export const ALL_TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
] as const

export type Target = (typeof ALL_TARGETS)[number]

export function targetToBunFlag(target: Target): string {
  return `bun-${target}`
}

export function outFileForTarget(target: Target): string {
  return `dist/zl-${target}`
}

export function parseBuildArgs(argv: readonly string[]): readonly Target[] {
  const idx = argv.indexOf("--target")
  if (idx === -1) return ALL_TARGETS
  const raw = argv[idx + 1]
  if (!raw || !(ALL_TARGETS as readonly string[]).includes(raw)) {
    throw new Error(`unknown target: ${raw ?? "(missing)"}`)
  }
  return [raw as Target]
}

async function runBuild(target: Target): Promise<void> {
  const flag = targetToBunFlag(target)
  const out = outFileForTarget(target)
  console.log(`building ${out} (--target ${flag})`)
  const proc = Bun.spawn(
    [
      "bun",
      "build",
      "packages/cli/src/index.ts",
      "--compile",
      "--target",
      flag,
      "--outfile",
      out,
    ],
    { stdout: "inherit", stderr: "inherit" },
  )
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`bun build failed for ${target} (exit ${code})`)
  }
}

if (import.meta.main) {
  const targets = parseBuildArgs(Bun.argv.slice(2))
  await Bun.write("dist/.gitkeep", "")
  for (const t of targets) {
    await runBuild(t)
  }
  console.log(`built ${targets.length} binary/binaries`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/release/buildBinaries.test.ts`
Expected: 6 passing.

- [ ] **Step 5: Smoke-test a native build locally**

Run: `bun scripts/release/buildBinaries.ts --target $(uname -s | tr A-Z a-z)-$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')`

Expected: a `dist/zl-darwin-arm64` (on Apple Silicon) or equivalent binary is produced. Verify with `ls -la dist/` and `./dist/zl-darwin-arm64 --help` printing the CLI help.

Cleanup: `rm -rf dist/` (CI will rebuild).

- [ ] **Step 6: Commit**

```bash
git add scripts/release/buildBinaries.ts scripts/release/buildBinaries.test.ts
git commit -m "feat(release): add multi-arch buildBinaries script"
```

---

## Task 5: `computeChecksums` — SHA-256 for release artifacts

**Files:**
- Create: `scripts/release/computeChecksums.ts`
- Create: `scripts/release/computeChecksums.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/release/computeChecksums.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from "bun:test"
import {
  computeSha256Hex,
  formatSumsFile,
  collectSums,
} from "./computeChecksums"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let tmpDir = ""

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "zl-checksum-"))
  await writeFile(join(tmpDir, "a.bin"), "hello\n")
  await writeFile(join(tmpDir, "b.bin"), "world\n")
})

afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true })
})

describe("computeChecksums", () => {
  it("produces the canonical sha256 hex for known content", async () => {
    const hex = await computeSha256Hex(join(tmpDir, "a.bin"))
    expect(hex).toBe(
      "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03",
    )
  })

  it("collectSums returns sums for every file", async () => {
    const sums = await collectSums([
      join(tmpDir, "a.bin"),
      join(tmpDir, "b.bin"),
    ])
    expect(sums).toHaveLength(2)
    expect(sums[0].basename).toBe("a.bin")
    expect(sums[1].basename).toBe("b.bin")
  })

  it("formatSumsFile renders `<hex>  <basename>` lines with trailing newline", () => {
    const text = formatSumsFile([
      { basename: "zl-linux-x64", sha256: "abc" },
      { basename: "zl-darwin-arm64", sha256: "def" },
    ])
    expect(text).toBe("abc  zl-linux-x64\ndef  zl-darwin-arm64\n")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/release/computeChecksums.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `computeChecksums`**

Create `scripts/release/computeChecksums.ts`:

```ts
import { basename as pathBasename } from "node:path"

export interface SumEntry {
  readonly basename: string
  readonly sha256: string
}

export async function computeSha256Hex(path: string): Promise<string> {
  const bytes = await Bun.file(path).arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function collectSums(
  paths: readonly string[],
): Promise<readonly SumEntry[]> {
  const out: SumEntry[] = []
  for (const p of paths) {
    out.push({ basename: pathBasename(p), sha256: await computeSha256Hex(p) })
  }
  return out
}

export function formatSumsFile(entries: readonly SumEntry[]): string {
  return entries.map((e) => `${e.sha256}  ${e.basename}`).join("\n") + "\n"
}

if (import.meta.main) {
  const paths = Bun.argv.slice(2)
  if (paths.length === 0) {
    console.error(
      "usage: bun scripts/release/computeChecksums.ts <file> [<file> ...]",
    )
    process.exit(2)
  }
  const sums = await collectSums(paths)
  const text = formatSumsFile(sums)
  await Bun.write("dist/SHA256SUMS.txt", text)
  process.stdout.write(text)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/release/computeChecksums.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/computeChecksums.ts scripts/release/computeChecksums.test.ts
git commit -m "feat(release): add computeChecksums script"
```

---

## Task 6: `renderHomebrewFormula` — generate `Formula/zl.rb`

**Files:**
- Create: `scripts/release/renderHomebrewFormula.ts`
- Create: `scripts/release/renderHomebrewFormula.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/release/renderHomebrewFormula.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { renderHomebrewFormula } from "./renderHomebrewFormula"

describe("renderHomebrewFormula", () => {
  const input = {
    version: "0.1.0",
    releaseUrlBase:
      "https://github.com/swissonid/zero-line/releases/download/v0.1.0",
    darwinArm64Sha256: "aaa",
    darwinX64Sha256: "bbb",
    linuxX64Sha256: "ccc",
  }

  it("contains the expected class header and version", () => {
    const out = renderHomebrewFormula(input)
    expect(out).toContain("class Zl < Formula")
    expect(out).toContain('version "0.1.0"')
  })

  it("emits per-arch URLs and sha256 values in the right on_{macos,linux} blocks", () => {
    const out = renderHomebrewFormula(input)
    expect(out).toContain("on_macos do")
    expect(out).toContain("on_linux do")
    expect(out).toContain("zl-darwin-arm64")
    expect(out).toContain("zl-darwin-x64")
    expect(out).toContain("zl-linux-x64")
    expect(out).toContain('sha256 "aaa"')
    expect(out).toContain('sha256 "bbb"')
    expect(out).toContain('sha256 "ccc"')
  })

  it("installs the binary as `zl`", () => {
    const out = renderHomebrewFormula(input)
    expect(out).toMatch(/bin\.install .* => "zl"/)
  })

  it("includes a test block invoking --help", () => {
    const out = renderHomebrewFormula(input)
    expect(out).toContain('assert_match "Usage:", shell_output("#{bin}/zl --help")')
  })

  it("rejects invalid version strings", () => {
    expect(() =>
      renderHomebrewFormula({ ...input, version: "nope" }),
    ).toThrow(/invalid version/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/release/renderHomebrewFormula.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `renderHomebrewFormula`**

Create `scripts/release/renderHomebrewFormula.ts`:

```ts
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/

export interface FormulaInput {
  readonly version: string
  readonly releaseUrlBase: string
  readonly darwinArm64Sha256: string
  readonly darwinX64Sha256: string
  readonly linuxX64Sha256: string
}

export function renderHomebrewFormula(input: FormulaInput): string {
  if (!VERSION_RE.test(input.version)) {
    throw new Error(`invalid version: ${input.version}`)
  }
  const {
    version,
    releaseUrlBase,
    darwinArm64Sha256,
    darwinX64Sha256,
    linuxX64Sha256,
  } = input

  return `class Zl < Formula
  desc "Mobile-first CI/CD toolkit with a domain-agnostic core"
  homepage "https://github.com/swissonid/zero-line"
  version "${version}"
  license "MIT"

  on_macos do
    on_arm do
      url "${releaseUrlBase}/zl-darwin-arm64"
      sha256 "${darwinArm64Sha256}"

      def install
        bin.install "zl-darwin-arm64" => "zl"
      end
    end
    on_intel do
      url "${releaseUrlBase}/zl-darwin-x64"
      sha256 "${darwinX64Sha256}"

      def install
        bin.install "zl-darwin-x64" => "zl"
      end
    end
  end

  on_linux do
    url "${releaseUrlBase}/zl-linux-x64"
    sha256 "${linuxX64Sha256}"

    def install
      bin.install "zl-linux-x64" => "zl"
    end
  end

  test do
    assert_match "Usage:", shell_output("#{bin}/zl --help")
  end
end
`
}

if (import.meta.main) {
  const [version, releaseUrlBase, arm64, x64, linux] = Bun.argv.slice(2)
  if (!version || !releaseUrlBase || !arm64 || !x64 || !linux) {
    console.error(
      "usage: bun scripts/release/renderHomebrewFormula.ts <version> <urlBase> <darwinArm64Sum> <darwinX64Sum> <linuxX64Sum>",
    )
    process.exit(2)
  }
  process.stdout.write(
    renderHomebrewFormula({
      version,
      releaseUrlBase,
      darwinArm64Sha256: arm64,
      darwinX64Sha256: x64,
      linuxX64Sha256: linux,
    }),
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/release/renderHomebrewFormula.test.ts`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/renderHomebrewFormula.ts scripts/release/renderHomebrewFormula.test.ts
git commit -m "feat(release): add renderHomebrewFormula script"
```

---

## Task 7: `preparePublish` — topological order for workspace publishing

**Files:**
- Create: `scripts/release/preparePublish.ts`
- Create: `scripts/release/preparePublish.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/release/preparePublish.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { topoSortWorkspaces } from "./preparePublish"

describe("topoSortWorkspaces", () => {
  it("places @zl/core before dependents", () => {
    const pkgs = [
      {
        dir: "packages/cli",
        name: "@zl/cli",
        deps: ["@zl/core"],
      },
      {
        dir: "packages/core",
        name: "@zl/core",
        deps: [],
      },
      {
        dir: "packages/steps/hello/hello",
        name: "@zl/step-hello",
        deps: ["@zl/core"],
      },
    ]
    const ordered = topoSortWorkspaces(pkgs)
    const idx = (n: string) => ordered.findIndex((p) => p.name === n)
    expect(idx("@zl/core")).toBeLessThan(idx("@zl/cli"))
    expect(idx("@zl/core")).toBeLessThan(idx("@zl/step-hello"))
  })

  it("is stable for independent packages (input order preserved)", () => {
    const pkgs = [
      { dir: "a", name: "@zl/a", deps: [] },
      { dir: "b", name: "@zl/b", deps: [] },
    ]
    const ordered = topoSortWorkspaces(pkgs)
    expect(ordered.map((p) => p.name)).toEqual(["@zl/a", "@zl/b"])
  })

  it("throws on a dependency cycle", () => {
    const pkgs = [
      { dir: "a", name: "@zl/a", deps: ["@zl/b"] },
      { dir: "b", name: "@zl/b", deps: ["@zl/a"] },
    ]
    expect(() => topoSortWorkspaces(pkgs)).toThrow(/cycle/i)
  })

  it("ignores external (non-workspace) dependencies", () => {
    const pkgs = [
      { dir: "a", name: "@zl/a", deps: ["effect", "@zl/core"] },
      { dir: "core", name: "@zl/core", deps: [] },
    ]
    const ordered = topoSortWorkspaces(pkgs)
    expect(ordered[0].name).toBe("@zl/core")
    expect(ordered[1].name).toBe("@zl/a")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/release/preparePublish.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `preparePublish`**

Create `scripts/release/preparePublish.ts`:

```ts
import { Glob } from "bun"
import { dirname } from "node:path"

export interface WorkspacePkg {
  readonly dir: string
  readonly name: string
  readonly deps: readonly string[]
}

export function topoSortWorkspaces(
  pkgs: readonly WorkspacePkg[],
): readonly WorkspacePkg[] {
  const nameSet = new Set(pkgs.map((p) => p.name))
  const byName = new Map(pkgs.map((p) => [p.name, p]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const ordered: WorkspacePkg[] = []

  function visit(pkg: WorkspacePkg): void {
    if (visited.has(pkg.name)) return
    if (visiting.has(pkg.name)) {
      throw new Error(`dependency cycle detected at ${pkg.name}`)
    }
    visiting.add(pkg.name)
    for (const d of pkg.deps) {
      if (!nameSet.has(d)) continue
      visit(byName.get(d)!)
    }
    visiting.delete(pkg.name)
    visited.add(pkg.name)
    ordered.push(pkg)
  }

  for (const p of pkgs) visit(p)
  return ordered
}

async function discoverWorkspaces(): Promise<readonly WorkspacePkg[]> {
  const root = JSON.parse(await Bun.file("package.json").text()) as {
    workspaces?: string[]
  }
  const patterns = root.workspaces ?? []
  const found: WorkspacePkg[] = []
  for (const pattern of patterns) {
    const glob = new Glob(`${pattern}/package.json`)
    for await (const match of glob.scan({ cwd: "." })) {
      const pkgJson = JSON.parse(await Bun.file(match).text()) as {
        name: string
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
      }
      const deps = [
        ...Object.keys(pkgJson.dependencies ?? {}),
        ...Object.keys(pkgJson.peerDependencies ?? {}),
      ]
      found.push({ dir: dirname(match), name: pkgJson.name, deps })
    }
  }
  return found
}

if (import.meta.main) {
  const ws = await discoverWorkspaces()
  for (const p of topoSortWorkspaces(ws)) {
    console.log(p.dir)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/release/preparePublish.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Smoke-test the CLI path against the real workspace**

Run: `bun scripts/release/preparePublish.ts`

Expected output (order):
```
packages/core
packages/cli
packages/steps/hello/hello
```

(`@zl/core` before `@zl/cli` and `@zl/step-hello`.)

- [ ] **Step 6: Commit**

```bash
git add scripts/release/preparePublish.ts scripts/release/preparePublish.test.ts
git commit -m "feat(release): add preparePublish topological workspace sort"
```

---

## Task 8: Add `release:*` npm scripts to root `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Read current `package.json`**

Read `package.json` to confirm the current `scripts` block.

- [ ] **Step 2: Add release scripts**

Edit `package.json`, adding these entries inside the existing `"scripts"` object (after `test:coverage`):

```json
    "release:changelog:extract": "bun scripts/release/extractChangelog.ts",
    "release:changelog:promote": "bun scripts/release/promoteChangelog.ts",
    "release:build": "bun scripts/release/buildBinaries.ts",
    "release:checksums": "bun scripts/release/computeChecksums.ts",
    "release:homebrew": "bun scripts/release/renderHomebrewFormula.ts",
    "release:prepare-publish": "bun scripts/release/preparePublish.ts"
```

- [ ] **Step 3: Smoke-test each script via `bun run`**

Run:
```bash
bun run release:prepare-publish
bun run release:changelog:extract 0.1.0-mvp-seed | head -3
```
Expected: workspace dirs listed; first three lines of the MVP-seed CHANGELOG bullets.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: wire release scripts into root package.json"
```

---

## Task 9: `.github/workflows/ci.yml` — typecheck + lint + test gate

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Lint
        run: bun run lint

      - name: Test with coverage
        run: bun run test:coverage

      - name: Upload coverage (Linux only)
        if: matrix.os == 'ubuntu-latest'
        uses: actions/upload-artifact@v4
        with:
          name: coverage-lcov
          path: coverage/lcov.info
          if-no-files-found: error
          retention-days: 7
```

- [ ] **Step 2: Validate the YAML parses**

Run: `bun -e 'import yaml from "js-yaml"; console.log(Object.keys(yaml.load(await Bun.file(".github/workflows/ci.yml").text())))'`

If `js-yaml` isn't installed, skip the runtime parse and validate by eye; GitHub itself rejects malformed YAML on first push.

Simpler acceptable check — verify the file is non-empty and well-formed via `cat`:
```bash
wc -l .github/workflows/ci.yml
```
Expected: ~35–40 lines.

- [ ] **Step 3: Push a test branch and watch CI run**

After committing, push the branch and open a PR so GitHub Actions fires. Verify the Actions tab shows both `ubuntu-latest` and `macos-latest` jobs green.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck + lint + test workflow on PR and main pushes"
```

---

## Task 10: `.github/workflows/release.yml` — tag-triggered multi-arch release

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            target: darwin-arm64
          - os: macos-13
            target: darwin-x64
          - os: ubuntu-latest
            target: linux-x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - run: bun install --frozen-lockfile
      - run: bun run release:build -- --target ${{ matrix.target }}
      - uses: actions/upload-artifact@v4
        with:
          name: zl-${{ matrix.target }}
          path: dist/zl-${{ matrix.target }}
          if-no-files-found: error
          retention-days: 1

  release:
    needs: build
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.value }}
      release_url_base: ${{ steps.version.outputs.url_base }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - run: bun install --frozen-lockfile

      - id: version
        name: Derive version from tag
        run: |
          TAG="${GITHUB_REF_NAME}"
          VERSION="${TAG#v}"
          echo "value=$VERSION" >> "$GITHUB_OUTPUT"
          echo "url_base=https://github.com/${{ github.repository }}/releases/download/${TAG}" >> "$GITHUB_OUTPUT"

      - uses: actions/download-artifact@v4
        with:
          path: dist
          merge-multiple: true

      - name: Compute checksums
        run: bun run release:checksums dist/zl-darwin-arm64 dist/zl-darwin-x64 dist/zl-linux-x64

      - name: Extract release notes from CHANGELOG
        run: bun run release:changelog:extract ${{ steps.version.outputs.value }} > dist/RELEASE_NOTES.md

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body_path: dist/RELEASE_NOTES.md
          files: |
            dist/zl-darwin-arm64
            dist/zl-darwin-x64
            dist/zl-linux-x64
            dist/SHA256SUMS.txt
          fail_on_unmatched_files: true

  publish-npm:
    needs: release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: bun install --frozen-lockfile
      - name: Set package versions from tag
        env:
          VERSION: ${{ needs.release.outputs.version }}
        run: |
          for dir in $(bun run --silent release:prepare-publish); do
            node -e "const fs=require('fs'); const p=require('./'+process.argv[1]+'/package.json'); p.version=process.env.VERSION; fs.writeFileSync(process.argv[1]+'/package.json', JSON.stringify(p,null,2)+'\n')" "$dir"
          done
      - name: Publish each workspace package
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          for dir in $(bun run --silent release:prepare-publish); do
            echo "--- publishing $dir"
            (cd "$dir" && npm publish --access public)
          done

  update-homebrew:
    needs: [release, publish-npm]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.x
      - run: bun install --frozen-lockfile

      - name: Download release artifacts
        uses: actions/download-artifact@v4
        with:
          path: dist
          merge-multiple: true

      - name: Re-compute checksums (for formula)
        id: sums
        run: |
          bun run release:checksums dist/zl-darwin-arm64 dist/zl-darwin-x64 dist/zl-linux-x64
          {
            echo "darwin_arm64=$(grep zl-darwin-arm64 dist/SHA256SUMS.txt | cut -d' ' -f1)"
            echo "darwin_x64=$(grep zl-darwin-x64 dist/SHA256SUMS.txt | cut -d' ' -f1)"
            echo "linux_x64=$(grep zl-linux-x64 dist/SHA256SUMS.txt | cut -d' ' -f1)"
          } >> "$GITHUB_OUTPUT"

      - name: Render formula
        env:
          VERSION: ${{ needs.release.outputs.version }}
          URL_BASE: ${{ needs.release.outputs.release_url_base }}
          ARM64: ${{ steps.sums.outputs.darwin_arm64 }}
          X64: ${{ steps.sums.outputs.darwin_x64 }}
          LINUX: ${{ steps.sums.outputs.linux_x64 }}
        run: |
          bun run release:homebrew "$VERSION" "$URL_BASE" "$ARM64" "$X64" "$LINUX" > zl.rb

      - name: Push formula to tap repo
        env:
          TAP_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
          VERSION: ${{ needs.release.outputs.version }}
        run: |
          git config --global user.name "zero-line release bot"
          git config --global user.email "release-bot@users.noreply.github.com"
          git clone "https://x-access-token:${TAP_TOKEN}@github.com/swissonid/homebrew-tap.git" tap
          mkdir -p tap/Formula
          mv zl.rb tap/Formula/zl.rb
          cd tap
          git add Formula/zl.rb
          git commit -m "zl ${VERSION}" || { echo "no changes to commit"; exit 0; }
          git push origin HEAD:main
```

- [ ] **Step 2: Sanity-check the YAML structure**

Open the file and verify:
- `on.push.tags` is `["v*"]`.
- Matrix includes all three targets with the right runner OSes.
- `release` job depends on `build`; `publish-npm` depends on `release`; `update-homebrew` depends on both.
- No hard-coded secrets in the file.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered release workflow (build, notes, GH release, npm, brew)"
```

---

## Task 11: Bootstrap `swissonid/homebrew-tap` repo

**Files:** *(this task operates on a sibling repo, not `zero-line`)*
- Create (in `swissonid/homebrew-tap`): `README.md`
- Create (in `swissonid/homebrew-tap`): `.gitkeep` under `Formula/` (until the first release overwrites with `zl.rb`)

- [ ] **Step 1: Create the tap repo on GitHub**

On GitHub, create a new public repo at `github.com/swissonid/homebrew-tap`. Homebrew requires the prefix `homebrew-` in the name so `brew tap swissonid/tap` resolves.

- [ ] **Step 2: Clone and add a minimal scaffold**

```bash
cd /tmp
git clone git@github.com:swissonid/homebrew-tap.git
cd homebrew-tap
mkdir -p Formula
touch Formula/.gitkeep
```

Create `README.md`:

```markdown
# swissonid/homebrew-tap

Homebrew tap for [zero-line](https://github.com/swissonid/zero-line).

## Install

```sh
brew tap swissonid/tap
brew install zl
```

## Formulae

| Name | Description |
|---|---|
| `zl` | Mobile-first CI/CD toolkit (zero-line CLI). |

Formulae are updated automatically by the zero-line release workflow on every `v*` tag.
```

- [ ] **Step 3: Commit and push in the tap repo**

```bash
git add README.md Formula/.gitkeep
git commit -m "chore: scaffold tap"
git push -u origin main
```

- [ ] **Step 4: Create `HOMEBREW_TAP_TOKEN` secret on the zero-line repo**

On `github.com/<user>/<repo>/settings/secrets/actions`:
- Create a Personal Access Token (fine-grained) with `Contents: Read and Write` permission on `swissonid/homebrew-tap`.
- Store it as the repo secret `HOMEBREW_TAP_TOKEN` on `swissonid/zero-line`.

- [ ] **Step 5: Commit the documentation in this repo**

Nothing to commit in `zero-line` for this task beyond what Task 13 (runbook) lands. If the runbook is already in a prior PR, skip. Otherwise: no commit, just Linear comment linking to the tap repo and confirming the secret was added.

---

## Task 12: Create `NPM_TOKEN` secret on zero-line repo

**Files:** *(no file changes; GitHub settings only)*

- [ ] **Step 1: Create a granular npm automation token**

On `npmjs.com` → Access Tokens → Generate New Token → Granular:
- Scope: `@zl/*`
- Permissions: Read and write
- Expiry: 365 days (renew annually — note the date in the runbook).

- [ ] **Step 2: Add the token as a GitHub Actions secret**

On `github.com/swissonid/zero-line/settings/secrets/actions`:
- New repository secret: `NPM_TOKEN` = the token from Step 1.

- [ ] **Step 3: Verify on the `@zl` scope page the publish user is authorized**

Navigate to `npmjs.com/settings/<user>/packages`. Confirm `@zl` scope exists and is marked as a public scope (needed for free publishing).

- [ ] **Step 4: Document completion**

Leave a comment on the Linear ticket noting: "NPM_TOKEN added, token expiry: YYYY-MM-DD, renewal owner: <user>". (The runbook from Task 13 stores this permanently.)

---

## Task 13: Release runbook + README install section + branch protection docs

**Files:**
- Create: `docs/superpowers/notes/releasing.md`
- Modify: `README.md`

- [ ] **Step 1: Create `docs/superpowers/notes/releasing.md`**

```markdown
# Releasing `zl`

This runbook documents how a release flows from a merged PR on `main` through to a published Homebrew bottle and npm packages.

## What happens on every PR

- The CI workflow (`.github/workflows/ci.yml`) runs typecheck + lint + test on both `ubuntu-latest` and `macos-latest`.
- Branch protection on `main` requires:
  - `check (ubuntu-latest)` and `check (macos-latest)` to be green.
  - At least one approving review (or solo-maintainer bypass, depending on project config).
  - Up-to-date branch before merge.
- **Every PR adds at least one bullet to `## [Unreleased]` in `CHANGELOG.md`.** Phrase bullets for users ("Added `zl doctor` command"), not for reviewers.

## What happens on a `v*` tag

1. **Build job (matrix)** — `bun build --compile` for `darwin-arm64`, `darwin-x64`, `linux-x64`. Each binary uploaded as a workflow artifact.
2. **Release job** — downloads all three artifacts; computes SHA-256 sums; extracts the tag's section from `CHANGELOG.md`; creates the GitHub Release with the three binaries + `SHA256SUMS.txt` + the extracted notes as the body.
3. **Publish-npm job** — rewrites each workspace `package.json` to use the tag version, runs `npm publish --access public` in topological order (core → cli → step-hello, and any future plugins).
4. **Update-homebrew job** — renders `Formula/zl.rb` with the tag version + the checksums; clones `swissonid/homebrew-tap`; commits and pushes the updated formula.

## How to cut a release

**Prep (in the release PR that bumps CHANGELOG):**

```bash
# Pick a version according to semver. Examples: 0.2.0, 1.0.0, 1.0.1, 1.0.0-rc.1.
VERSION=0.2.0

# Promote [Unreleased] → [VERSION] - <today>.
bun run release:changelog:promote "$VERSION" "$(date -u +%Y-%m-%d)"

git add CHANGELOG.md
git commit -m "chore: release v${VERSION}"
git push -u origin release/v${VERSION}
# Open PR, wait for green CI, merge to main.
```

**Tag and trigger release:**

```bash
git checkout main
git pull
git tag -a "v${VERSION}" -m "zl v${VERSION}"
git push origin "v${VERSION}"
```

Watch the `release` workflow on the Actions tab. When all four jobs are green:
- GitHub Release page shows three binaries + `SHA256SUMS.txt` + notes.
- `brew update && brew install swissonid/tap/zl` resolves to the new version.
- `npm view @zl/cli version` returns the new version.

## Secrets

- `NPM_TOKEN` — granular automation token scoped to `@zl/*`, read+write. Renews annually. Rotation owner: Patrice.
- `HOMEBREW_TAP_TOKEN` — fine-grained PAT, `Contents: Read and Write` on `swissonid/homebrew-tap`. Renews annually. Rotation owner: Patrice.

## Hotfix workflow

1. Branch off the broken tag: `git checkout -b hotfix/v0.2.1 v0.2.0`.
2. Cherry-pick or write the fix.
3. Open PR *against `main`* (not against the tag). Land it.
4. Tag a patch: `git tag -a v0.2.1 -m "zl v0.2.1" && git push origin v0.2.1`.

## Rollback

Releases are immutable once the workflow runs. If a release is broken:
- Tag a new patch with the fix (preferred).
- If the release must be retracted: mark the GitHub Release as a pre-release; `npm unpublish` within the 72-hour window if catastrophic; update the tap formula to point at the last good version.

## Dry-run tactics (before M-A4 cuts v0.1.0)

- Run each release script locally (`bun run release:build`, `release:checksums`, `release:homebrew`) to verify outputs.
- Push a throwaway pre-release tag (e.g. `v0.0.0-dry.1`) on a fork; watch the workflow end-to-end in a sandbox.
- Delete the tag + release before proceeding.

## Branch protection setup (one-time, after CI is green)

On `github.com/swissonid/zero-line/settings/branches`:
- Add rule for `main`:
  - Require a pull request before merging (1 approval).
  - Require status checks to pass before merging.
    - Select: `check (ubuntu-latest)`, `check (macos-latest)`.
  - Require branches to be up to date before merging.
  - Do not allow bypassing — except for a self-maintainer during solo periods.
```

- [ ] **Step 2: Add an Install section to `README.md`**

Add a new section to `README.md` after the "What is `zl`?" intro (or near the top, above any other install-adjacent content):

```markdown
## Install

```sh
brew tap swissonid/tap
brew install zl
```

Prebuilt binaries for macOS (arm64, x64) and Linux (x64) are attached to every [GitHub Release](https://github.com/swissonid/zero-line/releases) alongside SHA-256 sums.

The workspace packages (`@zl/core`, `@zl/cli`, `@zl/step-*`) are also published to npm under the `@zl` scope.
```

Use Edit (not Write) — grep for an existing section to anchor the insertion above.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/notes/releasing.md README.md
git commit -m "docs: add release runbook and README install section"
```

---

## Task 14: Enforce `## [Unreleased]` bullet in CI

**Files:**
- Create: `scripts/release/checkUnreleasedBullet.ts`
- Create: `scripts/release/checkUnreleasedBullet.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests**

Create `scripts/release/checkUnreleasedBullet.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { hasUnreleasedBullet } from "./checkUnreleasedBullet"

describe("hasUnreleasedBullet", () => {
  it("returns true when [Unreleased] contains at least one bullet", () => {
    const text = `## [Unreleased]\n\n### Added\n\n- a thing\n\n## [0.1.0]\n`
    expect(hasUnreleasedBullet(text)).toBe(true)
  })

  it("returns false when [Unreleased] is empty", () => {
    const text = `## [Unreleased]\n\n### Added\n\n### Fixed\n\n## [0.1.0]\n`
    expect(hasUnreleasedBullet(text)).toBe(false)
  })

  it("throws when [Unreleased] is missing entirely", () => {
    expect(() => hasUnreleasedBullet("## [0.1.0]\n")).toThrow(/not found/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/release/checkUnreleasedBullet.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `hasUnreleasedBullet` with a PR-aware CLI**

Create `scripts/release/checkUnreleasedBullet.ts`:

```ts
const UNRELEASED_HEADING = "## [Unreleased]"

export function hasUnreleasedBullet(text: string): boolean {
  const lines = text.split("\n")
  const startIdx = lines.findIndex((l) => l.trim() === UNRELEASED_HEADING)
  if (startIdx === -1) throw new Error("Unreleased section not found")
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      endIdx = i
      break
    }
  }
  const body = lines.slice(startIdx + 1, endIdx).join("\n")
  return /^\s*-\s+\S/m.test(body)
}

if (import.meta.main) {
  // Opt-out escape hatch: docs-only / tooling-only PRs can set CHANGELOG_SKIP=1 to bypass.
  if (process.env.CHANGELOG_SKIP === "1") {
    console.log("CHANGELOG_SKIP=1 — skipping [Unreleased] bullet check")
    process.exit(0)
  }
  const text = await Bun.file("CHANGELOG.md").text()
  if (!hasUnreleasedBullet(text)) {
    console.error(
      "CHANGELOG.md [Unreleased] section has no bullets. Add a user-facing bullet under Added/Changed/Fixed/etc. before merging, or set CHANGELOG_SKIP=1 for docs/tooling-only PRs.",
    )
    process.exit(1)
  }
  console.log("CHANGELOG [Unreleased] has a bullet — OK")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/release/checkUnreleasedBullet.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Add script to `package.json`**

Under `"scripts"` in `package.json`, add:

```json
    "release:check-changelog": "bun scripts/release/checkUnreleasedBullet.ts"
```

- [ ] **Step 6: Wire into CI**

Edit `.github/workflows/ci.yml`. After the "Test with coverage" step, add:

```yaml
      - name: Verify CHANGELOG [Unreleased] bullet
        if: github.event_name == 'pull_request' && matrix.os == 'ubuntu-latest'
        run: bun run release:check-changelog
```

(Gated on PRs only, and only on the Linux matrix leg — we don't need it running twice.)

- [ ] **Step 7: Smoke-test locally**

Run: `bun run release:check-changelog`
Expected (given current seeded CHANGELOG has empty `## [Unreleased]`): FAIL with the descriptive error.

Add one bullet under `## [Unreleased]` → `### Added`:

```markdown
- CI + release workflows, Homebrew tap, CHANGELOG discipline (M-A3).
```

Re-run: `bun run release:check-changelog`
Expected: "CHANGELOG [Unreleased] has a bullet — OK".

Keep that bullet — it's the real M-A3 entry for the next release.

- [ ] **Step 8: Commit**

```bash
git add scripts/release/checkUnreleasedBullet.ts \
        scripts/release/checkUnreleasedBullet.test.ts \
        .github/workflows/ci.yml \
        package.json \
        CHANGELOG.md
git commit -m "ci: enforce CHANGELOG [Unreleased] bullet per PR"
```

---

## Self-review

**1. Spec coverage (roadmap §M-A → Distribution & docs):**

| Spec item | Task |
|---|---|
| `.github/workflows/ci.yml` — typecheck + lint + test on PRs and pushes to `main` | Task 9 |
| Branch protection requires green CI | Task 13 (runbook documents setup) |
| `.github/workflows/release.yml` — triggered on `v*` tags | Task 10 |
| Matrix build for darwin-arm64, darwin-x64, linux-x64 | Tasks 4, 10 |
| Extracts tag's section from `CHANGELOG.md` and posts as GH Release body | Tasks 2, 10 |
| Uploads binaries + SHA-256 sums | Tasks 5, 10 |
| Publishes each changed workspace package to npm | Tasks 7, 10, 12 |
| Updates `swissonid/homebrew-tap` formula | Tasks 6, 10, 11 |
| Seed `CHANGELOG.md` at repo root (Keep a Changelog), historical MVP work as initial section | Task 1 |
| Per-PR CHANGELOG bullet discipline | Task 14 |
| On-tag: rename `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD`, seed fresh `## [Unreleased]` | Task 3 |
| Own Homebrew tap: `swissonid/homebrew-tap` with `Formula/zl.rb` | Task 11 |

**Not in this plan (intentionally deferred):**
- E2E integration test (ZER-28) → M-A4.
- `@zl/core@0.1.0` freeze → M-A1 Task 16.
- First real `v0.1.0` tag → M-A4.
- README rewrite (ZER-101) → already Done.

**2. Placeholder scan:** searched for "TBD", "TODO", "implement later", "similar to" — only legitimate `TBD` is the seeded `## [0.1.0]` date, which is moot after Task 1 renames that heading to `## [0.1.0-mvp-seed]`. No other placeholders.

**3. Type consistency:**
- `extractChangelog(text, version)` signature matches across Tasks 2, 10.
- `promoteChangelog(text, version, isoDate)` signature matches across Tasks 3, 13.
- `renderHomebrewFormula({ version, releaseUrlBase, darwinArm64Sha256, darwinX64Sha256, linuxX64Sha256 })` — same field names in Tasks 6 and 10.
- `buildBinaries` emits `dist/zl-<target>` where `<target>` is one of `darwin-arm64 | darwin-x64 | linux-x64` — matches release workflow's download/upload paths.
- `computeChecksums` writes `dist/SHA256SUMS.txt` — matches what the release workflow uploads and what update-homebrew greps.

All consistent.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-m-a3-release-tooling.md`.

Recommended next step: file 14 Linear tickets (one per task) under the "M-A Foundation" milestone in the `zero-line MVP` project, then pick execution style:

**1. Subagent-Driven (recommended)** — fresh subagent per ticket, review between, fast iteration.
**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch with checkpoints.
