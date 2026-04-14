import { defineStep } from "@zl/core"

export default defineStep({
  name: "hello",
  run: async (opts: { name?: string }, ctx) => {
    const name = opts.name ?? "zero-line"
    ctx.logger.info(`Hello, ${name}!`)
    return { greeting: `Hello, ${name}!` }
  },
})
