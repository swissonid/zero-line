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
      // Mirror the real `makePrompt` contract: when the scripted answer is
      // empty and a default is provided, return the default. This keeps tests
      // honest about what callers actually observe from a user hitting
      // <enter>.
      prompt: async (q, opts) => {
        prompts.push(q)
        if (answers.length === 0) {
          throw new Error(`makeIO: no scripted answer available for prompt '${q}'`)
        }
        const answer = answers.shift()!
        if (answer.length === 0 && opts?.default !== undefined) {
          return opts.default
        }
        return answer
      },
    },
    out,
    err,
    prompts,
  }
}
