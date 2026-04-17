import { describe, test, expect } from "bun:test"
import { renderDoctorResults, type DoctorResult } from "./DoctorRenderer"

describe("renderDoctorResults", () => {
  test("renders one line per check with an icon and details", () => {
    const results: ReadonlyArray<DoctorResult> = [
      { name: "Bun", status: "ok", detail: "1.3.12" },
      { name: "Xcode", status: "warn", detail: "not installed — ignore if not building iOS" },
      { name: "Android SDK", status: "fail", detail: "ANDROID_HOME not set" },
    ]
    const output = renderDoctorResults(results)
    expect(output).toContain("Bun")
    expect(output).toContain("1.3.12")
    expect(output).toContain("Xcode")
    expect(output).toContain("ANDROID_HOME")
    expect(output).toContain("1 ok, 1 warning, 1 failed")
  })

  test("returns a summary line even when there are zero checks", () => {
    expect(renderDoctorResults([])).toContain("0 ok")
  })
})
