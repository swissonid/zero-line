import { defaultPrompt, type Prompt } from "./prompts"

export interface CliIO {
  readonly stdout: (msg: string) => void
  readonly stderr: (msg: string) => void
  readonly prompt: Prompt
}

export const defaultIO: CliIO = {
  stdout: (msg) => console.log(msg),
  stderr: (msg) => console.error(msg),
  prompt: defaultPrompt,
}
