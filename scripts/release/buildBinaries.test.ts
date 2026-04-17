import { describe, expect, it } from "bun:test"
import {
  ALL_TARGETS,
  outFileForTarget,
  parseBuildArgs,
  targetToBunFlag,
} from "./buildBinaries"

describe("buildBinaries helpers", () => {
  it("lists exactly the three supported targets in the required order", () => {
    expect(ALL_TARGETS).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-x64",
    ])
  })

  it("maps each target to the correct bun --target flag", () => {
    expect(targetToBunFlag("darwin-arm64")).toBe("bun-darwin-arm64")
    expect(targetToBunFlag("darwin-x64")).toBe("bun-darwin-x64")
    expect(targetToBunFlag("linux-x64")).toBe("bun-linux-x64")
  })

  it("computes per-target outfile paths under dist/", () => {
    expect(outFileForTarget("darwin-arm64")).toBe("dist/zl-darwin-arm64")
    expect(outFileForTarget("darwin-x64")).toBe("dist/zl-darwin-x64")
    expect(outFileForTarget("linux-x64")).toBe("dist/zl-linux-x64")
  })

  it("parseBuildArgs defaults to all targets when --target is absent", () => {
    expect(parseBuildArgs([])).toEqual(ALL_TARGETS)
  })

  it("parseBuildArgs returns a single target when --target is provided", () => {
    expect(parseBuildArgs(["--target", "linux-x64"])).toEqual(["linux-x64"])
    expect(parseBuildArgs(["--target", "darwin-arm64"])).toEqual([
      "darwin-arm64",
    ])
  })

  it("parseBuildArgs throws on an unknown target", () => {
    expect(() => parseBuildArgs(["--target", "windows-x64"])).toThrow(
      /unknown target/i,
    )
  })

  it("parseBuildArgs throws when --target is given without a value", () => {
    expect(() => parseBuildArgs(["--target"])).toThrow(/unknown target/i)
  })
})
