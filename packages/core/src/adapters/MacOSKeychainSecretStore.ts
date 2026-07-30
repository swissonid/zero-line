import { Effect, Layer } from "effect"
import { ShellService, ShellError } from "../ports/ShellService"
import { SecretStore, SecretStoreError } from "../ports/SecretStore"

/**
 * The keychain service-name every `zl`-managed secret is stored under. Hard-
 * coded (rather than configurable) so that `zl`'s secrets are easy to audit
 * in Keychain Access and to dump via `security dump-keychain | grep 'svce.*zl'`.
 */
const SERVICE = "zl"

/**
 * `security(1)` prints this substring to stderr when an item isn't in the
 * keychain. We match on the literal phrase rather than the exit code (44)
 * because Apple has quietly renumbered these codes between macOS releases,
 * whereas the human-readable message has been stable for years.
 */
const NOT_FOUND_MARKER = /could not be found/i

/**
 * Normalises a {@link ShellError} from `security(1)` into the
 * {@link SecretStoreError} vocabulary exposed by the {@link SecretStore} port.
 *
 * When `notFoundHint` is set, we additionally translate "item not found"
 * messages to `NOT_FOUND` — meaningful for `get` and `delete`, but not for
 * `set` (where a missing item is the normal case) or `list` (where the
 * command operates on the keychain as a whole).
 */
function mapShellError(
  err: ShellError,
  code: "WRITE_FAILED" | "READ_FAILED" | "DELETE_FAILED" | "LIST_FAILED",
  notFoundHint: boolean = false
): SecretStoreError {
  if (notFoundHint && NOT_FOUND_MARKER.test(err.message)) {
    return new SecretStoreError({
      code: "NOT_FOUND",
      message: err.message,
      cause: err,
    })
  }
  return new SecretStoreError({
    code,
    message: err.message,
    cause: err,
  })
}

/**
 * Parses the free-form textual output of `security dump-keychain` and returns
 * the distinct account names (`acct`) whose service (`svce`) equals
 * `service`.
 *
 * Output shape (abbreviated, one of many "attribute blocks"):
 *
 * ```text
 * keychain: "/Users/<user>/Library/Keychains/login.keychain-db"
 * class: "genp"
 * attributes:
 *     "svce"<blob>="zl"
 *     "acct"<blob>="APPLE_API_KEY"
 * ```
 *
 * We walk line-by-line carrying the last-seen `svce` / `acct` for the current
 * block, because `security` emits attributes in an unspecified order. A new
 * `keychain:` prefix (or a blank line) is treated as a block boundary —
 * anything pending gets flushed, then the accumulators reset.
 *
 * A `Set` does the deduplication: keys are unique by account name within the
 * single `zl` service, so identical (`svce`,`acct`) pairs produced by
 * multiple keychain files (e.g. login + system) collapse to one entry.
 */
function parseDumpForService(
  dump: string,
  service: string
): ReadonlyArray<string> {
  const accounts = new Set<string>()
  let currentSvce: string | null = null
  let currentAcct: string | null = null

  const flush = () => {
    if (currentSvce === service && currentAcct !== null) {
      accounts.add(currentAcct)
    }
    currentSvce = null
    currentAcct = null
  }

  for (const rawLine of dump.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith("keychain:") || line === "") {
      flush()
      continue
    }
    const svce = line.match(/^"svce"<blob>="([^"]*)"$/)
    if (svce?.[1] !== undefined) {
      currentSvce = svce[1]
      continue
    }
    const acct = line.match(/^"acct"<blob>="([^"]*)"$/)
    if (acct?.[1] !== undefined) {
      currentAcct = acct[1]
      continue
    }
  }
  // trailing block (no terminating blank line / "keychain:" sentinel)
  flush()

  return Array.from(accounts)
}

/**
 * `MacOSKeychainSecretStoreLive` — the `SecretStore` port backed by the
 * macOS `security(1)` CLI.
 *
 * Every operation shells out through {@link ShellService}, which keeps the
 * adapter OS-agnostic from a DI perspective: tests supply a stub `ShellService`
 * layer and never touch the real keychain. Happy-path behaviour:
 *
 * - `set`    → `security add-generic-password -s zl -a <key> -w <value> -U`
 *             (`-U` upserts: no need to branch on "exists" first).
 * - `get`    → `security find-generic-password -s zl -a <key> -w`
 *             (`-w` prints the value only; we strip the single trailing `\n`
 *             `security` always appends).
 * - `delete` → `security delete-generic-password -s zl -a <key>`.
 * - `list`   → `security dump-keychain`, then parse for `svce="zl"` blocks.
 *
 * Error mapping is conservative: we only translate to `NOT_FOUND` when the
 * underlying message contains Apple's "could not be found" phrase (see
 * {@link NOT_FOUND_MARKER}), and only for read/delete. Everything else falls
 * through to the per-operation bucket (`WRITE_FAILED`, `READ_FAILED`,
 * `DELETE_FAILED`, `LIST_FAILED`) with the original `ShellError` preserved in
 * the `cause` field for diagnostics.
 */
export const MacOSKeychainSecretStoreLive = Layer.effect(
  SecretStore,
  Effect.gen(function* () {
    const shell = yield* ShellService
    return {
      set: (key, value) =>
        shell
          .spawn({
            argv: [
              "security",
              "add-generic-password",
              "-s",
              SERVICE,
              "-a",
              key,
              "-w",
              value,
              "-U",
            ],
          })
          .pipe(
            Effect.mapError((e) => mapShellError(e, "WRITE_FAILED")),
            Effect.asVoid
          ),

      get: (key) =>
        shell
          .spawn({
            argv: [
              "security",
              "find-generic-password",
              "-s",
              SERVICE,
              "-a",
              key,
              "-w",
            ],
          })
          .pipe(
            Effect.mapError((e) => mapShellError(e, "READ_FAILED", true)),
            Effect.map((r) => r.stdout.replace(/\r?\n$/, ""))
          ),

      delete: (key) =>
        shell
          .spawn({
            argv: [
              "security",
              "delete-generic-password",
              "-s",
              SERVICE,
              "-a",
              key,
            ],
          })
          .pipe(
            Effect.mapError((e) => mapShellError(e, "DELETE_FAILED", true)),
            Effect.asVoid
          ),

      list: () =>
        shell
          .spawn({ argv: ["security", "dump-keychain"] })
          .pipe(
            Effect.mapError((e) => mapShellError(e, "LIST_FAILED")),
            Effect.map((r) => parseDumpForService(r.stdout, SERVICE))
          ),
    }
  })
)
