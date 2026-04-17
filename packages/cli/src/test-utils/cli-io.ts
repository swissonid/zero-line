import type { CliIO } from "../io"

export interface MakeIOOptions {
  readonly answers?: ReadonlyArray<string>
}

export function makeIO(
  options: MakeIOOptions = {}
): { io: CliIO; out: string[]; err: string[]; prompts: string[] } {
  const out: string[] = []
  const err: string[] = []
  const prompts: string[] = []
  const answers = [...(options.answers ?? [])]
  return {
    io: {
      stdout: (m) => out.push(m),
      stderr: (m) => err.push(m),
      prompt: async (q) => {
        prompts.push(q)
        if (answers.length === 0) {
          throw new Error(`makeIO: no scripted answer available for prompt '${q}'`)
        }
        return answers.shift()!
      },
    },
    out,
    err,
    prompts,
  }
}
