export interface StepRegistration {
  readonly packageName: string
  readonly shortName: string
  readonly isOfficial?: boolean
}

export interface Collision {
  readonly shortName: string
  readonly packages: ReadonlyArray<string>
  readonly resolution: string
}

export function resolveShortName(packageName: string): string {
  // @zl/step-build → build
  const zlMatch = packageName.match(/^@zl\/step-(.+)$/)
  if (zlMatch) return zlMatch[1]

  // @acme/zl-step-screenshot → acme/screenshot
  const thirdPartyMatch = packageName.match(/^@(.+)\/zl-step-(.+)$/)
  if (thirdPartyMatch) return `${thirdPartyMatch[1]}/${thirdPartyMatch[2]}`

  // Plain name (e.g. local step)
  return packageName
}

export function detectCollisions(
  steps: ReadonlyArray<StepRegistration>
): ReadonlyArray<Collision> {
  const byShortName = new Map<string, StepRegistration[]>()

  for (const step of steps) {
    const existing = byShortName.get(step.shortName) ?? []
    existing.push(step)
    byShortName.set(step.shortName, existing)
  }

  const collisions: Collision[] = []

  for (const [shortName, registrations] of byShortName) {
    if (registrations.length <= 1) continue

    const official = registrations.find((r) => r.isOfficial)
    const others = registrations.filter((r) => !r.isOfficial)

    let resolution: string
    if (official) {
      const otherNames = others
        .map((r) => {
          const scoped = resolveShortName(r.packageName)
          return `'${scoped}' for ${r.packageName}`
        })
        .join(" and ")
      resolution = `Use '${shortName}' for ${official.packageName} (official) and ${otherNames}`
    } else {
      const allNames = registrations
        .map((r) => `'${resolveShortName(r.packageName)}' for ${r.packageName}`)
        .join(" and ")
      resolution = `Ambiguous '${shortName}'. Use scoped names: ${allNames}`
    }

    collisions.push({
      shortName,
      packages: registrations.map((r) => r.packageName),
      resolution,
    })
  }

  return collisions
}
