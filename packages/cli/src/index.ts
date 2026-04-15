#!/usr/bin/env bun
import { loadConfig, type Platform } from "@zl/core"
import { runWorkflow } from "./commands/run"

const args = process.argv.slice(2)
const command = args[0]

if (!command || command === "--help" || command === "-h") {
  console.log(`
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
  --verbose                  Show debug output
`)
  process.exit(0)
}

const VALID_PLATFORMS: ReadonlyArray<Platform> = ["ios", "android"]

const projectDir = process.cwd()
const platformFlag = args.indexOf("--platform")
const rawPlatform = platformFlag !== -1 ? args[platformFlag + 1] : undefined
if (rawPlatform && !VALID_PLATFORMS.includes(rawPlatform as Platform)) {
  console.error(`Invalid platform '${rawPlatform}'. Must be one of: ${VALID_PLATFORMS.join(", ")}`)
  process.exit(1)
}
const platform = rawPlatform as Platform | undefined
const verbose = args.includes("--verbose")

async function main() {
  try {
    const workflowName = command === "run" ? args[1] : command

    if (!workflowName) {
      console.error("Please specify a workflow name. Run 'zl --help' for usage.")
      process.exit(1)
    }

    const config = await loadConfig(projectDir)

    if (command === "list") {
      console.log("\nWorkflows:")
      for (const [name, steps] of Object.entries(config.workflows)) {
        console.log(`  ${name}: ${(steps as string[]).join(" → ")}`)
      }
      process.exit(0)
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
      verbose,
      steps: allStepInstances as any,
    })

    process.exit(success ? 0 : 1)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main()
