import { describe, test, expect } from "bun:test"
import { StepError } from "./StepError"

describe("StepError", () => {
  test("carries _tag 'StepError', code, message, and optional cause", () => {
    const cause = new Error("wrapped")
    const err = new StepError({
      code: "PREFLIGHT_MISSING_SECRETS",
      message: "Missing secret: APPLE_API_KEY",
      cause,
    })

    expect(err._tag).toBe("StepError")
    expect(err.code).toBe("PREFLIGHT_MISSING_SECRETS")
    expect(err.message).toBe("Missing secret: APPLE_API_KEY")
    expect(err.cause).toBe(cause)
  })

  test("cause is undefined when omitted", () => {
    const err = new StepError({
      code: "CUSTOM",
      message: "boom",
    })
    expect(err.cause).toBeUndefined()
  })

  test("extends native Error so stack traces work", () => {
    const err = new StepError({ code: "X", message: "m" })
    expect(err).toBeInstanceOf(Error)
    expect(typeof err.stack).toBe("string")
  })
})
