import type { CliIO } from "../io"

export function makeIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return {
    io: {
      stdout: (m) => out.push(m),
      stderr: (m) => err.push(m),
    },
    out,
    err,
  }
}
