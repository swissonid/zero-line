export type DoctorStatus = "ok" | "warn" | "fail"

export interface DoctorResult {
  readonly name: string
  readonly status: DoctorStatus
  readonly detail: string
}

const OK = "\x1b[32m✓\x1b[0m"
const WARN = "\x1b[33m!\x1b[0m"
const FAIL = "\x1b[31m✗\x1b[0m"

function icon(s: DoctorStatus): string {
  return s === "ok" ? OK : s === "warn" ? WARN : FAIL
}

export function renderDoctorResults(results: ReadonlyArray<DoctorResult>): string {
  const lines: string[] = []
  let ok = 0, warn = 0, fail = 0
  for (const r of results) {
    lines.push(`  ${icon(r.status)} ${r.name} — ${r.detail}`)
    if (r.status === "ok") ok++
    else if (r.status === "warn") warn++
    else fail++
  }
  lines.push("")
  lines.push(`  ${ok} ok, ${warn} warning, ${fail} failed`)
  return lines.join("\n")
}
