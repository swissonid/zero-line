import { describe, expect, it } from "bun:test"
import { topoSortWorkspaces } from "./preparePublish"

describe("topoSortWorkspaces", () => {
  it("places @zl/core before dependents", () => {
    const pkgs = [
      {
        dir: "packages/cli",
        name: "@zl/cli",
        deps: ["@zl/core"],
      },
      {
        dir: "packages/core",
        name: "@zl/core",
        deps: [],
      },
      {
        dir: "packages/steps/hello/hello",
        name: "@zl/step-hello",
        deps: ["@zl/core"],
      },
    ]
    const ordered = topoSortWorkspaces(pkgs)
    const idx = (n: string) => ordered.findIndex((p) => p.name === n)
    expect(idx("@zl/core")).toBeLessThan(idx("@zl/cli"))
    expect(idx("@zl/core")).toBeLessThan(idx("@zl/step-hello"))
  })

  it("is stable for independent packages (input order preserved)", () => {
    const pkgs = [
      { dir: "a", name: "@zl/a", deps: [] },
      { dir: "b", name: "@zl/b", deps: [] },
    ]
    const ordered = topoSortWorkspaces(pkgs)
    expect(ordered.map((p) => p.name)).toEqual(["@zl/a", "@zl/b"])
  })

  it("throws on a dependency cycle", () => {
    const pkgs = [
      { dir: "a", name: "@zl/a", deps: ["@zl/b"] },
      { dir: "b", name: "@zl/b", deps: ["@zl/a"] },
    ]
    expect(() => topoSortWorkspaces(pkgs)).toThrow(/cycle/i)
  })

  it("ignores external (non-workspace) dependencies", () => {
    const pkgs = [
      { dir: "a", name: "@zl/a", deps: ["effect", "@zl/core"] },
      { dir: "core", name: "@zl/core", deps: [] },
    ]
    const ordered = topoSortWorkspaces(pkgs)
    expect(ordered[0].name).toBe("@zl/core")
    expect(ordered[1].name).toBe("@zl/a")
  })
})
