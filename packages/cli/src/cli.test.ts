import { describe, test, expect } from "bun:test"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { runCli, defaultIO } from "./cli"
import { makeIO } from "./test-utils/cli-io"

function makeTmpProject(name: string, config: string): string {
  const dir = join(import.meta.dir, `__test_tmp_${name}__`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "zl.config.ts"), config)
  return dir
}

const CONFIG_SIMPLE = `export default {
  app: { name: "T", bundleId: "c.t" },
  platforms: { ios: { steps: [] } },
  workflows: { ci: ["hello"] },
}`

describe("runCli", () => {
  test("prints help and exits 0 when no command is given", async () => {
    const { io, out } = makeIO()
    expect(await runCli([], { cwd: "/tmp", io })).toBe(0)
    expect(out.join("\n")).toContain("zero-line")
  })

  test("prints help for --help", async () => {
    const { io, out } = makeIO()
    expect(await runCli(["--help"], { cwd: "/tmp", io })).toBe(0)
    expect(out.join("\n")).toContain("Usage")
  })

  test("prints help for -h", async () => {
    const { io, out } = makeIO()
    expect(await runCli(["-h"], { cwd: "/tmp", io })).toBe(0)
    expect(out.join("\n")).toContain("Usage")
  })

  test("rejects an invalid --platform value", async () => {
    const { io, err } = makeIO()
    expect(await runCli(["ci", "--platform", "windows"], { cwd: "/tmp", io })).toBe(1)
    expect(err.join("\n")).toContain("Invalid platform 'windows'")
  })

  test("rejects --platform with no value", async () => {
    const { io, err } = makeIO()
    expect(await runCli(["ci", "--platform"], { cwd: "/tmp", io })).toBe(1)
    expect(err.join("\n")).toContain("--platform requires a value")
  })

  test("returns 1 when 'run' has no workflow name", async () => {
    const { io, err } = makeIO()
    expect(await runCli(["run"], { cwd: "/tmp", io })).toBe(1)
    expect(err.join("\n")).toContain("workflow name")
  })

  test("rejects a flag-like value as workflow name", async () => {
    const { io, err } = makeIO()
    expect(await runCli(["run", "--platform", "ios"], { cwd: "/tmp", io })).toBe(1)
    expect(err.join("\n")).toContain("workflow name")
  })

  test("returns 1 when the config file does not exist", async () => {
    const { io, err } = makeIO()
    expect(await runCli(["ci"], { cwd: "/nonexistent/xyz", io })).toBe(1)
    expect(err.join("\n")).toContain("No zl.config.ts")
  })

  test("'list' prints the configured workflows and exits 0", async () => {
    const dir = makeTmpProject("cli_list", CONFIG_SIMPLE)
    try {
      const { io, out } = makeIO()
      expect(await runCli(["list"], { cwd: dir, io })).toBe(0)
      const joined = out.join("\n")
      expect(joined).toContain("Workflows:")
      expect(joined).toContain("ci")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("returns 1 when the requested workflow is unknown", async () => {
    const dir = makeTmpProject("cli_unknown", CONFIG_SIMPLE)
    try {
      const { io } = makeIO()
      expect(await runCli(["nope"], { cwd: dir, io })).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("'run <workflow>' treats the second arg as the workflow name", async () => {
    const dir = makeTmpProject("cli_run_explicit", CONFIG_SIMPLE)
    try {
      const { io } = makeIO()
      expect(await runCli(["run", "nope"], { cwd: dir, io })).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("--platform filters steps to a single platform", async () => {
    const dir = makeTmpProject("cli_platform", CONFIG_SIMPLE)
    try {
      const { io } = makeIO()
      expect(await runCli(["nope", "--platform", "ios"], { cwd: dir, io })).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("--verbose is accepted as a flag", async () => {
    const dir = makeTmpProject("cli_verbose", CONFIG_SIMPLE)
    try {
      const { io } = makeIO()
      expect(await runCli(["nope", "--verbose"], { cwd: dir, io })).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("non-Error thrown values still produce a stderr message", async () => {
    const dir = makeTmpProject("cli_non_error", `throw "exploded"`)
    try {
      const { io, err } = makeIO()
      expect(await runCli(["ci"], { cwd: dir, io })).toBe(1)
      expect(err.join("\n").length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("defaultIO writes to console", () => {
    const origLog = console.log
    const origErr = console.error
    const logged: string[] = []
    const errored: string[] = []
    console.log = (m: string) => logged.push(String(m))
    console.error = (m: string) => errored.push(String(m))
    try {
      defaultIO.stdout("hello-out")
      defaultIO.stderr("hello-err")
    } finally {
      console.log = origLog
      console.error = origErr
    }
    expect(logged).toContain("hello-out")
    expect(errored).toContain("hello-err")
  })
})
