import { Effect } from "effect"
import {
  ConfigService,
  makeFileConfigLayer,
  resolveStepInstances,
  unwrapDefaultExport,
  validateStepOptions,
  type Platform,
  type OptionsPluginLoader,
  type PluginLike,
  type ZlConfig,
} from "@zl/core"
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

interface ParsedArgs {
  readonly command: string
  readonly workflowName: string
  readonly platform: Platform | undefined
}

function parseArgs(
  args: ReadonlyArray<string>,
  io: CliIO
): ParsedArgs | number {
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
  if (!workflowName || workflowName.startsWith("-")) {
    io.stderr("Please specify a workflow name. Run 'zl --help' for usage.")
    return 1
  }
  return { command, workflowName, platform }
}

function collectInstances(config: ZlConfig, platform: Platform | undefined) {
  return [
    ...(config.steps ?? []),
    ...(platform
      ? config.platforms[platform]?.steps ?? []
      : Object.values(config.platforms).flatMap((p) => p?.steps ?? [])),
  ]
}

// Load a plugin for validateStepOptions by importing its package and
// returning the default/namespace export. `null` means "not installed" —
// options validation is skipped for that step instance. `unwrapDefaultExport`
// handles the `mod.default ?? mod` fallback with a Schema-guarded boundary
// (see @zl/core) so there's no `as Record<string, unknown>` cast here.
const pluginLookup: OptionsPluginLoader = async (name) => {
  try {
    return unwrapDefaultExport(await import(name)) as PluginLike
  } catch {
    return null
  }
}

export async function runCli(
  args: ReadonlyArray<string>,
  opts: RunCliOptions
): Promise<number> {
  const io = opts.io ?? defaultIO
  const parsed = parseArgs(args, io)
  if (typeof parsed === "number") return parsed

  const program = Effect.gen(function* () {
    const service = yield* ConfigService
    const config = yield* service.load()

    if (parsed.command === "list") {
      io.stdout("\nWorkflows:")
      for (const [name, steps] of Object.entries(config.workflows)) {
        io.stdout(`  ${name}: ${(steps as string[]).join(" → ")}`)
      }
      return 0
    }

    yield* validateStepOptions(config, pluginLookup)

    const instances = collectInstances(config, parsed.platform)
    const resolved = yield* resolveStepInstances(instances)

    // Task 12 (ZER-112) will change Pipeline to accept ResolvedStep[] and
    // thread bound options through. Until then we pass the plugin steps in
    // the pre-existing Pipeline shape.
    const success = yield* runWorkflow({
      workflowName: parsed.workflowName,
      config,
      steps: resolved.map((r) => r.plugin),
      io,
    })
    return success ? 0 : 1
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(makeFileConfigLayer(opts.cwd)),
      Effect.catchAll((err) =>
        Effect.sync(() => {
          io.stderr(errorMessage(err))
          return 1
        })
      )
    )
  )
}

// Coerce an unknown-shaped failure into a human-readable string. The
// Effect error channel may carry a plain class (e.g. ConfigLoadError)
// that doesn't extend Error — duck-type `.message` before falling back
// to String(err).
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as Record<string, unknown>).message
    if (typeof msg === "string") return msg
  }
  return String(err)
}
