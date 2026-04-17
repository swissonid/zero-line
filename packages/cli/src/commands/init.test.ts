import { describe, test, expect, afterEach } from "bun:test"
import { mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { runInit, slugify } from "./init"
import { makeIO } from "../test-utils/cli-io"

function tmp(name: string): string {
  const dir = join(import.meta.dir, `__init_tmp_${name}__`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe("slugify", () => {
  test("lowercases the input", () => {
    expect(slugify("MyApp")).toBe("myapp")
  })

  test("replaces runs of non-alphanumerics with a single dash", () => {
    expect(slugify("Cool App 42")).toBe("cool-app-42")
    expect(slugify("hello___world")).toBe("hello-world")
  })

  test("trims leading and trailing dashes", () => {
    expect(slugify("  hello  ")).toBe("hello")
    expect(slugify("!!!hi!!!")).toBe("hi")
  })

  test("returns empty string for input with no alphanumerics", () => {
    expect(slugify("!!!")).toBe("")
  })
})

describe("runInit", () => {
  let dirs: string[] = []
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
    dirs = []
  })

  test("scaffolds zl.config.ts with scripted answers and returns 0", async () => {
    const dir = tmp("happy")
    dirs.push(dir)
    const { io, prompts } = makeIO({
      answers: ["MyApp", "ch.example.myapp", "ios,android"],
    })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(0)
    expect(prompts).toHaveLength(3)
    const written = readFileSync(join(dir, "zl.config.ts"), "utf8")
    expect(written).toContain(`name: "MyApp"`)
    expect(written).toContain(`bundleId: "ch.example.myapp"`)
    expect(written).toContain(`ios:`)
    expect(written).toContain(`android:`)
    expect(written).toContain(`ci:`)
    expect(written).toContain(`hello`)
    expect(written).toContain(`defineConfig`)
  })

  test("bundle-id default is derived from the app name", async () => {
    const dir = tmp("default_bundle")
    dirs.push(dir)
    const { io } = makeIO({ answers: ["Cool App 42", "", "ios"] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(0)
    const written = readFileSync(join(dir, "zl.config.ts"), "utf8")
    expect(written).toContain(`bundleId: "ch.example.cool-app-42"`)
  })

  test("defaults to ios,android when platforms answer is empty", async () => {
    const dir = tmp("default_platforms")
    dirs.push(dir)
    const { io } = makeIO({ answers: ["MyApp", "", ""] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(0)
    const written = readFileSync(join(dir, "zl.config.ts"), "utf8")
    expect(written).toContain("ios:")
    expect(written).toContain("android:")
  })

  test("refuses to overwrite an existing zl.config.ts without --force", async () => {
    const dir = tmp("exists")
    dirs.push(dir)
    writeFileSync(join(dir, "zl.config.ts"), "// existing")
    const { io, err } = makeIO({ answers: ["X", "", "ios"] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("zl.config.ts already exists")
    expect(readFileSync(join(dir, "zl.config.ts"), "utf8")).toBe("// existing")
  })

  test("--force overwrites", async () => {
    const dir = tmp("force")
    dirs.push(dir)
    writeFileSync(join(dir, "zl.config.ts"), "// existing")
    const { io } = makeIO({ answers: ["X", "", "ios"] })
    const code = await runInit({ cwd: dir, io, force: true })
    expect(code).toBe(0)
    expect(readFileSync(join(dir, "zl.config.ts"), "utf8")).not.toBe("// existing")
  })

  test("rejects an empty app name", async () => {
    const dir = tmp("empty_name")
    dirs.push(dir)
    const { io, err } = makeIO({ answers: ["", "", "ios"] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("App name is required")
    expect(existsSync(join(dir, "zl.config.ts"))).toBe(false)
  })

  test("rejects an app name that is only whitespace", async () => {
    const dir = tmp("whitespace_name")
    dirs.push(dir)
    const { io, err } = makeIO({ answers: ["   ", "", "ios"] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("App name is required")
    expect(existsSync(join(dir, "zl.config.ts"))).toBe(false)
  })

  test("rejects unknown platforms and names them", async () => {
    const dir = tmp("bad_platform")
    dirs.push(dir)
    const { io, err } = makeIO({ answers: ["X", "", "ios,blackberry"] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("blackberry")
    expect(existsSync(join(dir, "zl.config.ts"))).toBe(false)
  })

  test("rejects when all platforms are filtered out (empty list)", async () => {
    const dir = tmp("no_platform")
    dirs.push(dir)
    const { io, err } = makeIO({ answers: ["X", "", ",,"] })
    const code = await runInit({ cwd: dir, io, force: false })
    expect(code).toBe(1)
    expect(err.join("\n")).toContain("platform")
    expect(existsSync(join(dir, "zl.config.ts"))).toBe(false)
  })
})
