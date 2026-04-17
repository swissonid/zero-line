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

  it("throws when promoting a version that already exists in the changelog", () => {
    const input = `# Changelog

${UNRELEASED_WITH_BULLETS}
## [0.2.0] - 2025-01-01

### Added

- existing
`
    expect(() => promoteChangelog(input, "0.2.0", "2026-05-21")).toThrow(
      /already exists/i,
    )
  })
})
