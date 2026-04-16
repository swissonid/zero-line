export interface CliIO {
  readonly stdout: (msg: string) => void
  readonly stderr: (msg: string) => void
}

export const defaultIO: CliIO = {
  stdout: (msg) => console.log(msg),
  stderr: (msg) => console.error(msg),
}
