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

  // Guard against re-promoting a version that already has a heading.
  const duplicateHeadingRe = new RegExp(
    `^##\\s+\\[${version.replace(/\./g, "\\.")}\\](?:\\s|$)`,
    "m",
  )
  if (duplicateHeadingRe.test(text)) {
    throw new Error(`version ${version} already exists in the changelog`)
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

  const renamedHeading = `## [${version}] - ${isoDate}`
  const replacedLines = [
    ...lines.slice(0, startIdx),
    ...FRESH_UNRELEASED.split("\n"),
    "",
    renamedHeading,
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
