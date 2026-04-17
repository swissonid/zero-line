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
