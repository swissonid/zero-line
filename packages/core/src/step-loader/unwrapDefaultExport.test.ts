import { describe, test, expect } from "bun:test"
import { unwrapDefaultExport } from "./unwrapDefaultExport"

describe("unwrapDefaultExport", () => {
  test("returns mod.default when present", () => {
    const plugin = { name: "step" }
    const mod = { default: plugin, other: "x" }
    expect(unwrapDefaultExport(mod)).toBe(plugin)
  })

  test("returns the namespace itself when default is absent", () => {
    const mod = { name: "step", execute: () => {} }
    expect(unwrapDefaultExport(mod)).toBe(mod)
  })

  test("returns the module when default is explicitly undefined", () => {
    const mod = { default: undefined, name: "step" }
    expect(unwrapDefaultExport(mod)).toBe(mod)
  })

  test("returns the input verbatim for non-object values", () => {
    expect(unwrapDefaultExport(null)).toBe(null)
    expect(unwrapDefaultExport(42)).toBe(42)
    expect(unwrapDefaultExport("x")).toBe("x")
  })

  test("preserves a null default by falling through to the namespace", () => {
    const mod = { default: null, name: "step" }
    expect(unwrapDefaultExport(mod)).toBe(mod)
  })

  test("unwraps a falsy-but-valid default (e.g. 0) only when truthy", () => {
    // ?? returns the left operand if not null/undefined — so 0 is returned,
    // not the namespace. Documents current behaviour.
    const mod = { default: 0 }
    expect(unwrapDefaultExport(mod)).toBe(0)
  })
})
