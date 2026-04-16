import { loadConfig, type Platform } from "@zl/core"
import { runWorkflow } from "./commands/run"
import { defaultIO, type CliIO } from "./io"

export { defaultIO, type CliIO }

const VALID_PLATFORMS: ReadonlyArray<Platform> = ["ios", "android"]
const VALID_PLATFORMS_HINT = `Must be one of: ${VALID_PLATFORMS.join(", ")}`

const HELP_TEXT = `
zero-line (zl) — Mobile CI/CD toolkit

Usage:
  zl <workflow>              Run a workflow
  zl run <workflow>          Run a workflow (explicit)
  zl list                    List workflows and steps
  zl init                    Scaffold zl.config.ts
  zl doctor                  Check environment
  zl --help                  Show this help

Options:
  --platform <ios|android>   Run only one platform
`

export interface RunCliOptions {
  readonly cwd: string
  readonly io?: CliIO
}

export async function runCli(
  args: ReadonlyArray<string>,
  opts: RunCliOptions
): Promise<number> {
  const io = opts.io ?? defaultIO
  const command = args[0]

  if (!command || command === "--help" || command === "-h") {
    io.stdout(HELP_TEXT)
    return 0
  }

  const platformFlag = args.indexOf("--platform")
  const rawPlatform = platformFlag !== -1 ? args[platformFlag + 1] : undefined
  if (platformFlag !== -1 && rawPlatform === undefined) {
    io.stderr(`--platform requires a value. ${VALID_PLATFORMS_HINT}`)
    return 1
  }
  if (rawPlatform && !VALID_PLATFORMS.includes(rawPlatform as Platform)) {
    io.stderr(`Invalid platform '${rawPlatform}'. ${VALID_PLATFORMS_HINT}`)
    return 1
  }
  const platform = rawPlatform as Platform | undefined
  const workflowName = command === "run" ? args[1] : command

  if (!workflowName) {
    io.stderr("Please specify a workflow name. Run 'zl --help' for usage.")
    return 1
  }

  try {
    const config = await loadConfig(opts.cwd)

    if (command === "list") {
      io.stdout("\nWorkflows:")
      for (const [name, steps] of Object.entries(config.workflows)) {
        io.stdout(`  ${name}: ${(steps as string[]).join(" → ")}`)
      }
      return 0
    }

    const allStepInstances = [
      ...(config.steps ?? []),
      ...(platform
        ? config.platforms[platform]?.steps ?? []
        : Object.values(config.platforms).flatMap((p) => p?.steps ?? [])),
    ]

    const success = await runWorkflow({
      workflowName,
      config,
      steps: allStepInstances as any,
      io,
    })

    return success ? 0 : 1
  } catch (err) {
    io.stderr(err instanceof Error ? err.message : String(err))
    return 1
  }
}
