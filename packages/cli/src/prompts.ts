export interface PromptDeps {
  readonly read: () => Promise<string>
  readonly write: (msg: string) => void
}

export interface PromptOptions {
  readonly default?: string
}

export type Prompt = (question: string, opts?: PromptOptions) => Promise<string>

export function makePrompt(deps: PromptDeps): Prompt {
  return async (question, opts) => {
    const suffix = opts?.default ? ` [${opts.default}]` : ""
    deps.write(`${question}${suffix} `)
    const raw = await deps.read()
    const trimmed = raw.replace(/\r?\n$/, "").trim()
    if (trimmed.length === 0 && opts?.default !== undefined) return opts.default
    return trimmed
  }
}

async function readLineFromStdin(): Promise<string> {
  // `Bun.stdin.stream()` yields Uint8Arrays; we read until the first newline.
  const decoder = new TextDecoder()
  let buf = ""
  for await (const chunk of Bun.stdin.stream()) {
    buf += decoder.decode(chunk)
    const nl = buf.indexOf("\n")
    if (nl !== -1) return buf.slice(0, nl + 1)
  }
  return buf
}

export const defaultPrompt: Prompt = makePrompt({
  read: readLineFromStdin,
  write: (m) => process.stdout.write(m),
})
