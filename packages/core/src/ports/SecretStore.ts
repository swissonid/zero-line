import { Context, Data, Effect } from "effect"

/**
 * Enumerated failure modes for {@link SecretStore} operations.
 *
 * The port fixes the set of codes (unlike {@link ShellError}'s open
 * `string`) because every adapter—keychain, file-backed, env-backed,
 * in-memory—maps into the same small vocabulary. Call sites switch on
 * `code` for recovery (e.g. treat `NOT_FOUND` as "absent" rather than
 * "broken").
 */
export type SecretStoreErrorCode =
  | "NOT_FOUND"
  | "WRITE_FAILED"
  | "READ_FAILED"
  | "DELETE_FAILED"
  | "LIST_FAILED"
  | "NOT_IMPLEMENTED"

/**
 * Typed failure produced by a {@link SecretStore} invocation.
 *
 * Built on `Data.TaggedError` for structural equality (Cause
 * deduplication) and an enumerable `.message` that survives
 * `JSON.stringify`. The `cause` field carries the underlying platform
 * error (e.g. a keychain NSError) for diagnostics without leaking its
 * type into the port surface.
 */
export class SecretStoreError extends Data.TaggedError("SecretStoreError")<{
  readonly code: SecretStoreErrorCode
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Keychain-backed secret persistence port.
 *
 * Adapters implement `set` / `get` / `list` / `delete` against an OS
 * keychain (macOS Keychain, libsecret, Windows Credential Manager) or a
 * file-backed / in-memory fallback for CI. Values are opaque strings;
 * callers handle any encoding.
 */
export interface ISecretStore {
  readonly set: (
    key: string,
    value: string
  ) => Effect.Effect<void, SecretStoreError>
  readonly get: (key: string) => Effect.Effect<string, SecretStoreError>
  readonly list: () => Effect.Effect<ReadonlyArray<string>, SecretStoreError>
  readonly delete: (key: string) => Effect.Effect<void, SecretStoreError>
}

export class SecretStore extends Context.Tag("SecretStore")<
  SecretStore,
  ISecretStore
>() {}
