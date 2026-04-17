import { describe, test, expect } from "bun:test"
import { ShellService, ShellError } from "./ShellService"

describe("ShellService port", () => {
  test("ShellService is an Effect Context.Tag", () => {
    expect(ShellService.key).toBe("ShellService")
  })

  test("ShellError carries _tag, code, message, exitCode", () => {
    const err = new ShellError({
      code: "NON_ZERO_EXIT",
      message: "xcodebuild failed",
      exitCode: 65,
    })
    expect(err._tag).toBe("ShellError")
    expect(err.code).toBe("NON_ZERO_EXIT")
    expect(err.message).toBe("xcodebuild failed")
    expect(err.exitCode).toBe(65)
  })
})
