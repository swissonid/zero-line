const VERSION_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/

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
