import { Glob } from "bun"
import { dirname } from "node:path"

export interface WorkspacePkg {
  readonly dir: string
  readonly name: string
  readonly deps: readonly string[]
}

export function topoSortWorkspaces(
  pkgs: readonly WorkspacePkg[],
): readonly WorkspacePkg[] {
  const nameSet = new Set(pkgs.map((p) => p.name))
  const byName = new Map(pkgs.map((p) => [p.name, p]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const ordered: WorkspacePkg[] = []

  function visit(pkg: WorkspacePkg): void {
    if (visited.has(pkg.name)) return
    if (visiting.has(pkg.name)) {
      throw new Error(`dependency cycle detected at ${pkg.name}`)
    }
    visiting.add(pkg.name)
    for (const d of pkg.deps) {
      if (!nameSet.has(d)) continue
      visit(byName.get(d)!)
    }
    visiting.delete(pkg.name)
    visited.add(pkg.name)
    ordered.push(pkg)
  }

  for (const p of pkgs) visit(p)
  return ordered
}

async function discoverWorkspaces(): Promise<readonly WorkspacePkg[]> {
  const root = JSON.parse(await Bun.file("package.json").text()) as {
    workspaces?: string[]
  }
  const patterns = root.workspaces ?? []
  const found: WorkspacePkg[] = []
  for (const pattern of patterns) {
    const glob = new Glob(`${pattern}/package.json`)
    for await (const match of glob.scan({ cwd: "." })) {
      const pkgJson = JSON.parse(await Bun.file(match).text()) as {
        name: string
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
      }
      const deps = [
        ...Object.keys(pkgJson.dependencies ?? {}),
        ...Object.keys(pkgJson.peerDependencies ?? {}),
      ]
      found.push({ dir: dirname(match), name: pkgJson.name, deps })
    }
  }
  return found
}

if (import.meta.main) {
  const ws = await discoverWorkspaces()
  for (const p of topoSortWorkspaces(ws)) {
    console.log(p.dir)
  }
}
