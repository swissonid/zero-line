#!/usr/bin/env bun
import { loadConfig } from "@zl/core"
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

const projectDir = process.cwd()
const platformFlag = args.indexOf("--platform")
const platform = platformFlag !== -1 ? (args[platformFlag + 1] as "ios" | "android") : undefined
const verbose = args.includes("--verbose")

async function main() {
  try {
    const workflowName = command === "run" ? args[1] : command

    if (!workflowName) {
      console.error("Please specify a workflow name. Run 'zl --help' for usage.")
      process.exit(1)
    }

    if (command === "list") {
      const config = await loadConfig(projectDir)
      console.log("\nWorkflows:")
      for (const [name, steps] of Object.entries(config.workflows)) {
        console.log(`  ${name}: ${(steps as string[]).join(" → ")}`)
      }
      process.exit(0)
    }

    // For now, steps are loaded at runtime from config imports
    // This will be enhanced when we have real step packages
    const config = await loadConfig(projectDir)

    const allStepInstances = [
      ...(config.steps ?? []),
      ...(platform
        ? config.platforms[platform]?.steps ?? []
        : Object.values(config.platforms).flatMap((p) => p?.steps ?? [])),
    ]

    const success = await runWorkflow({
      workflowName,
      projectDir,
      platform,
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
