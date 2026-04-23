export const ALL_TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
] as const

export type Target = (typeof ALL_TARGETS)[number]

export function targetToBunFlag(target: Target): string {
  return `bun-${target}`
}

export function outFileForTarget(target: Target): string {
  return `dist/zl-${target}`
}

export function parseBuildArgs(argv: readonly string[]): readonly Target[] {
  const idx = argv.indexOf("--target")
  if (idx === -1) return ALL_TARGETS
  const raw = argv[idx + 1]
  if (!raw || !(ALL_TARGETS as readonly string[]).includes(raw)) {
    throw new Error(`unknown target: ${raw ?? "(missing)"}`)
  }
  return [raw as Target]
}

async function runBuild(target: Target): Promise<void> {
  const flag = targetToBunFlag(target)
  const out = outFileForTarget(target)
  console.log(`building ${out} (--target ${flag})`)
  const proc = Bun.spawn(
    [
      "bun",
      "build",
      "packages/cli/src/index.ts",
      "--compile",
      "--target",
      flag,
      "--outfile",
      out,
    ],
    { stdout: "inherit", stderr: "inherit" },
  )
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`bun build failed for ${target} (exit ${code})`)
  }
}

if (import.meta.main) {
  const targets = parseBuildArgs(Bun.argv.slice(2))
  await Bun.write("dist/.gitkeep", "")
  const failed: Target[] = []
  for (const t of targets) {
    try {
      await runBuild(t)
    } catch (err) {
      console.error(String(err))
      failed.push(t)
    }
  }
  if (failed.length > 0) {
    console.error(`failed targets: ${failed.join(", ")}`)
    process.exit(1)
  }
  console.log(`built ${targets.length} binary/binaries`)
}
