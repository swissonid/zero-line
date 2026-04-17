import { Either, Schema } from "effect"

/**
 * Schema guard for "something that may be an ES module namespace with a
 * `default` export". We only care whether `default` is present — keys like
 * other named exports (the namespace object ESM produces for `import(name)`)
 * flow through untouched because we inspect `mod.default`, not a decoded
 * copy.
 *
 * Decode is used as a typed boundary: if the runtime value isn't an object
 * at all, we skip the unwrap and return `mod` verbatim so downstream
 * validators (`validateStep`) produce the real error.
 */
const ModuleShape = Schema.Struct({
  default: Schema.optional(Schema.Unknown),
})

/**
 * Unwrap an `import()`ed module's `default` export, or fall back to the
 * namespace object itself when no `default` is present.
 *
 * Replaces the previous `as Record<string, unknown>` cast at the dynamic
 * import boundary: we validate the module shape with `effect/Schema`
 * instead of lying to the type system. Unknown shapes (primitives, null)
 * are returned as-is so downstream step validation surfaces a meaningful
 * error, not a schema-decode failure from this helper.
 */
export function unwrapDefaultExport(mod: unknown): unknown {
  const decoded = Schema.decodeUnknownEither(ModuleShape)(mod)
  if (Either.isLeft(decoded)) return mod
  return decoded.right.default ?? mod
}
