import type { ResolvedStep, SubcommandHandler } from "../step-loader/StepContract"

/**
 * Flatten every step's declared `subcommands` into a single registry keyed by
 * `"<step-name>:<sub>"`.
 *
 * Step authors expose extra CLI verbs alongside the main `run` — e.g.
 * `sign-ios:init`, `sign-ios:doctor` — via the `subcommands` field on their
 * step definition (see {@link SubcommandHandler}). The CLI dispatch layer
 * consults this registry before falling back to workflow execution when a
 * command contains a colon.
 *
 * Steps without a `subcommands` object are skipped. The `:` separator is
 * literal in the registry key format; step and sub names may themselves
 * contain `-` or other non-colon characters without conflict. CLI lookup
 * matches the complete `"<step-name>:<sub>"` token.
 */
export function buildSubcommandRegistry(
  steps: ReadonlyArray<ResolvedStep>
): ReadonlyMap<string, SubcommandHandler> {
  const map = new Map<string, SubcommandHandler>()
  for (const step of steps) {
    const subs = step.plugin.subcommands
    if (!subs) continue
    for (const [sub, handler] of Object.entries(subs)) {
      map.set(`${step.name}:${sub}`, handler)
    }
  }
  return map
}
