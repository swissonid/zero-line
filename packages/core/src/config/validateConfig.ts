import { ParseResult, Schema } from "effect"
import { ZlConfigSchema, type ZlConfig } from "./ConfigTypes"

/**
 * Thrown by {@link validateConfig} when a `zl.config.ts` doesn't match the
 * expected shape.
 *
 * `issues` is kept as a `string[]` for backward compatibility with existing
 * consumers — each entry is one rendered block from `effect/Schema`'s
 * {@link ParseResult.TreeFormatter}, so a multi-error decode produces a
 * single tree-formatted string in `issues[0]` rather than N separate strings.
 * The tree already contains per-field paths and nested detail, so callers
 * that just print `err.message` get useful output for free.
 */
export class ConfigValidationError extends Error {
  constructor(readonly issues: ReadonlyArray<string>) {
    super(`Invalid config: ${issues.join(", ")}`)
    this.name = "ConfigValidationError"
  }
}

const decodeZlConfig = Schema.decodeUnknownSync(ZlConfigSchema)

/**
 * Decode an unknown value as a {@link ZlConfig} using `effect/Schema`.
 *
 * On success the typed value is returned — no `as unknown as ZlConfig`
 * cast at the boundary. On schema mismatch a {@link ConfigValidationError}
 * is thrown carrying the `TreeFormatter`-rendered issue tree, which points
 * at the failing field path(s) (e.g. `app.name`) and shows the expected
 * vs actual shape.
 */
export function validateConfig(raw: unknown): ZlConfig {
  try {
    return decodeZlConfig(raw)
  } catch (err) {
    if (ParseResult.isParseError(err)) {
      throw new ConfigValidationError([
        ParseResult.TreeFormatter.formatErrorSync(err),
      ])
    }
    throw err
  }
}
