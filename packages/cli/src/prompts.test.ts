import { describe, test, expect } from "bun:test"
import { makePrompt } from "./prompts"

describe("makePrompt", () => {
  test("reads a line from the supplied reader and returns it trimmed", async () => {
    const reader = async () => "  hello world  \n"
    const prompt = makePrompt({ read: reader, write: () => {} })
    expect(await prompt("Name?")).toBe("hello world")
  })

  test("writes the question (with trailing space) before reading", async () => {
    const written: string[] = []
    const prompt = makePrompt({
      read: async () => "x\n",
      write: (m) => written.push(m),
    })
    await prompt("Name?")
    expect(written.join("")).toBe("Name? ")
  })

  test("returns the default when the user hits enter on an empty line", async () => {
    const prompt = makePrompt({ read: async () => "\n", write: () => {} })
    expect(await prompt("Bundle id?", { default: "ch.example" })).toBe("ch.example")
  })

  test("appends a '[default]' hint when a default is supplied", async () => {
    const written: string[] = []
    const prompt = makePrompt({
      read: async () => "\n",
      write: (m) => written.push(m),
    })
    await prompt("Bundle id?", { default: "ch.example" })
    expect(written.join("")).toContain("[ch.example]")
  })
})
