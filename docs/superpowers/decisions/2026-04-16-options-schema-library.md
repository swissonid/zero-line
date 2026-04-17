# Decision: Options schema library for `defineStep`

**Date:** 2026-04-16
**Context:** Roadmap spec M-A item #2 — step options schema validation.

## Decision

Two-part decision:

1. **`optionsSchema` is schema-agnostic.** It accepts any object with a `decode(raw: unknown) => T` method — not a specific library type. Step authors may use `effect/Schema`, `zod`, `valibot`, `arktype`, or a hand-written validator.
2. **`effect/Schema` is the recommended default.** Zero extra dependencies, first-class integration with the Effect pipeline, and better error output for the nested-struct shapes steps tend to have (see spike below).

Rationale for the split: locking the core to a single schema library would force every step author onto it; keeping the interface narrow (one `decode` method) costs nothing and preserves choice. The library choice therefore only governs what `@zl/core` and the first-party plugins ship against — which is `effect/Schema`.

## Interface (v1.0)

```ts
interface OptionsSchema<T> {
  decode: (raw: unknown) => T;
}
```

`decode` returns the parsed value on success or throws on failure. `ConfigLoader` calls `schema.decode(rawOptions)` at config-load time and wraps any thrown error as `StepError` with code `OPTIONS_VALIDATION_FAILED`.

Usage across libraries:

```ts
// effect/Schema (recommended — zero extra deps)
optionsSchema: { decode: (raw) => Schema.decodeUnknownSync(MySchema)(raw) }

// zod
optionsSchema: { decode: (raw) => MyZodSchema.parse(raw) }

// valibot, arktype, hand-written, etc.
optionsSchema: { decode: (raw) => myValidator(raw) }
```

## Considered (for the default)

- `effect/Schema` — zero new deps; composes with Effect; `Schema.decodeUnknownEither` / `Schema.decodeUnknown` integrate cleanly with `Effect.Effect<_, StepError>`.
- `zod` — broader ecosystem familiarity; friendlier default errors; would add a runtime dependency.

The interface decision above means this is a *default* choice, not an exclusion of zod — step authors can still pick it via the `decode` function.

## Spike Output

Given an invalid input `{ scheme: "App", configuration: "Invalid", extraField: true }` against a `BuildIosOptions` struct:

**effect/Schema result:**

```json
{
  "_id": "Either",
  "_tag": "Left",
  "left": {
    "_id": "ParseError",
    "message": "{ readonly scheme: string; readonly configuration: \"Debug\" | \"Release\"; readonly workspace?: string | undefined; readonly project?: string | undefined; readonly derivedDataPath?: string | undefined }\n└─ [\"configuration\"]\n   └─ \"Debug\" | \"Release\"\n      ├─ Expected \"Debug\", actual \"Invalid\"\n      └─ Expected \"Release\", actual \"Invalid\""
  }
}
```

**zod result (v4.3.6):**

```json
{
  "success": false,
  "error": {
    "name": "ZodError",
    "message": "[\n  {\n    \"code\": \"invalid_value\",\n    \"values\": [\"Debug\", \"Release\"],\n    \"path\": [\"configuration\"],\n    \"message\": \"Invalid option: expected one of \\\"Debug\\\"|\\\"Release\\\"\"\n  }\n]"
  }
}
```

## Rationale for `effect/Schema` as the default

**Error message quality:** effect/Schema produces a tree-formatted message that renders the full schema shape at the root, then narrows down the failing field path (`["configuration"]`) with a branching display of each expected literal and the actual value received. For deeply nested step configs this will be immediately readable in terminal output. Zod v4 produces a compact structured array with `code`, `values`, `path`, and `message` — machine-parseable and clean, but slightly less scannable at a glance.

**Unknown field handling:** Both libraries silently strip unknown keys (e.g. `extraField: true`) during decode by default. effect/Schema `Struct` strips excess properties; zod `object` does the same with `.strip()` as default. This is a known footgun for step authors: a misspelled key like `derivedDataPaht` would be silently dropped with no error. v1.1 should consider a `strict` validation mode that rejects unknown keys — either via effect/Schema's `onExcessProperty: "error"` or by diffing the input keys against the schema's known fields in the generic decode wrapper.

**DX / authoring:** Both libraries have similar ergonomics for this use-case. effect/Schema's `Schema.Struct`, `Schema.Literal`, `Schema.optional` mirror zod's `z.object`, `z.enum`, `z.string().optional()` closely. Neither requires boilerplate beyond the schema declaration.

**Integration with Effect pipeline:** effect/Schema returns `Either<ParseError, A>` directly from `decodeUnknownEither`, which maps naturally to `Effect.mapLeft` and the `StepError` channel — no bridging code needed. Using zod would require wrapping `ZodError` into `StepError` at every call site, adding friction and a layer of indirection.

**Dependency footprint:** effect/Schema ships as part of the `effect` package already present in `@zl/core`. Adding zod would be a new runtime dependency across all plugin packages.

No deal-breaking DX issues were observed with effect/Schema. The error output is more informative than zod's for the nested-struct use-case, and integration is a first-class story — so it wins as the default the first-party code ships against.

## End-to-end type safety (v1.1 goal)

v1.0's decode-function approach is runtime-safe but doesn't give compile-time type inference from the schema to the step's `opts` parameter — step authors still provide `defineStep<MyOpts>(...)` manually.

v1.1 will explore deeper integration (e.g. Standard Schema's `~standard.types.output` inference, or an `effect/Schema`-specific overload) so that `optionsSchema` alone drives the TypeScript type — no manual generic needed.

## Consequences

- v1.0 interface: plugins declare `optionsSchema: { decode: (raw: unknown) => TOpts }` using any library of their choice.
- `effect/Schema` is the recommended default and what `@zl/core` and first-party plugins ship against — no new runtime dependencies.
- `ConfigLoader` calls `schema.decode(rawOptions)` at config-load time; throws are caught as `OPTIONS_VALIDATION_FAILED`.
- v1.1: revisit for full end-to-end type inference from schema to `opts` parameter.
