import { existsSync } from "fs"
import { writeFile } from "fs/promises"
import { join } from "path"
import { defaultIO, type CliIO } from "../io"

/**
 * Interactive scaffold for `zl init`.
 *
 * Returns a Promise<number> (exit code) rather than an Effect because:
 * - The work is IO-heavy but branches on user-supplied answers; an Effect
 *   pipeline here would add ceremony without buying anything (no services
 *   to inject, no error channel to compose with).
 * - The top-level CLI Effect program is only entered *after* config load, and
 *   `init` runs *before* config load (init creates the config). Dispatching
 *   this as a Promise-returning function keeps that "no config needed yet"
 *   boundary obvious in `cli.ts`.
 */

export interface InitOptions {
  readonly cwd: string
  readonly io?: CliIO
  readonly force: boolean
}

const VALID_PLATFORMS: ReadonlySet<string> = new Set(["ios", "android"])

/**
 * Slugify a human app name for use in a default bundle id:
 * - lowercase
 * - replace runs of non-alphanumerics with a single `-`
 * - trim leading/trailing `-`
 *
 * "Cool App 42" -> "cool-app-42"
 * "hello___world" -> "hello-world"
 * "  hi!  " -> "hi"
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function renderConfig(
  name: string,
  bundleId: string,
  platforms: ReadonlyArray<string>
): string {
  const platformEntries = platforms
    .map((p) => `    ${p}: { steps: [{ name: "hello", options: {} }] },`)
    .join("\n")
  return `import { defineConfig } from "@zl/core"

export default defineConfig({
  app: {
    name: "${name}",
    bundleId: "${bundleId}",
  },
  platforms: {
${platformEntries}
  },
  workflows: {
    ci: ["hello"],
  },
})
`
}

export async function runInit(options: InitOptions): Promise<number> {
  const io = options.io ?? defaultIO
  const configPath = join(options.cwd, "zl.config.ts")

  if (existsSync(configPath) && !options.force) {
    io.stderr(
      `zl.config.ts already exists at ${configPath}. Re-run with --force to overwrite.`
    )
    return 1
  }

  const name = (await io.prompt("App name?")).trim()
  if (name.length === 0) {
    io.stderr("App name is required.")
    return 1
  }

  const bundleDefault = `ch.example.${slugify(name)}`
  const bundleId = (
    await io.prompt("Bundle id?", { default: bundleDefault })
  ).trim()

  const platformsRaw = (
    await io.prompt("Target platforms?", { default: "ios,android" })
  ).trim()
  const platforms = platformsRaw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const unknown = platforms.filter((p) => !VALID_PLATFORMS.has(p))
  if (unknown.length > 0) {
    io.stderr(
      `Unknown platform(s): ${unknown.join(", ")}. Supported: ios, android.`
    )
    return 1
  }
  if (platforms.length === 0) {
    io.stderr("At least one platform is required.")
    return 1
  }

  await writeFile(configPath, renderConfig(name, bundleId, platforms), "utf8")

  io.stdout(`\n  \u2713 Wrote ${configPath}`)
  io.stdout(
    `  \u2192 Next: 'zl doctor' to check your toolchain, then 'zl run ci' to run the example workflow.`
  )
  return 0
}
