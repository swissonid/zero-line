# Linear → GitHub Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Every implementation agent prompt MUST also invoke superpowers:test-driven-development and superpowers:effect-ts (per project convention). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute a one-shot migration of the zero-line project off Linear onto GitHub-native tooling (Issues, Milestones, Projects v2, Wiki), preserving the M-A..M-F milestone structure and the M-A1..M-A4 sub-milestone decomposition via tracking issues + native GitHub sub-issues. Remove contaminating ora-calendar tickets that leaked in from the prior two-way sync.

**Architecture:** One CLI at `scripts/migrate-linear-to-github/`, Bun + Effect.ts + TypeScript. Each of the 10 phases is a subcommand. Phase commands are **dry-run by default** (require `--apply` to mutate) and **idempotent** (safe to re-run). Pure-functional mapping modules (labels, state, priority, body footer, audit matcher, wiki renderer) get TDD coverage; I/O (Linear + GitHub clients) is Effect-layered. Phase 0b produces a committed immutable Linear snapshot JSON that all subsequent phases consume — guarantees determinism and re-runnability. Reports are written as markdown under `docs/migration/` for human review gates between phases.

**Tech Stack:** Bun 1.3, TypeScript 5, Effect 3.x, `@linear/sdk` (official), `@octokit/rest`, `@octokit/graphql`, `bun:test`, `oxlint`, `husky`.

**Related spec:** `docs/superpowers/specs/2026-04-21-linear-to-github-migration-design.md`.

**Tracking:** Per project convention, each task below corresponds to one GitHub issue (post-migration) or one Linear ticket (during the transition window) and one PR. For the early tasks that ship before migration completes, use Linear tickets under a new `MA-M` (Migration) grouping; once Phase 3 creates the GitHub milestones, remaining tasks are filed as GitHub issues directly.

---

## File structure

### New files — script package

| Path | Responsibility |
|---|---|
| `scripts/migrate-linear-to-github/package.json` | Private workspace package with Effect + Linear + Octokit deps. |
| `scripts/migrate-linear-to-github/tsconfig.json` | Extends `tsconfig.base.json`. Rootdir = `src`. |
| `scripts/migrate-linear-to-github/bin.ts` | CLI entrypoint using Bun's `parseArgs`. Routes to phase command. |
| `scripts/migrate-linear-to-github/src/config.ts` | Constants: repo owner/name, Linear team key, Linear project name, snapshot path format, report path format. |
| `scripts/migrate-linear-to-github/src/types.ts` | `LinearSnapshot`, `LinearIssue`, `LinearMilestone`, `GhIssue`, `MigrationMap`, `PhaseReport`. |
| `scripts/migrate-linear-to-github/src/linear/client.ts` | Effect service wrapping `@linear/sdk`. |
| `scripts/migrate-linear-to-github/src/linear/snapshot.ts` | Fetch all zero-line issues + comments + milestones + the one Document; return `LinearSnapshot`. |
| `scripts/migrate-linear-to-github/src/github/rest.ts` | Effect service wrapping Octokit REST. Throttled. Issue, label, milestone, comment CRUD. |
| `scripts/migrate-linear-to-github/src/github/graphql.ts` | Effect service wrapping Octokit GraphQL. Sub-issues + Projects v2 operations. |
| `scripts/migrate-linear-to-github/src/github/rate-limit.ts` | Shared 10 req/s throttle primitive. |
| `scripts/migrate-linear-to-github/src/mapping/labels.ts` | Pure. `labelsFor(issue: LinearIssue, raw: ReadonlyArray<string>): ReadonlyArray<string>`. Includes priority → `priority:*` and `migrated-from-linear` stamps. |
| `scripts/migrate-linear-to-github/src/mapping/state.ts` | Pure. `stateFor(status: string): { state, state_reason }`. |
| `scripts/migrate-linear-to-github/src/mapping/priority.ts` | Pure. `priorityLabel(priority?: { value, name }): string \| null`. |
| `scripts/migrate-linear-to-github/src/mapping/body.ts` | Pure. `composeBody(issue: LinearIssue): string` — original description + standardised footer. |
| `scripts/migrate-linear-to-github/src/audit/matcher.ts` | Pure. `matchIssues(linear, github): MigrationMap` with drift + ora-calendar flags. |
| `scripts/migrate-linear-to-github/src/audit/report.ts` | Pure. `renderAuditReport(map: MigrationMap): string`. |
| `scripts/migrate-linear-to-github/src/phases/0b-snapshot.ts` | Phase 0b: fetch → write `docs/migration/linear-snapshot-<date>.json`. |
| `scripts/migrate-linear-to-github/src/phases/1-audit.ts` | Phase 1: load snapshot + live GH state → audit report + exit code. |
| `scripts/migrate-linear-to-github/src/phases/2-evict.ts` | Phase 2: close ora-calendar issues with pointer comment; delete contaminant labels. |
| `scripts/migrate-linear-to-github/src/phases/3a-labels-milestones.ts` | Phase 3a: create labels (6 new) + milestones (7: M-0..M-F) idempotently. |
| `scripts/migrate-linear-to-github/src/phases/3b-tracking-issues.ts` | Phase 3b: create 4 tracking issues (M-A1..M-A4) in M-A milestone. |
| `scripts/migrate-linear-to-github/src/phases/3c-projects-v2.ts` | Phase 3c: create Projects v2 board, 4 custom fields, 4 views, 4 automations; link to repo. Pauses for manual confirm. |
| `scripts/migrate-linear-to-github/src/phases/4-reconcile.ts` | Phase 4: per-issue update: body+footer, labels, milestone, state, assignee, sub-issue parent, missing comments. |
| `scripts/migrate-linear-to-github/src/phases/5-populate-project.ts` | Phase 5: set Sub-milestone / Priority / Type / Area fields for every issue. |
| `scripts/migrate-linear-to-github/src/phases/6-write-wiki.ts` | Phase 6: generate 10 wiki pages (8 + sidebar + footer); clone → commit → push. |
| `scripts/migrate-linear-to-github/src/phases/7-rewrite-plan-links.ts` | Phase 7: rewrite Linear URLs in `docs/superpowers/{plans,specs}/*.md` using mapping CSV. |
| `scripts/migrate-linear-to-github/src/phases/8-verify.ts` | Phase 8: consistency check, write report, exit non-zero on failure. |
| `scripts/migrate-linear-to-github/src/wiki/templates.ts` | Markdown template strings for each wiki page. |
| `scripts/migrate-linear-to-github/src/wiki/renderer.ts` | Pure. `renderWiki(snapshot, map, milestones): Record<string, string>` → `{ "Home.md": "…", … }`. |
| `scripts/migrate-linear-to-github/tests/mapping/labels.test.ts` | |
| `scripts/migrate-linear-to-github/tests/mapping/state.test.ts` | |
| `scripts/migrate-linear-to-github/tests/mapping/priority.test.ts` | |
| `scripts/migrate-linear-to-github/tests/mapping/body.test.ts` | |
| `scripts/migrate-linear-to-github/tests/audit/matcher.test.ts` | |
| `scripts/migrate-linear-to-github/tests/wiki/renderer.test.ts` | |
| `scripts/migrate-linear-to-github/README.md` | How to run, env vars required, phase order, safety posture. |

### New files — data artifacts (written during execution, committed)

| Path | Written by | Lifetime |
|---|---|---|
| `docs/migration/linear-snapshot-<date>.json` | Phase 0b | Permanent — immutable snapshot |
| `docs/migration/audit-<date>.md` | Phase 1 | Permanent — review trail |
| `docs/migration/reconcile-<date>.md` | Phase 4 | Permanent — review trail |
| `docs/migration/verify-<date>.md` | Phase 8 | Permanent — review trail |
| `docs/migration/linear-github-mapping.csv` | Phase 4 (appended) | Permanent — ZER-N↔#N reference |

### Modified files

| Path | Change |
|---|---|
| `package.json` (root) | Add `migrate` workspace root; update `typecheck` + `test` to include `scripts/migrate-linear-to-github`. |
| `docs/superpowers/plans/*.md` and `docs/superpowers/specs/*.md` | Phase 7 rewrites Linear URLs to GH issue URLs. |
| `README.md` | Phase 9: remove any "see Linear" references; add link to Projects v2 board. |
| `~/.claude/projects/-Users-patricemuller-Projects-platfrom-plane-mobile-zero-line/memory/feedback_pr_per_issue.md` | Phase 9: "Linear issue" → "GitHub issue". |
| `~/.claude/.../memory/feedback_worktrees_per_ticket.md` | Phase 9: "Linear ticket" → "GitHub issue". |
| `~/.claude/.../memory/feedback_linear_blocked_by.md` | Phase 9: replaced by `feedback_github_sub_issues.md`. |
| `~/.claude/.../memory/reference_linear.md` | Phase 9: replaced by `reference_github.md`. |
| `~/.claude/.../memory/MEMORY.md` | Phase 9: rewrite index entries to match renamed files. |

---

## Task 1: Scaffold the migration script package

**Files:**
- Create: `scripts/migrate-linear-to-github/package.json`
- Create: `scripts/migrate-linear-to-github/tsconfig.json`
- Create: `scripts/migrate-linear-to-github/bin.ts`
- Create: `scripts/migrate-linear-to-github/README.md`
- Create: `scripts/migrate-linear-to-github/src/config.ts`
- Create: `scripts/migrate-linear-to-github/src/types.ts`
- Modify: `package.json` (root)
- Modify: `bun.lock` (via `bun install`)

- [ ] **Step 1: Create the script directory layout**

```bash
mkdir -p scripts/migrate-linear-to-github/src/{linear,github,mapping,audit,phases,wiki}
mkdir -p scripts/migrate-linear-to-github/tests/{mapping,audit,wiki}
mkdir -p docs/migration
```

- [ ] **Step 2: Write `scripts/migrate-linear-to-github/package.json`**

```json
{
  "name": "@zl/migrate",
  "private": true,
  "type": "module",
  "main": "bin.ts",
  "bin": { "zl-migrate": "./bin.ts" },
  "scripts": {
    "typecheck": "bunx tsc --noEmit",
    "test": "bun test tests/"
  },
  "dependencies": {
    "@linear/sdk": "^40.0.0",
    "@octokit/rest": "^22.0.0",
    "@octokit/graphql": "^9.0.0",
    "effect": "^3.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 3: Write `scripts/migrate-linear-to-github/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "types": ["bun-types"]
  },
  "include": ["bin.ts", "src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: Write `scripts/migrate-linear-to-github/src/config.ts`**

```ts
export const GITHUB_OWNER = "swissonid"
export const GITHUB_REPO = "zero-line"
export const LINEAR_TEAM_KEY = "ZER"
export const LINEAR_PROJECT_NAME = "zero-line MVP"
export const MIGRATION_DIR = "docs/migration"
export const MAPPING_CSV_PATH = `${MIGRATION_DIR}/linear-github-mapping.csv`

export const snapshotPath = (date: string) =>
  `${MIGRATION_DIR}/linear-snapshot-${date}.json`
export const reportPath = (phase: string, date: string) =>
  `${MIGRATION_DIR}/${phase}-${date}.md`
```

- [ ] **Step 5: Write `scripts/migrate-linear-to-github/src/types.ts`**

```ts
export interface LinearIssue {
  readonly identifier: string
  readonly title: string
  readonly description: string
  readonly status: string
  readonly statusType: "backlog" | "started" | "completed" | "canceled" | string
  readonly priority: { value: number; name: string } | null
  readonly milestone: { id: string; name: string } | null
  readonly labels: ReadonlyArray<string>
  readonly assignee: { id: string; name: string; email?: string } | null
  readonly createdAt: string
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly canceledAt: string | null
  readonly url: string
  readonly project: { id: string; name: string }
  readonly comments: ReadonlyArray<LinearComment>
}

export interface LinearComment {
  readonly id: string
  readonly author: string
  readonly createdAt: string
  readonly body: string
}

export interface LinearMilestone {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly targetDate: string | null
  readonly sortOrder: number
}

export interface LinearDocument {
  readonly id: string
  readonly title: string
  readonly content: string
  readonly url: string
}

export interface LinearSnapshot {
  readonly fetchedAt: string
  readonly issues: ReadonlyArray<LinearIssue>
  readonly milestones: ReadonlyArray<LinearMilestone>
  readonly documents: ReadonlyArray<LinearDocument>
}

export interface GhIssue {
  readonly number: number
  readonly title: string
  readonly body: string
  readonly state: "open" | "closed"
  readonly state_reason: "completed" | "not_planned" | "reopened" | null
  readonly labels: ReadonlyArray<string>
  readonly milestone: { number: number; title: string } | null
  readonly assignees: ReadonlyArray<string>
}

export interface MatchEntry {
  readonly linear: LinearIssue
  readonly github: GhIssue | null
  readonly drift: ReadonlyArray<string>  // empty = aligned
}

export interface MigrationMap {
  readonly matched: ReadonlyArray<MatchEntry>
  readonly linearOrphans: ReadonlyArray<LinearIssue>  // no GH counterpart
  readonly githubOrphans: ReadonlyArray<GhIssue>      // no Linear counterpart
  readonly oraCalendarContamination: ReadonlyArray<GhIssue>  // GH issues to evict
}
```

- [ ] **Step 6: Write `scripts/migrate-linear-to-github/bin.ts`**

```ts
#!/usr/bin/env bun
import { parseArgs } from "util"

const PHASES = [
  "snapshot",
  "audit",
  "evict-ora-calendar",
  "setup-structure",
  "reconcile",
  "populate-project",
  "write-wiki",
  "rewrite-plan-links",
  "verify",
] as const

type Phase = typeof PHASES[number]

const USAGE = `
zl-migrate <phase> [--apply]

Phases:
  snapshot              Phase 0b — fetch Linear state to JSON
  audit                 Phase 1 — dry-run mapping + drift report
  evict-ora-calendar    Phase 2 — close ora-calendar issues in this repo
  setup-structure       Phase 3 — labels, milestones, tracking issues, Projects v2
  reconcile             Phase 4 — create/update GH issues from snapshot
  populate-project      Phase 5 — set Projects v2 custom fields
  write-wiki            Phase 6 — push wiki pages
  rewrite-plan-links    Phase 7 — rewrite Linear URLs in /docs
  verify                Phase 8 — final consistency check

Flags:
  --apply   Actually mutate (default is dry-run)
  --help    Show this help

Env:
  LINEAR_API_KEY   Required for phases reading from Linear
  GITHUB_TOKEN     Required for phases writing to GitHub
`

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      apply: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  })
  if (values.help || positionals.length === 0) {
    console.log(USAGE)
    return values.help ? 0 : 1
  }
  const phase = positionals[0] as Phase
  if (!PHASES.includes(phase)) {
    console.error(`Unknown phase '${phase}'. Run --help.`)
    return 1
  }
  const mod = await import(`./src/phases/${phaseToFile(phase)}.ts`)
  return mod.run({ apply: values.apply })
}

function phaseToFile(p: Phase): string {
  const map: Record<Phase, string> = {
    "snapshot": "0b-snapshot",
    "audit": "1-audit",
    "evict-ora-calendar": "2-evict",
    "setup-structure": "3-setup-structure",
    "reconcile": "4-reconcile",
    "populate-project": "5-populate-project",
    "write-wiki": "6-write-wiki",
    "rewrite-plan-links": "7-rewrite-plan-links",
    "verify": "8-verify",
  }
  return map[p]
}

process.exit(await main())
```

Note: `"setup-structure"` routes to `3-setup-structure.ts` which internally composes `3a-labels-milestones.ts` + `3b-tracking-issues.ts` + `3c-projects-v2.ts`. This keeps the user-facing CLI surface small while preserving the file decomposition.

- [ ] **Step 7: Write `scripts/migrate-linear-to-github/README.md`**

```markdown
# @zl/migrate — Linear → GitHub migration

One-off tool that migrates the zero-line project off Linear. See the spec at
`docs/superpowers/specs/2026-04-21-linear-to-github-migration-design.md`.

## Run

    bun zl-migrate <phase>            # dry run
    bun zl-migrate <phase> --apply    # mutate

## Env

    export LINEAR_API_KEY=lin_api_...
    export GITHUB_TOKEN=ghp_...

## Phase order

Run in order. Each phase is idempotent and writes a report to
`docs/migration/` that must be reviewed before the next `--apply`.

1. snapshot
2. audit
3. evict-ora-calendar
4. setup-structure
5. reconcile
6. populate-project
7. write-wiki
8. rewrite-plan-links
9. verify

Phase 9 (Linear archive) is manual — see the spec.
```

- [ ] **Step 8: Add `scripts/migrate-linear-to-github` to root `package.json` workspaces and scripts**

Edit root `package.json`:

```json
{
  "name": "zero-line",
  "private": true,
  "workspaces": [
    "packages/core",
    "packages/cli",
    "packages/steps/*/*",
    "scripts/migrate-linear-to-github"
  ],
  "devDependencies": { /* unchanged */ },
  "scripts": {
    "prepare": "husky",
    "lint": "bunx oxlint packages/ scripts/",
    "lint:fix": "bunx oxlint --fix packages/ scripts/",
    "typecheck": "bunx tsc --noEmit -p packages/core/tsconfig.json && bunx tsc --noEmit -p packages/cli/tsconfig.json && bunx tsc --noEmit -p scripts/migrate-linear-to-github/tsconfig.json",
    "test": "bun test --recursive packages/ scripts/",
    "test:coverage": "bun test --recursive --coverage packages/ scripts/"
  }
}
```

- [ ] **Step 9: Install dependencies**

```bash
bun install
```

Expected: `bun.lock` updated, `@linear/sdk`, `@octokit/rest`, `@octokit/graphql`, `effect` resolve successfully.

- [ ] **Step 10: Verify scaffold**

```bash
bun zl-migrate --help
```

Expected: usage text printed, exit 0.

```bash
bun run typecheck
```

Expected: passes (no code yet to typecheck against).

- [ ] **Step 11: Commit**

```bash
git add scripts/migrate-linear-to-github package.json bun.lock
git commit -m "chore(migrate): scaffold Linear→GitHub migration CLI (phase 0)"
```

---

## Task 2: Linear client + snapshot fetcher

**Files:**
- Create: `scripts/migrate-linear-to-github/src/linear/client.ts`
- Create: `scripts/migrate-linear-to-github/src/linear/snapshot.ts`
- Create: `scripts/migrate-linear-to-github/tests/linear/snapshot.test.ts` (fixture-driven)

- [ ] **Step 1: Write `scripts/migrate-linear-to-github/src/linear/client.ts`**

```ts
import { LinearClient } from "@linear/sdk"
import { Context, Effect, Layer } from "effect"

export class LinearApi extends Context.Tag("LinearApi")<
  LinearApi,
  { readonly raw: LinearClient }
>() {}

export const LinearApiLive = Layer.effect(
  LinearApi,
  Effect.sync(() => {
    const apiKey = process.env.LINEAR_API_KEY
    if (!apiKey) {
      throw new Error("LINEAR_API_KEY not set")
    }
    return { raw: new LinearClient({ apiKey }) }
  })
)
```

- [ ] **Step 2: Write `scripts/migrate-linear-to-github/src/linear/snapshot.ts`**

```ts
import { Effect } from "effect"
import { LinearApi } from "./client"
import type {
  LinearSnapshot,
  LinearIssue,
  LinearMilestone,
  LinearDocument,
  LinearComment,
} from "../types"
import { LINEAR_PROJECT_NAME } from "../config"

export const fetchSnapshot = (): Effect.Effect<LinearSnapshot, Error, LinearApi> =>
  Effect.gen(function* () {
    const { raw } = yield* LinearApi
    const project = yield* Effect.tryPromise(async () => {
      const projects = await raw.projects({ filter: { name: { eq: LINEAR_PROJECT_NAME } } })
      const p = projects.nodes[0]
      if (!p) throw new Error(`Linear project '${LINEAR_PROJECT_NAME}' not found`)
      return p
    })
    const milestones = yield* Effect.tryPromise(async () => {
      const res = await project.projectMilestones()
      return Promise.all(
        res.nodes.map(async (m): Promise<LinearMilestone> => ({
          id: m.id,
          name: m.name,
          description: m.description ?? "",
          targetDate: m.targetDate ?? null,
          sortOrder: m.sortOrder,
        }))
      )
    })
    const issues = yield* Effect.tryPromise(async () => {
      const all: LinearIssue[] = []
      let cursor: string | undefined
      do {
        const page = await raw.issues({
          filter: { project: { name: { eq: LINEAR_PROJECT_NAME } } },
          first: 100,
          after: cursor,
          includeArchived: true,
        })
        for (const node of page.nodes) {
          const [state, priority, assignee, milestone, labels, comments] = await Promise.all([
            node.state,
            Promise.resolve(node.priority),
            node.assignee,
            node.projectMilestone,
            node.labels().then((l) => l.nodes.map((x) => x.name)),
            node.comments().then((c) =>
              Promise.all(
                c.nodes.map(async (cm): Promise<LinearComment> => ({
                  id: cm.id,
                  author: (await cm.user)?.name ?? "unknown",
                  createdAt: cm.createdAt.toISOString(),
                  body: cm.body,
                }))
              )
            ),
          ])
          all.push({
            identifier: node.identifier,
            title: node.title,
            description: node.description ?? "",
            status: state?.name ?? "",
            statusType: (state?.type ?? "") as LinearIssue["statusType"],
            priority: node.priority === 0
              ? null
              : { value: node.priority, name: node.priorityLabel },
            milestone: milestone ? { id: milestone.id, name: milestone.name } : null,
            labels,
            assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
            createdAt: node.createdAt.toISOString(),
            startedAt: node.startedAt?.toISOString() ?? null,
            completedAt: node.completedAt?.toISOString() ?? null,
            canceledAt: node.canceledAt?.toISOString() ?? null,
            url: node.url,
            project: { id: project.id, name: project.name },
            comments,
          })
        }
        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor ?? undefined : undefined
      } while (cursor)
      return all
    })
    const documents = yield* Effect.tryPromise(async () => {
      const res = await raw.documents({ filter: { project: { id: { eq: project.id } } } })
      return res.nodes.map((d): LinearDocument => ({
        id: d.id,
        title: d.title,
        content: d.content ?? "",
        url: d.url,
      }))
    })
    return {
      fetchedAt: new Date().toISOString(),
      issues,
      milestones,
      documents,
    }
  })
```

- [ ] **Step 3: Write a fixture-replay test**

Create a tiny pre-recorded fixture so the snapshot shape is validated without hitting the live API in CI. Write `scripts/migrate-linear-to-github/tests/linear/snapshot.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import type { LinearSnapshot } from "../../src/types"

describe("LinearSnapshot JSON shape", () => {
  test("accepts a minimal well-formed snapshot", () => {
    const snap: LinearSnapshot = {
      fetchedAt: "2026-04-21T00:00:00.000Z",
      issues: [{
        identifier: "ZER-1",
        title: "Example",
        description: "Body",
        status: "Done",
        statusType: "completed",
        priority: { value: 2, name: "High" },
        milestone: { id: "m1", name: "M-A Foundation" },
        labels: ["type:bug"],
        assignee: { id: "u1", name: "Patrice" },
        createdAt: "2026-04-14T00:00:00.000Z",
        startedAt: "2026-04-15T00:00:00.000Z",
        completedAt: "2026-04-16T00:00:00.000Z",
        canceledAt: null,
        url: "https://linear.app/splitcast/issue/ZER-1/example",
        project: { id: "p1", name: "zero-line MVP" },
        comments: [],
      }],
      milestones: [{
        id: "m1",
        name: "M-A Foundation",
        description: "",
        targetDate: "2026-05-07",
        sortOrder: -67,
      }],
      documents: [],
    }
    expect(snap.issues[0].identifier).toBe("ZER-1")
    expect(snap.milestones[0].targetDate).toBe("2026-05-07")
  })
})
```

- [ ] **Step 4: Run tests**

```bash
cd scripts/migrate-linear-to-github && bun test tests/
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-linear-to-github/src/linear scripts/migrate-linear-to-github/tests/linear
git commit -m "feat(migrate): Linear client + snapshot fetcher"
```

---

## Task 3: Snapshot phase command (Phase 0b)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/phases/0b-snapshot.ts`

- [ ] **Step 1: Write `src/phases/0b-snapshot.ts`**

```ts
import { Effect } from "effect"
import { writeFileSync, mkdirSync } from "fs"
import { fetchSnapshot } from "../linear/snapshot"
import { LinearApiLive } from "../linear/client"
import { snapshotPath, MIGRATION_DIR } from "../config"

export const run = async ({ apply }: { apply: boolean }): Promise<number> => {
  const date = new Date().toISOString().slice(0, 10)
  const path = snapshotPath(date)
  if (!apply) {
    console.log(`[dry-run] would fetch Linear snapshot and write to ${path}`)
    console.log(`[dry-run] run with --apply to execute`)
    return 0
  }
  mkdirSync(MIGRATION_DIR, { recursive: true })
  const program = fetchSnapshot().pipe(Effect.provide(LinearApiLive))
  const snap = await Effect.runPromise(program)
  writeFileSync(path, JSON.stringify(snap, null, 2))
  console.log(`wrote ${snap.issues.length} issues, ${snap.milestones.length} milestones, ${snap.documents.length} documents to ${path}`)
  return 0
}
```

- [ ] **Step 2: Dry-run verify**

```bash
bun zl-migrate snapshot
```

Expected: prints `[dry-run] would fetch Linear snapshot and write to docs/migration/linear-snapshot-<today>.json`, exit 0.

- [ ] **Step 3: Real run (this actually fetches Linear and commits)**

```bash
export LINEAR_API_KEY=<your key>
bun zl-migrate snapshot --apply
```

Expected: prints `wrote 93 issues, 6 milestones, 1 documents to docs/migration/linear-snapshot-2026-04-<dd>.json`.

Verify the file exists and is well-formed:
```bash
jq '.issues | length, .milestones | length, .documents | length' docs/migration/linear-snapshot-*.json
```
Expected: `93`, `6`, `1`.

- [ ] **Step 4: Commit the snapshot**

```bash
git add docs/migration/linear-snapshot-*.json scripts/migrate-linear-to-github/src/phases/0b-snapshot.ts
git commit -m "feat(migrate): phase 0b snapshot command + committed Linear snapshot"
```

The snapshot file is large (~500KB-1MB) but text, committing it is fine. It is the immutable reference for all subsequent phases.

---

## Task 4: GitHub client (REST + GraphQL) with rate limiting

**Files:**
- Create: `scripts/migrate-linear-to-github/src/github/rate-limit.ts`
- Create: `scripts/migrate-linear-to-github/src/github/rest.ts`
- Create: `scripts/migrate-linear-to-github/src/github/graphql.ts`

- [ ] **Step 1: Write `src/github/rate-limit.ts`**

```ts
import { Effect } from "effect"

// Token-bucket throttle at ~10 req/s. Single global throttle.
const MIN_INTERVAL_MS = 100
let lastCall = 0

export const throttled = <A>(f: () => Promise<A>): Effect.Effect<A, Error> =>
  Effect.tryPromise(async () => {
    const now = Date.now()
    const wait = Math.max(0, lastCall + MIN_INTERVAL_MS - now)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCall = Date.now()
    return f()
  })
```

- [ ] **Step 2: Write `src/github/rest.ts`**

```ts
import { Octokit } from "@octokit/rest"
import { Context, Effect, Layer } from "effect"
import { GITHUB_OWNER, GITHUB_REPO } from "../config"
import { throttled } from "./rate-limit"
import type { GhIssue } from "../types"

export interface CreateIssueInput {
  readonly title: string
  readonly body: string
  readonly labels?: ReadonlyArray<string>
  readonly milestone?: number | null
  readonly assignees?: ReadonlyArray<string>
}

export interface UpdateIssueInput extends Partial<CreateIssueInput> {
  readonly state?: "open" | "closed"
  readonly state_reason?: "completed" | "not_planned" | "reopened" | null
}

export class GithubRest extends Context.Tag("GithubRest")<
  GithubRest,
  {
    readonly listAllIssues: () => Effect.Effect<ReadonlyArray<GhIssue>, Error>
    readonly createIssue: (i: CreateIssueInput) => Effect.Effect<GhIssue, Error>
    readonly updateIssue: (n: number, i: UpdateIssueInput) => Effect.Effect<GhIssue, Error>
    readonly addComment: (n: number, body: string) => Effect.Effect<void, Error>
    readonly ensureLabel: (name: string, color: string, description?: string) => Effect.Effect<void, Error>
    readonly deleteLabel: (name: string) => Effect.Effect<void, Error>
    readonly ensureMilestone: (title: string, description: string, due?: string | null) => Effect.Effect<number, Error>
    readonly listComments: (n: number) => Effect.Effect<ReadonlyArray<{ id: number; body: string; created_at: string; user: string }>, Error>
  }
>() {}

export const GithubRestLive = Layer.effect(
  GithubRest,
  Effect.sync(() => {
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error("GITHUB_TOKEN not set")
    const ok = new Octokit({ auth: token })
    const owner = GITHUB_OWNER
    const repo = GITHUB_REPO

    const toGhIssue = (r: any): GhIssue => ({
      number: r.number,
      title: r.title,
      body: r.body ?? "",
      state: r.state,
      state_reason: r.state_reason ?? null,
      labels: (r.labels ?? []).map((l: any) => (typeof l === "string" ? l : l.name)),
      milestone: r.milestone ? { number: r.milestone.number, title: r.milestone.title } : null,
      assignees: (r.assignees ?? []).map((a: any) => a.login),
    })

    return {
      listAllIssues: () =>
        throttled(async () => {
          const out: GhIssue[] = []
          for await (const res of ok.paginate.iterator(ok.rest.issues.listForRepo, {
            owner,
            repo,
            state: "all",
            per_page: 100,
          })) {
            for (const issue of res.data) {
              if ((issue as any).pull_request) continue
              out.push(toGhIssue(issue))
            }
          }
          return out
        }),
      createIssue: (i) =>
        throttled(async () => {
          const r = await ok.rest.issues.create({
            owner,
            repo,
            title: i.title,
            body: i.body,
            labels: i.labels ? [...i.labels] : undefined,
            milestone: i.milestone ?? undefined,
            assignees: i.assignees ? [...i.assignees] : undefined,
          })
          return toGhIssue(r.data)
        }),
      updateIssue: (n, i) =>
        throttled(async () => {
          const r = await ok.rest.issues.update({
            owner,
            repo,
            issue_number: n,
            title: i.title,
            body: i.body,
            labels: i.labels ? [...i.labels] : undefined,
            milestone: i.milestone ?? undefined,
            assignees: i.assignees ? [...i.assignees] : undefined,
            state: i.state,
            state_reason: i.state_reason ?? undefined,
          })
          return toGhIssue(r.data)
        }),
      addComment: (n, body) =>
        throttled(async () => {
          await ok.rest.issues.createComment({ owner, repo, issue_number: n, body })
        }).pipe(Effect.asVoid),
      ensureLabel: (name, color, description) =>
        throttled(async () => {
          try {
            await ok.rest.issues.getLabel({ owner, repo, name })
            await ok.rest.issues.updateLabel({
              owner,
              repo,
              name,
              new_name: name,
              color,
              description,
            })
          } catch (e: any) {
            if (e.status === 404) {
              await ok.rest.issues.createLabel({ owner, repo, name, color, description })
            } else throw e
          }
        }).pipe(Effect.asVoid),
      deleteLabel: (name) =>
        throttled(async () => {
          try {
            await ok.rest.issues.deleteLabel({ owner, repo, name })
          } catch (e: any) {
            if (e.status !== 404) throw e
          }
        }).pipe(Effect.asVoid),
      ensureMilestone: (title, description, due) =>
        throttled(async () => {
          const list = await ok.rest.issues.listMilestones({ owner, repo, state: "all", per_page: 100 })
          const existing = list.data.find((m) => m.title === title)
          if (existing) {
            await ok.rest.issues.updateMilestone({
              owner,
              repo,
              milestone_number: existing.number,
              description,
              due_on: due ? new Date(due).toISOString() : undefined,
            })
            return existing.number
          }
          const r = await ok.rest.issues.createMilestone({
            owner,
            repo,
            title,
            description,
            due_on: due ? new Date(due).toISOString() : undefined,
          })
          return r.data.number
        }),
      listComments: (n) =>
        throttled(async () => {
          const out: Array<{ id: number; body: string; created_at: string; user: string }> = []
          for await (const res of ok.paginate.iterator(ok.rest.issues.listComments, {
            owner,
            repo,
            issue_number: n,
            per_page: 100,
          })) {
            for (const c of res.data) {
              out.push({ id: c.id, body: c.body ?? "", created_at: c.created_at, user: c.user?.login ?? "unknown" })
            }
          }
          return out
        }),
    }
  })
)
```

- [ ] **Step 3: Write `src/github/graphql.ts`**

```ts
import { graphql } from "@octokit/graphql"
import { Context, Effect, Layer } from "effect"
import { throttled } from "./rate-limit"
import { GITHUB_OWNER, GITHUB_REPO } from "../config"

export class GithubGql extends Context.Tag("GithubGql")<
  GithubGql,
  {
    readonly repoId: () => Effect.Effect<string, Error>
    readonly addSubIssue: (parentNumber: number, childNumber: number) => Effect.Effect<void, Error>
    readonly createProjectV2: (title: string, ownerLogin: string) => Effect.Effect<{ id: string; number: number }, Error>
    readonly linkProjectToRepo: (projectId: string, repoId: string) => Effect.Effect<void, Error>
    readonly addProjectField: (projectId: string, name: string, options: ReadonlyArray<string>) => Effect.Effect<string, Error>
    readonly addItemToProject: (projectId: string, issueNodeId: string) => Effect.Effect<string, Error>
    readonly setProjectItemFieldSingleSelect: (
      projectId: string,
      itemId: string,
      fieldId: string,
      optionId: string
    ) => Effect.Effect<void, Error>
    readonly issueNodeId: (number: number) => Effect.Effect<string, Error>
  }
>() {}

export const GithubGqlLive = Layer.effect(
  GithubGql,
  Effect.sync(() => {
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error("GITHUB_TOKEN not set")
    const gql = graphql.defaults({ headers: { authorization: `token ${token}` } })

    return {
      repoId: () =>
        throttled(async () => {
          const r: any = await gql(
            `query($o:String!,$n:String!){ repository(owner:$o,name:$n){ id } }`,
            { o: GITHUB_OWNER, n: GITHUB_REPO }
          )
          return r.repository.id as string
        }),
      issueNodeId: (number) =>
        throttled(async () => {
          const r: any = await gql(
            `query($o:String!,$n:String!,$num:Int!){ repository(owner:$o,name:$n){ issue(number:$num){ id } } }`,
            { o: GITHUB_OWNER, n: GITHUB_REPO, num: number }
          )
          return r.repository.issue.id as string
        }),
      addSubIssue: (parentNumber, childNumber) =>
        throttled(async () => {
          // GitHub's native sub-issue mutation (GA 2024). Requires both node IDs.
          const parent: any = await gql(
            `query($o:String!,$n:String!,$num:Int!){ repository(owner:$o,name:$n){ issue(number:$num){ id } } }`,
            { o: GITHUB_OWNER, n: GITHUB_REPO, num: parentNumber }
          )
          const child: any = await gql(
            `query($o:String!,$n:String!,$num:Int!){ repository(owner:$o,name:$n){ issue(number:$num){ id } } }`,
            { o: GITHUB_OWNER, n: GITHUB_REPO, num: childNumber }
          )
          await gql(
            `mutation($parent:ID!,$child:ID!){ addSubIssue(input:{issueId:$parent, subIssueId:$child}){ clientMutationId } }`,
            { parent: parent.repository.issue.id, child: child.repository.issue.id }
          )
        }).pipe(Effect.asVoid),
      createProjectV2: (title, ownerLogin) =>
        throttled(async () => {
          const uq: any = await gql(
            `query($l:String!){ user(login:$l){ id } }`,
            { l: ownerLogin }
          )
          const res: any = await gql(
            `mutation($ownerId:ID!,$title:String!){
              createProjectV2(input:{ownerId:$ownerId, title:$title}) { projectV2 { id number } }
            }`,
            { ownerId: uq.user.id, title }
          )
          return { id: res.createProjectV2.projectV2.id, number: res.createProjectV2.projectV2.number }
        }),
      linkProjectToRepo: (projectId, repoId) =>
        throttled(async () => {
          await gql(
            `mutation($p:ID!,$r:ID!){ linkProjectV2ToRepository(input:{projectId:$p, repositoryId:$r}){ repository { id } } }`,
            { p: projectId, r: repoId }
          )
        }).pipe(Effect.asVoid),
      addProjectField: (projectId, name, options) =>
        throttled(async () => {
          const res: any = await gql(
            `mutation($p:ID!,$n:String!,$o:[ProjectV2SingleSelectFieldOptionInput!]!){
              createProjectV2Field(input:{projectId:$p, dataType:SINGLE_SELECT, name:$n, singleSelectOptions:$o}) {
                projectV2Field { ... on ProjectV2SingleSelectField { id } }
              }
            }`,
            {
              p: projectId,
              n: name,
              o: options.map((name) => ({ name, color: "GRAY", description: "" })),
            }
          )
          return res.createProjectV2Field.projectV2Field.id as string
        }),
      addItemToProject: (projectId, issueNodeId) =>
        throttled(async () => {
          const res: any = await gql(
            `mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p, contentId:$c}){ item { id } } }`,
            { p: projectId, c: issueNodeId }
          )
          return res.addProjectV2ItemById.item.id as string
        }),
      setProjectItemFieldSingleSelect: (projectId, itemId, fieldId, optionId) =>
        throttled(async () => {
          await gql(
            `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){
              updateProjectV2ItemFieldValue(input:{projectId:$p, itemId:$i, fieldId:$f, value:{singleSelectOptionId:$o}}) { projectV2Item { id } }
            }`,
            { p: projectId, i: itemId, f: fieldId, o: optionId }
          )
        }).pipe(Effect.asVoid),
    }
  })
)
```

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-linear-to-github/src/github
git commit -m "feat(migrate): GitHub REST + GraphQL clients with throttling"
```

---

## Task 5: Pure label mapping (TDD)

**Files:**
- Create: `scripts/migrate-linear-to-github/tests/mapping/labels.test.ts`
- Create: `scripts/migrate-linear-to-github/src/mapping/labels.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test"
import { labelsFor } from "../../src/mapping/labels"
import type { LinearIssue } from "../../src/types"

const base = (overrides: Partial<LinearIssue> = {}): LinearIssue => ({
  identifier: "ZER-1",
  title: "t",
  description: "d",
  status: "Backlog",
  statusType: "backlog",
  priority: null,
  milestone: null,
  labels: [],
  assignee: null,
  createdAt: "2026-04-14T00:00:00Z",
  startedAt: null,
  completedAt: null,
  canceledAt: null,
  url: "u",
  project: { id: "p", name: "zero-line MVP" },
  comments: [],
  ...overrides,
})

describe("labelsFor", () => {
  test("always includes migrated-from-linear", () => {
    expect(labelsFor(base())).toContain("migrated-from-linear")
  })

  test("keeps type:* labels as-is", () => {
    expect(labelsFor(base({ labels: ["type:bug"] }))).toContain("type:bug")
  })

  test("drops area:* labels (ora-calendar leftovers)", () => {
    expect(labelsFor(base({ labels: ["area:o365", "area:cli"] }))).not.toContain("area:o365")
    expect(labelsFor(base({ labels: ["area:o365", "area:cli"] }))).not.toContain("area:cli")
  })

  test("drops legacy Bug / Feature / Improvement dupes", () => {
    const out = labelsFor(base({ labels: ["Bug", "Feature", "Improvement"] }))
    expect(out).not.toContain("Bug")
    expect(out).not.toContain("Feature")
    expect(out).not.toContain("Improvement")
  })

  test("maps priority to priority:* label", () => {
    expect(labelsFor(base({ priority: { value: 1, name: "Urgent" } }))).toContain("priority:urgent")
    expect(labelsFor(base({ priority: { value: 2, name: "High" } }))).toContain("priority:high")
    expect(labelsFor(base({ priority: { value: 3, name: "Normal" } }))).toContain("priority:normal")
    expect(labelsFor(base({ priority: { value: 4, name: "Low" } }))).toContain("priority:low")
  })

  test("no priority label when priority is null", () => {
    const out = labelsFor(base())
    expect(out.some((l) => l.startsWith("priority:"))).toBe(false)
  })

  test("deduplicates", () => {
    const out = labelsFor(base({ labels: ["type:bug", "type:bug"] }))
    expect(out.filter((l) => l === "type:bug").length).toBe(1)
  })
})
```

- [ ] **Step 2: Run — see it fail**

```bash
cd scripts/migrate-linear-to-github && bun test tests/mapping/labels.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// scripts/migrate-linear-to-github/src/mapping/labels.ts
import type { LinearIssue } from "../types"
import { priorityLabel } from "./priority"

const DROPPED_EXACT = new Set(["Bug", "Feature", "Improvement"])

export const labelsFor = (issue: LinearIssue): ReadonlyArray<string> => {
  const out = new Set<string>()
  out.add("migrated-from-linear")
  for (const l of issue.labels) {
    if (l.startsWith("area:")) continue
    if (DROPPED_EXACT.has(l)) continue
    out.add(l)
  }
  const prio = priorityLabel(issue.priority)
  if (prio) out.add(prio)
  return Array.from(out).sort()
}
```

Placeholder dependency — `priorityLabel` comes in Task 6. To avoid a circular commit, write `priority.ts` now as a tiny stub:

```ts
// scripts/migrate-linear-to-github/src/mapping/priority.ts
import type { LinearIssue } from "../types"

export const priorityLabel = (p: LinearIssue["priority"]): string | null => {
  if (!p) return null
  const name = p.name.toLowerCase()
  if (["urgent", "high", "normal", "low"].includes(name)) return `priority:${name}`
  return null
}
```

- [ ] **Step 4: Run tests — expect green**

```bash
bun test tests/mapping/labels.test.ts
```

Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-linear-to-github/src/mapping scripts/migrate-linear-to-github/tests/mapping/labels.test.ts
git commit -m "feat(migrate): label mapping (migrated-from-linear, priority, drop area:*)"
```

---

## Task 6: Pure state + priority mapping (TDD)

**Files:**
- Create: `scripts/migrate-linear-to-github/tests/mapping/priority.test.ts`
- Create: `scripts/migrate-linear-to-github/tests/mapping/state.test.ts`
- Create: `scripts/migrate-linear-to-github/src/mapping/state.ts`

`priority.ts` already exists from Task 5. Add its test.

- [ ] **Step 1: Write the priority test**

```ts
// scripts/migrate-linear-to-github/tests/mapping/priority.test.ts
import { describe, expect, test } from "bun:test"
import { priorityLabel } from "../../src/mapping/priority"

describe("priorityLabel", () => {
  test("null when priority is null", () => {
    expect(priorityLabel(null)).toBeNull()
  })
  test("Urgent", () => expect(priorityLabel({ value: 1, name: "Urgent" })).toBe("priority:urgent"))
  test("High", () => expect(priorityLabel({ value: 2, name: "High" })).toBe("priority:high"))
  test("Normal", () => expect(priorityLabel({ value: 3, name: "Normal" })).toBe("priority:normal"))
  test("Low", () => expect(priorityLabel({ value: 4, name: "Low" })).toBe("priority:low"))
  test("unknown returns null", () =>
    expect(priorityLabel({ value: 99, name: "Madeup" })).toBeNull())
})
```

- [ ] **Step 2: Run — expect pass (already implemented in Task 5)**

```bash
bun test tests/mapping/priority.test.ts
```

Expected: 6 pass.

- [ ] **Step 3: Write the state mapping test**

```ts
// scripts/migrate-linear-to-github/tests/mapping/state.test.ts
import { describe, expect, test } from "bun:test"
import { stateFor } from "../../src/mapping/state"

describe("stateFor", () => {
  test("Backlog → open, no reason", () => {
    expect(stateFor("Backlog")).toEqual({ state: "open", state_reason: null })
  })
  test("In Progress → open, no reason", () => {
    expect(stateFor("In Progress")).toEqual({ state: "open", state_reason: null })
  })
  test("Done → closed, completed", () => {
    expect(stateFor("Done")).toEqual({ state: "closed", state_reason: "completed" })
  })
  test("Canceled → closed, not_planned", () => {
    expect(stateFor("Canceled")).toEqual({ state: "closed", state_reason: "not_planned" })
  })
  test("Unknown → open, no reason (conservative)", () => {
    expect(stateFor("Something")).toEqual({ state: "open", state_reason: null })
  })
})
```

- [ ] **Step 4: Run — see fail**

Expected: `stateFor is not a function`.

- [ ] **Step 5: Implement**

```ts
// scripts/migrate-linear-to-github/src/mapping/state.ts
export interface GhState {
  readonly state: "open" | "closed"
  readonly state_reason: "completed" | "not_planned" | null
}

export const stateFor = (status: string): GhState => {
  switch (status) {
    case "Done":
      return { state: "closed", state_reason: "completed" }
    case "Canceled":
      return { state: "closed", state_reason: "not_planned" }
    default:
      return { state: "open", state_reason: null }
  }
}
```

- [ ] **Step 6: Run — expect pass**

Expected: 5 pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/migrate-linear-to-github/src/mapping/state.ts scripts/migrate-linear-to-github/tests/mapping/state.test.ts scripts/migrate-linear-to-github/tests/mapping/priority.test.ts
git commit -m "feat(migrate): state + priority mapping"
```

---

## Task 7: Pure body composer with footer (TDD)

**Files:**
- Create: `scripts/migrate-linear-to-github/tests/mapping/body.test.ts`
- Create: `scripts/migrate-linear-to-github/src/mapping/body.ts`

- [ ] **Step 1: Failing test**

```ts
// scripts/migrate-linear-to-github/tests/mapping/body.test.ts
import { describe, expect, test } from "bun:test"
import { composeBody } from "../../src/mapping/body"
import type { LinearIssue } from "../../src/types"

const issue: LinearIssue = {
  identifier: "ZER-114",
  title: "t",
  description: "Original description here.\n\nWith multiple paragraphs.",
  status: "Done",
  statusType: "completed",
  priority: { value: 2, name: "High" },
  milestone: { id: "m", name: "M-A Foundation" },
  labels: ["type:feature"],
  assignee: { id: "u1", name: "Patrice Müller", email: "p@example.com" },
  createdAt: "2026-04-16T16:40:04.563Z",
  startedAt: "2026-04-17T17:56:34.193Z",
  completedAt: "2026-04-17T18:17:49.639Z",
  canceledAt: null,
  url: "https://linear.app/splitcast/issue/ZER-114/slug",
  project: { id: "p", name: "zero-line MVP" },
  comments: [],
}

describe("composeBody", () => {
  test("preserves original description verbatim", () => {
    expect(composeBody(issue).startsWith("Original description here.\n\nWith multiple paragraphs.")).toBe(true)
  })
  test("appends separator + footer", () => {
    const body = composeBody(issue)
    expect(body).toContain("\n\n---\n")
    expect(body).toContain("**Migrated from Linear [ZER-114]")
    expect(body).toContain("https://linear.app/splitcast/issue/ZER-114/slug")
  })
  test("footer includes created / started / completed", () => {
    const body = composeBody(issue)
    expect(body).toContain("Created 2026-04-16")
    expect(body).toContain("Started 2026-04-17 17:56")
    expect(body).toContain("Completed 2026-04-17 18:17")
  })
  test("footer includes priority + assignee", () => {
    const body = composeBody(issue)
    expect(body).toContain("Priority: High")
    expect(body).toContain("Assignee: Patrice Müller")
  })
  test("footer omits absent timestamps", () => {
    const pristine = { ...issue, startedAt: null, completedAt: null }
    const body = composeBody(pristine)
    expect(body).not.toContain("Started ")
    expect(body).not.toContain("Completed ")
    expect(body).toContain("Created ")
  })
})
```

- [ ] **Step 2: Run — see fail**

- [ ] **Step 3: Implement**

```ts
// scripts/migrate-linear-to-github/src/mapping/body.ts
import type { LinearIssue } from "../types"

const fmtDay = (iso: string): string => iso.slice(0, 10)
const fmtMinute = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`

export const composeBody = (issue: LinearIssue): string => {
  const lines: string[] = []
  lines.push(`**Migrated from Linear [${issue.identifier}](${issue.url})**`)
  const dates: string[] = [`Created ${fmtDay(issue.createdAt)}`]
  if (issue.startedAt) dates.push(`Started ${fmtMinute(issue.startedAt)}`)
  if (issue.completedAt) dates.push(`Completed ${fmtMinute(issue.completedAt)}`)
  if (issue.canceledAt) dates.push(`Canceled ${fmtMinute(issue.canceledAt)}`)
  lines.push(dates.join(" · "))
  const meta: string[] = []
  if (issue.priority) meta.push(`Priority: ${issue.priority.name}`)
  if (issue.assignee) meta.push(`Assignee: ${issue.assignee.name}`)
  if (meta.length > 0) lines.push(meta.join(" · "))
  return `${issue.description}\n\n---\n${lines.join("\n")}`
}
```

- [ ] **Step 4: Run — expect pass**

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-linear-to-github/src/mapping/body.ts scripts/migrate-linear-to-github/tests/mapping/body.test.ts
git commit -m "feat(migrate): issue body composer with migration footer"
```

---

## Task 8: Audit matcher (TDD) — Linear ↔ GH heuristic

**Files:**
- Create: `scripts/migrate-linear-to-github/tests/audit/matcher.test.ts`
- Create: `scripts/migrate-linear-to-github/src/audit/matcher.ts`

Strategy: match on exact title first. Fall back to fuzzy title (strip `M-X · Task N:` prefix, compare the semantic tail). Ora-calendar contamination detected via label prefix `area:` OR title prefix matching `Task N:`/`Phase N:` without the `M-` prefix used by zero-line.

- [ ] **Step 1: Failing test**

```ts
// scripts/migrate-linear-to-github/tests/audit/matcher.test.ts
import { describe, expect, test } from "bun:test"
import { matchIssues } from "../../src/audit/matcher"
import type { LinearIssue, GhIssue } from "../../src/types"

const mkLinear = (i: Partial<LinearIssue>): LinearIssue => ({
  identifier: "ZER-X",
  title: "T",
  description: "D",
  status: "Backlog",
  statusType: "backlog",
  priority: null,
  milestone: null,
  labels: [],
  assignee: null,
  createdAt: "2026-04-14T00:00:00Z",
  startedAt: null,
  completedAt: null,
  canceledAt: null,
  url: "u",
  project: { id: "p", name: "zero-line MVP" },
  comments: [],
  ...i,
})

const mkGh = (i: Partial<GhIssue>): GhIssue => ({
  number: 1,
  title: "T",
  body: "",
  state: "open",
  state_reason: null,
  labels: [],
  milestone: null,
  assignees: [],
  ...i,
})

describe("matchIssues", () => {
  test("exact title match", () => {
    const linear = [mkLinear({ identifier: "ZER-1", title: "Foo bar" })]
    const gh = [mkGh({ number: 10, title: "Foo bar" })]
    const m = matchIssues(linear, gh)
    expect(m.matched).toHaveLength(1)
    expect(m.matched[0].github?.number).toBe(10)
    expect(m.linearOrphans).toHaveLength(0)
    expect(m.githubOrphans).toHaveLength(0)
  })

  test("linear orphan", () => {
    const linear = [mkLinear({ identifier: "ZER-2", title: "Only in linear" })]
    const m = matchIssues(linear, [])
    expect(m.linearOrphans).toHaveLength(1)
  })

  test("github orphan flagged as contamination if labels contain area:*", () => {
    const gh = [mkGh({ number: 99, title: "Task 5: HAR probe", labels: ["area:o365"] })]
    const m = matchIssues([], gh)
    expect(m.oraCalendarContamination).toHaveLength(1)
    expect(m.githubOrphans).toHaveLength(0)
  })

  test("github orphan not-contaminated stays in githubOrphans", () => {
    const gh = [mkGh({ number: 100, title: "Something zero-line related", labels: [] })]
    const m = matchIssues([], gh)
    expect(m.githubOrphans).toHaveLength(1)
    expect(m.oraCalendarContamination).toHaveLength(0)
  })

  test("drift: matched pair with different labels", () => {
    const linear = [mkLinear({ identifier: "ZER-3", title: "Same", labels: ["type:bug"] })]
    const gh = [mkGh({ number: 11, title: "Same", labels: ["type:feature"] })]
    const m = matchIssues(linear, gh)
    expect(m.matched[0].drift).toContain("labels differ")
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

```ts
// scripts/migrate-linear-to-github/src/audit/matcher.ts
import type { GhIssue, LinearIssue, MatchEntry, MigrationMap } from "../types"

const ORA_CALENDAR_LABEL_PREFIX = "area:"

const normalize = (s: string): string => s.trim().toLowerCase()

const isContaminated = (gh: GhIssue): boolean =>
  gh.labels.some((l) => l.startsWith(ORA_CALENDAR_LABEL_PREFIX))

const compareDrift = (linear: LinearIssue, gh: GhIssue): ReadonlyArray<string> => {
  const drift: string[] = []
  if (normalize(linear.title) !== normalize(gh.title)) drift.push("title differs")
  const lLabels = new Set(linear.labels.filter((l) => !l.startsWith("area:")))
  const gLabels = new Set(gh.labels.filter((l) => !l.startsWith("area:")))
  const same = lLabels.size === gLabels.size && [...lLabels].every((l) => gLabels.has(l))
  if (!same) drift.push("labels differ")
  return drift
}

export const matchIssues = (
  linear: ReadonlyArray<LinearIssue>,
  github: ReadonlyArray<GhIssue>
): MigrationMap => {
  const remaining = new Map(github.map((g) => [normalize(g.title), g]))
  const matched: MatchEntry[] = []
  const linearOrphans: LinearIssue[] = []

  for (const li of linear) {
    const key = normalize(li.title)
    const gh = remaining.get(key)
    if (gh) {
      matched.push({ linear: li, github: gh, drift: compareDrift(li, gh) })
      remaining.delete(key)
    } else {
      linearOrphans.push(li)
    }
  }

  const remainingArr = Array.from(remaining.values())
  const oraCalendarContamination = remainingArr.filter(isContaminated)
  const githubOrphans = remainingArr.filter((g) => !isContaminated(g))

  return { matched, linearOrphans, githubOrphans, oraCalendarContamination }
}
```

- [ ] **Step 4: Run — expect pass**

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-linear-to-github/src/audit/matcher.ts scripts/migrate-linear-to-github/tests/audit/matcher.test.ts
git commit -m "feat(migrate): audit matcher — Linear ↔ GH title-based pairing"
```

---

## Task 9: Audit report renderer (TDD)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/audit/report.ts`
- Extension: add a second block of tests to `tests/audit/matcher.test.ts` OR new `tests/audit/report.test.ts`.

Use a separate test file for the renderer to keep tests focused.

- [ ] **Step 1: Failing test**

```ts
// scripts/migrate-linear-to-github/tests/audit/report.test.ts
import { describe, expect, test } from "bun:test"
import { renderAuditReport } from "../../src/audit/report"
import type { MigrationMap } from "../../src/types"

const empty: MigrationMap = {
  matched: [],
  linearOrphans: [],
  githubOrphans: [],
  oraCalendarContamination: [],
}

describe("renderAuditReport", () => {
  test("includes header with counts", () => {
    const r = renderAuditReport(empty)
    expect(r).toContain("# Migration audit")
    expect(r).toContain("Matched: 0")
    expect(r).toContain("Linear orphans: 0")
    expect(r).toContain("GitHub orphans: 0")
    expect(r).toContain("Ora-calendar contamination: 0")
  })

  test("lists each ora-calendar contamination row", () => {
    const m: MigrationMap = {
      ...empty,
      oraCalendarContamination: [{
        number: 35,
        title: "Task 27: Guarded integration test",
        body: "",
        state: "open",
        state_reason: null,
        labels: ["area:o365"],
        milestone: null,
        assignees: [],
      }],
    }
    const r = renderAuditReport(m)
    expect(r).toContain("#35")
    expect(r).toContain("Task 27: Guarded integration test")
    expect(r).toContain("area:o365")
  })

  test("lists matched pairs with drift", () => {
    const m: MigrationMap = {
      ...empty,
      matched: [{
        linear: {
          identifier: "ZER-1", title: "Alpha", description: "", status: "Backlog",
          statusType: "backlog", priority: null, milestone: null, labels: ["type:bug"],
          assignee: null, createdAt: "2026-04-14T00:00:00Z", startedAt: null,
          completedAt: null, canceledAt: null, url: "u", project: { id: "p", name: "zero-line MVP" }, comments: [],
        },
        github: {
          number: 5, title: "Alpha", body: "", state: "open", state_reason: null,
          labels: ["type:feature"], milestone: null, assignees: [],
        },
        drift: ["labels differ"],
      }],
    }
    const r = renderAuditReport(m)
    expect(r).toContain("ZER-1")
    expect(r).toContain("#5")
    expect(r).toContain("labels differ")
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

```ts
// scripts/migrate-linear-to-github/src/audit/report.ts
import type { MigrationMap } from "../types"

export const renderAuditReport = (m: MigrationMap): string => {
  const lines: string[] = []
  lines.push("# Migration audit")
  lines.push("")
  lines.push(`- Matched: ${m.matched.length}`)
  lines.push(`- Linear orphans: ${m.linearOrphans.length}`)
  lines.push(`- GitHub orphans: ${m.githubOrphans.length}`)
  lines.push(`- Ora-calendar contamination: ${m.oraCalendarContamination.length}`)
  lines.push("")
  const drifted = m.matched.filter((e) => e.drift.length > 0)
  lines.push(`## Matched pairs with drift (${drifted.length})`)
  for (const e of drifted) {
    lines.push(`- **${e.linear.identifier} ↔ #${e.github!.number}** — ${e.drift.join(", ")}`)
  }
  lines.push("")
  lines.push(`## Linear orphans (${m.linearOrphans.length})`)
  for (const li of m.linearOrphans) {
    lines.push(`- **${li.identifier}** ${li.title} [${li.status}]`)
  }
  lines.push("")
  lines.push(`## Ora-calendar contamination — eviction candidates (${m.oraCalendarContamination.length})`)
  for (const g of m.oraCalendarContamination) {
    lines.push(`- **#${g.number}** ${g.title} — labels: ${g.labels.join(", ")}`)
  }
  lines.push("")
  lines.push(`## GitHub orphans (not contaminated) (${m.githubOrphans.length})`)
  for (const g of m.githubOrphans) {
    lines.push(`- **#${g.number}** ${g.title} — labels: ${g.labels.join(", ") || "—"}`)
  }
  return lines.join("\n") + "\n"
}
```

- [ ] **Step 4: Run — expect pass**

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-linear-to-github/src/audit/report.ts scripts/migrate-linear-to-github/tests/audit/report.test.ts
git commit -m "feat(migrate): audit report renderer"
```

---

## Task 10: Audit phase command (Phase 1)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/phases/1-audit.ts`

- [ ] **Step 1: Write the phase command**

```ts
// scripts/migrate-linear-to-github/src/phases/1-audit.ts
import { Effect, Layer } from "effect"
import { readFileSync, writeFileSync, readdirSync } from "fs"
import { MIGRATION_DIR, reportPath } from "../config"
import { GithubRest, GithubRestLive } from "../github/rest"
import { matchIssues } from "../audit/matcher"
import { renderAuditReport } from "../audit/report"
import type { LinearSnapshot } from "../types"

const loadLatestSnapshot = (): LinearSnapshot => {
  const files = readdirSync(MIGRATION_DIR)
    .filter((f) => f.startsWith("linear-snapshot-") && f.endsWith(".json"))
    .sort()
  if (files.length === 0) {
    throw new Error(`No snapshot found in ${MIGRATION_DIR}. Run 'snapshot --apply' first.`)
  }
  const latest = files[files.length - 1]
  return JSON.parse(readFileSync(`${MIGRATION_DIR}/${latest}`, "utf8")) as LinearSnapshot
}

export const run = async ({ apply }: { apply: boolean }): Promise<number> => {
  const snap = loadLatestSnapshot()
  const program = Effect.gen(function* () {
    const rest = yield* GithubRest
    const github = yield* rest.listAllIssues()
    const map = matchIssues(snap.issues, github)
    return renderAuditReport(map)
  }).pipe(Effect.provide(GithubRestLive))

  const report = await Effect.runPromise(program)
  const date = new Date().toISOString().slice(0, 10)
  const path = reportPath("audit", date)
  if (apply) {
    writeFileSync(path, report)
    console.log(`wrote ${path}`)
  } else {
    console.log("[dry-run] report preview:\n")
    console.log(report)
    console.log(`[dry-run] rerun with --apply to write ${path}`)
  }
  return 0
}
```

- [ ] **Step 2: Dry-run**

```bash
bun zl-migrate audit
```

Expected: prints the audit report to stdout (numbers should reflect current Linear & GH state: ~93 Linear issues, ~98 GH issues, N contamination).

- [ ] **Step 3: Apply (writes committed audit report)**

```bash
bun zl-migrate audit --apply
```

Expected: `wrote docs/migration/audit-<date>.md`.

Inspect the report. Confirm ora-calendar contamination list matches expectations (should be 20-40 issues). Confirm Linear orphans list is small (issues created on Linear but never mirrored).

- [ ] **Step 4: Commit audit report + phase code**

```bash
git add scripts/migrate-linear-to-github/src/phases/1-audit.ts docs/migration/audit-*.md
git commit -m "feat(migrate): phase 1 audit command + first audit report"
```

**Gate:** user reviews `docs/migration/audit-<date>.md` and explicitly approves before moving to Task 11.

---

## Task 11: Evict ora-calendar (Phase 2)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/phases/2-evict.ts`

- [ ] **Step 1: Write the phase**

```ts
// scripts/migrate-linear-to-github/src/phases/2-evict.ts
import { Effect } from "effect"
import { readFileSync, readdirSync, writeFileSync } from "fs"
import { MIGRATION_DIR, reportPath } from "../config"
import { GithubRest, GithubRestLive } from "../github/rest"
import { matchIssues } from "../audit/matcher"
import type { LinearSnapshot } from "../types"

const EVICTION_COMMENT = (gh: { title: string }) =>
  `This issue belongs to the **ora-calendar** project, not zero-line. ` +
  `See \`swissonid/ora-calendar\` for its tracking (or recreate there if missing). ` +
  `Closed during the Linear→GitHub migration cleanup of \`swissonid/zero-line\`.`

const ORA_LABELS_TO_DELETE = [
  "area:o365", "area:sidecar", "area:db", "area:sync",
  "area:docs", "area:cli", "area:caldav", "area:google",
]

const LEGACY_LABELS_TO_DELETE = ["Bug", "Feature", "Improvement"]

export const run = async ({ apply }: { apply: boolean }): Promise<number> => {
  const files = readdirSync(MIGRATION_DIR).filter((f) => f.startsWith("linear-snapshot-")).sort()
  const snap = JSON.parse(readFileSync(`${MIGRATION_DIR}/${files[files.length - 1]}`, "utf8")) as LinearSnapshot
  const program = Effect.gen(function* () {
    const rest = yield* GithubRest
    const github = yield* rest.listAllIssues()
    const map = matchIssues(snap.issues, github)
    const lines: string[] = ["# Phase 2 — ora-calendar eviction", ""]
    lines.push(`- Issues to close: ${map.oraCalendarContamination.length}`)
    lines.push(`- Labels to delete: ${[...ORA_LABELS_TO_DELETE, ...LEGACY_LABELS_TO_DELETE].length}`)
    lines.push("")
    if (apply) {
      for (const issue of map.oraCalendarContamination) {
        yield* rest.addComment(issue.number, EVICTION_COMMENT(issue))
        yield* rest.updateIssue(issue.number, { state: "closed", state_reason: "not_planned" })
        lines.push(`- closed #${issue.number} ${issue.title}`)
      }
      for (const label of [...ORA_LABELS_TO_DELETE, ...LEGACY_LABELS_TO_DELETE]) {
        yield* rest.deleteLabel(label)
        lines.push(`- deleted label '${label}'`)
      }
    } else {
      for (const issue of map.oraCalendarContamination) {
        lines.push(`- [dry-run] would close #${issue.number} ${issue.title}`)
      }
      for (const label of [...ORA_LABELS_TO_DELETE, ...LEGACY_LABELS_TO_DELETE]) {
        lines.push(`- [dry-run] would delete label '${label}'`)
      }
    }
    return lines.join("\n") + "\n"
  }).pipe(Effect.provide(GithubRestLive))

  const report = await Effect.runPromise(program)
  console.log(report)
  if (apply) {
    const date = new Date().toISOString().slice(0, 10)
    writeFileSync(reportPath("evict", date), report)
  }
  return 0
}
```

- [ ] **Step 2: Dry-run**

```bash
bun zl-migrate evict-ora-calendar
```

Expected: prints `[dry-run] would close #35 Task 27: Guarded integration test`, etc.

- [ ] **Step 3: Apply**

```bash
bun zl-migrate evict-ora-calendar --apply
```

Expected: closes ~20-40 issues, deletes ~11 labels.

Spot check one closed issue in GitHub UI — it should show the eviction comment.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-linear-to-github/src/phases/2-evict.ts docs/migration/evict-*.md
git commit -m "feat(migrate): phase 2 ora-calendar eviction"
```

---

## Task 12: Structure setup — labels + milestones (Phase 3a)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/phases/3a-labels-milestones.ts`
- Create: `scripts/migrate-linear-to-github/src/phases/3-setup-structure.ts` (orchestrator, stub for now)

- [ ] **Step 1: Write 3a**

```ts
// scripts/migrate-linear-to-github/src/phases/3a-labels-milestones.ts
import { Effect } from "effect"
import { GithubRest } from "../github/rest"
import { readFileSync, readdirSync } from "fs"
import { MIGRATION_DIR } from "../config"
import type { LinearSnapshot } from "../types"

export const LABELS_TO_CREATE: ReadonlyArray<{ name: string; color: string; description?: string }> = [
  { name: "priority:urgent", color: "b60205", description: "Linear priority: Urgent" },
  { name: "priority:high", color: "d93f0b", description: "Linear priority: High" },
  { name: "priority:normal", color: "fbca04", description: "Linear priority: Normal" },
  { name: "priority:low", color: "c5def5", description: "Linear priority: Low" },
  { name: "tracking", color: "5319e7", description: "Sub-milestone tracking issue" },
  { name: "migrated-from-linear", color: "8b949e", description: "Created during Linear→GitHub migration 2026-04" },
]

export const MILESTONE_PLAN: ReadonlyArray<{ title: string; description: string; due: string | null }> = [
  { title: "M-0 Pre-Foundation", description: "Archive bucket for pre-M-A tickets from the original core-and-cli plan. No due date; all tickets here are closed.", due: null },
  { title: "M-A Foundation", description: "Core hardening, CLI polish (init/doctor/secret), distribution tooling, v0.1.0 release. Sub-plans: M-A1/M-A2/M-A3/M-A4 (see tracking issues).", due: "2026-05-07" },
  { title: "M-B iOS Archive", description: "Tag v0.2.0. `zl run build` produces a signed iOS .xcarchive/.ipa. Depends on M-A.", due: "2026-05-21" },
  { title: "M-C iOS → TestFlight", description: "Tag v0.3.0. `zl run release:testflight` ships a build to TestFlight. Depends on M-B.", due: "2026-06-04" },
  { title: "M-D iOS App Store + Android Archive", description: "Tag v0.4.0. iOS App Store phased submission; Android .aab/.apk signed. Depends on M-C.", due: "2026-06-18" },
  { title: "M-E Android → Firebase / Play Internal", description: "Tag v0.5.0. `zl run release:internal-android`. Depends on M-D.", due: "2026-07-02" },
  { title: "M-F Play Store + v1.0 Release", description: "Tag v1.0.0. Play Store alpha/beta/prod submission; public v1.0 announcement. Depends on M-E.", due: "2026-07-16" },
]

export const setupLabelsAndMilestones = (apply: boolean) =>
  Effect.gen(function* () {
    const rest = yield* GithubRest
    const lines: string[] = ["## Phase 3a — labels + milestones", ""]
    for (const l of LABELS_TO_CREATE) {
      if (apply) {
        yield* rest.ensureLabel(l.name, l.color, l.description)
        lines.push(`- ensured label '${l.name}'`)
      } else {
        lines.push(`- [dry-run] would ensure label '${l.name}'`)
      }
    }
    for (const m of MILESTONE_PLAN) {
      if (apply) {
        const n = yield* rest.ensureMilestone(m.title, m.description, m.due)
        lines.push(`- ensured milestone #${n} '${m.title}'`)
      } else {
        lines.push(`- [dry-run] would ensure milestone '${m.title}' (due ${m.due ?? "—"})`)
      }
    }
    return lines.join("\n") + "\n"
  })
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit (no real API call yet — 3a is composed into 3 orchestrator next)**

```bash
git add scripts/migrate-linear-to-github/src/phases/3a-labels-milestones.ts
git commit -m "feat(migrate): phase 3a labels + milestones plan"
```

---

## Task 13: Tracking issues + sub-issue wiring (Phase 3b)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/phases/3b-tracking-issues.ts`

Tracking issues are created **empty of sub-issues** here. The sub-issue parent wiring happens in Phase 4 reconciliation (where each task issue knows its ZER-N → M-A1/A2/A3/A4 mapping from the snapshot).

The ZER-N → sub-milestone mapping is encoded here as a table, derived from the M-A description ticket ranges.

- [ ] **Step 1: Write 3b**

```ts
// scripts/migrate-linear-to-github/src/phases/3b-tracking-issues.ts
import { Effect } from "effect"
import { GithubRest } from "../github/rest"

export const SUB_MILESTONE_PLAN: ReadonlyArray<{
  tag: "M-A1" | "M-A2" | "M-A3" | "M-A4"
  title: string
  description: string
  zerRange: { start: number; end: number }  // inclusive
}> = [
  {
    tag: "M-A1",
    title: "[Tracking] M-A1 Core Hardening",
    description:
      "Freeze `@zl/core@0.1.0` as a complete plugin-ready surface. " +
      "Source of truth: [docs/superpowers/plans/2026-04-16-m-a1-core-hardening.md](../blob/main/docs/superpowers/plans/2026-04-16-m-a1-core-hardening.md). " +
      "Depends on: nothing. Blocks: M-A2, M-A3, M-A4.",
    zerRange: { start: 102, end: 117 },
  },
  {
    tag: "M-A2",
    title: "[Tracking] M-A2 CLI Subcommands",
    description:
      "`zl init`, `zl doctor`, `zl secret`, SecretStore port + adapters. " +
      "Source of truth: [docs/superpowers/plans/2026-04-17-m-a2-cli-subcommands.md](../blob/main/docs/superpowers/plans/2026-04-17-m-a2-cli-subcommands.md). " +
      "Depends on: M-A1.",
    zerRange: { start: 118, end: 128 },
  },
  {
    tag: "M-A3",
    title: "[Tracking] M-A3 Release Tooling",
    description:
      "CHANGELOG, release scripts, CI, Homebrew tap, NPM_TOKEN, runbook. " +
      "Source of truth: [docs/superpowers/plans/2026-04-17-m-a3-release-tooling.md](../blob/main/docs/superpowers/plans/2026-04-17-m-a3-release-tooling.md). " +
      "Depends on: M-A1.",
    zerRange: { start: 136, end: 149 },
  },
  {
    tag: "M-A4",
    title: "[Tracking] M-A4 v0.1.0 tag",
    description:
      "Pre-flight, CHANGELOG cutover, tag v0.1.0, verify release pipeline, dogfood fresh machine, kickoff M-B. " +
      "Source of truth: [docs/superpowers/plans/2026-04-17-m-a4-v0-1-0-tag.md](../blob/main/docs/superpowers/plans/2026-04-17-m-a4-v0-1-0-tag.md). " +
      "Depends on: M-A1, M-A2, M-A3.",
    zerRange: { start: 129, end: 135 },
  },
]

export const subMilestoneFor = (zerN: number): "M-A1" | "M-A2" | "M-A3" | "M-A4" | null => {
  for (const sm of SUB_MILESTONE_PLAN) {
    if (zerN >= sm.zerRange.start && zerN <= sm.zerRange.end) return sm.tag
  }
  return null
}

export const setupTrackingIssues = (
  apply: boolean,
  milestoneNumbers: ReadonlyMap<string, number>
) =>
  Effect.gen(function* () {
    const rest = yield* GithubRest
    const maMilestone = milestoneNumbers.get("M-A Foundation")
    if (!maMilestone) throw new Error("M-A Foundation milestone not found — run 3a first")
    const lines: string[] = ["## Phase 3b — tracking issues", ""]
    const created = new Map<string, number>()
    for (const sm of SUB_MILESTONE_PLAN) {
      // Check if tracking issue already exists (idempotency)
      const all = yield* rest.listAllIssues()
      const existing = all.find((i) => i.title === sm.title)
      if (existing) {
        created.set(sm.tag, existing.number)
        lines.push(`- reuse existing tracking issue #${existing.number} '${sm.title}'`)
        continue
      }
      if (apply) {
        const issue = yield* rest.createIssue({
          title: sm.title,
          body: sm.description,
          labels: ["tracking", "migrated-from-linear"],
          milestone: maMilestone,
        })
        created.set(sm.tag, issue.number)
        lines.push(`- created tracking issue #${issue.number} '${sm.title}'`)
      } else {
        lines.push(`- [dry-run] would create tracking issue '${sm.title}'`)
      }
    }
    return { text: lines.join("\n") + "\n", trackingNumbers: created }
  })
```

- [ ] **Step 2: Commit**

```bash
git add scripts/migrate-linear-to-github/src/phases/3b-tracking-issues.ts
git commit -m "feat(migrate): phase 3b tracking issues plan (4 sub-milestones)"
```

---

## Task 14: Projects v2 setup (Phase 3c)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/phases/3c-projects-v2.ts`

- [ ] **Step 1: Write 3c**

```ts
// scripts/migrate-linear-to-github/src/phases/3c-projects-v2.ts
import { Effect } from "effect"
import { GithubGql } from "../github/graphql"
import { GITHUB_OWNER } from "../config"

export const PROJECT_TITLE = "zero-line"

export const CUSTOM_FIELDS: ReadonlyArray<{ name: string; options: ReadonlyArray<string> }> = [
  { name: "Sub-milestone", options: ["M-A1", "M-A2", "M-A3", "M-A4"] },
  { name: "Priority", options: ["Urgent", "High", "Normal", "Low"] },
  { name: "Type", options: ["feature", "bug", "chore", "test"] },
  { name: "Area", options: ["core", "cli", "config", "steps"] },  // seeded values; easily extensible in UI
]

export const setupProjectsV2 = (apply: boolean) =>
  Effect.gen(function* () {
    const gql = yield* GithubGql
    const lines: string[] = ["## Phase 3c — Projects v2", ""]
    if (!apply) {
      lines.push(`- [dry-run] would create project '${PROJECT_TITLE}' owned by ${GITHUB_OWNER}`)
      lines.push(`- [dry-run] would link to swissonid/zero-line`)
      for (const f of CUSTOM_FIELDS) {
        lines.push(`- [dry-run] would create field '${f.name}' with options: ${f.options.join(", ")}`)
      }
      lines.push("")
      lines.push("**Manual step after apply:** configure auto-add workflow, roadmap/board/backlog/tracking views, and status automations in the GitHub UI (GraphQL support for these is partial).")
      return { text: lines.join("\n") + "\n", projectId: null, fieldIds: new Map<string, string>() }
    }
    const repoId = yield* gql.repoId()
    const project = yield* gql.createProjectV2(PROJECT_TITLE, GITHUB_OWNER)
    yield* gql.linkProjectToRepo(project.id, repoId)
    lines.push(`- created project #${project.number} '${PROJECT_TITLE}' and linked to repo`)
    const fieldIds = new Map<string, string>()
    for (const f of CUSTOM_FIELDS) {
      const id = yield* gql.addProjectField(project.id, f.name, f.options)
      fieldIds.set(f.name, id)
      lines.push(`- created field '${f.name}' (${id})`)
    }
    lines.push("")
    lines.push("**Next manual step (user):**")
    lines.push(`- Open https://github.com/users/${GITHUB_OWNER}/projects/${project.number}/settings`)
    lines.push("- Workflows → enable 'Auto-add to project' for issues in swissonid/zero-line")
    lines.push("- Workflows → enable 'Item closed → Done', 'PR opened → In Review'")
    lines.push("- Create views: Roadmap (group by Milestone, swim by Sub-milestone), Board (by Status), Backlog (table), Tracking (filter label:tracking)")
    lines.push("")
    lines.push("After configuring, re-run with --apply to resume automated setup. The script is idempotent and will skip already-created fields.")
    return { text: lines.join("\n") + "\n", projectId: project.id, fieldIds }
  })
```

- [ ] **Step 2: Write the `3-setup-structure.ts` orchestrator**

```ts
// scripts/migrate-linear-to-github/src/phases/3-setup-structure.ts
import { Effect } from "effect"
import { writeFileSync } from "fs"
import { GithubRest, GithubRestLive } from "../github/rest"
import { GithubGqlLive } from "../github/graphql"
import { reportPath } from "../config"
import { MILESTONE_PLAN, setupLabelsAndMilestones } from "./3a-labels-milestones"
import { setupTrackingIssues } from "./3b-tracking-issues"
import { setupProjectsV2 } from "./3c-projects-v2"

export const run = async ({ apply }: { apply: boolean }): Promise<number> => {
  const program = Effect.gen(function* () {
    const rest = yield* GithubRest
    const parts: string[] = ["# Phase 3 — setup structure", ""]
    const p3a = yield* setupLabelsAndMilestones(apply)
    parts.push(p3a)

    // For 3b we need the milestone number for M-A Foundation.
    const ms = new Map<string, number>()
    if (apply) {
      for (const m of MILESTONE_PLAN) {
        const n = yield* rest.ensureMilestone(m.title, m.description, m.due)
        ms.set(m.title, n)
      }
    }
    const p3b = yield* setupTrackingIssues(apply, ms)
    parts.push(p3b.text)

    const p3c = yield* setupProjectsV2(apply)
    parts.push(p3c.text)
    return parts.join("\n")
  }).pipe(Effect.provide(GithubRestLive), Effect.provide(GithubGqlLive))

  const report = await Effect.runPromise(program)
  console.log(report)
  if (apply) {
    const date = new Date().toISOString().slice(0, 10)
    writeFileSync(reportPath("setup-structure", date), report)
  }
  return 0
}
```

- [ ] **Step 3: Dry-run**

```bash
bun zl-migrate setup-structure
```

Expected: prints the plan for all of 3a+3b+3c without hitting the API.

- [ ] **Step 4: Apply**

```bash
bun zl-migrate setup-structure --apply
```

Expected: creates 6 labels, 7 milestones, 4 tracking issues, 1 Projects v2 project with 4 fields. **Pauses** at the end with a manual step prompt — configure UI workflows and views.

- [ ] **Step 5: User performs the manual UI configuration** (per the printed checklist).

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-linear-to-github/src/phases/3c-projects-v2.ts scripts/migrate-linear-to-github/src/phases/3-setup-structure.ts docs/migration/setup-structure-*.md
git commit -m "feat(migrate): phase 3 setup-structure orchestrator + Projects v2"
```

---

## Task 15: Reconcile command (Phase 4)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/phases/4-reconcile.ts`

Largest phase. Reconciles each Linear issue with its GitHub counterpart (or creates a new one). Writes each pairing to `docs/migration/linear-github-mapping.csv`. Wires sub-issue parents.

- [ ] **Step 1: Write the phase**

```ts
// scripts/migrate-linear-to-github/src/phases/4-reconcile.ts
import { Effect } from "effect"
import { readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync } from "fs"
import { MIGRATION_DIR, reportPath, MAPPING_CSV_PATH } from "../config"
import { GithubRest, GithubRestLive } from "../github/rest"
import { GithubGql, GithubGqlLive } from "../github/graphql"
import { matchIssues } from "../audit/matcher"
import { labelsFor } from "../mapping/labels"
import { stateFor } from "../mapping/state"
import { composeBody } from "../mapping/body"
import { SUB_MILESTONE_PLAN, subMilestoneFor } from "./3b-tracking-issues"
import { MILESTONE_PLAN } from "./3a-labels-milestones"
import type { LinearSnapshot, LinearIssue, LinearComment, GhIssue } from "../types"

const loadSnapshot = (): LinearSnapshot => {
  const files = readdirSync(MIGRATION_DIR).filter((f) => f.startsWith("linear-snapshot-")).sort()
  return JSON.parse(readFileSync(`${MIGRATION_DIR}/${files[files.length - 1]}`, "utf8")) as LinearSnapshot
}

const milestoneTitleFor = (l: LinearIssue): string => {
  if (l.milestone) return l.milestone.name
  return "M-0 Pre-Foundation"
}

const ensureMappingCsvHeader = () => {
  if (!existsSync(MAPPING_CSV_PATH)) {
    writeFileSync(MAPPING_CSV_PATH, "linear_id,gh_number,title\n")
  }
}

const appendMapping = (linearId: string, ghNumber: number, title: string) => {
  const escaped = title.replace(/"/g, '""')
  appendFileSync(MAPPING_CSV_PATH, `${linearId},${ghNumber},"${escaped}"\n`)
}

const commentsToPost = (
  linear: LinearIssue,
  ghComments: ReadonlyArray<{ body: string; created_at: string }>
): ReadonlyArray<LinearComment> => {
  // Naive: consider a comment already mirrored if a GH comment contains the first 40 chars of its body.
  const already = new Set(ghComments.map((c) => c.body.slice(0, 40)))
  return linear.comments.filter((c) => !already.has(c.body.slice(0, 40)))
}

const formatComment = (c: LinearComment): string =>
  `> Originally posted by @${c.author} on Linear, ${c.createdAt.slice(0, 16).replace("T", " ")}\n\n${c.body}`

export const run = async ({ apply }: { apply: boolean }): Promise<number> => {
  const snap = loadSnapshot()
  const program = Effect.gen(function* () {
    const rest = yield* GithubRest
    const gql = yield* GithubGql
    const gh = yield* rest.listAllIssues()
    const milestones = new Map<string, number>()
    if (apply) {
      for (const m of MILESTONE_PLAN) {
        milestones.set(m.title, yield* rest.ensureMilestone(m.title, m.description, m.due))
      }
    }
    const map = matchIssues(snap.issues, gh.filter((g) =>
      !g.labels.some((l) => l.startsWith("area:"))  // evicted already
    ))
    const lines: string[] = ["# Phase 4 — reconcile", ""]
    lines.push(`- matched: ${map.matched.length}`)
    lines.push(`- linear orphans (will be created): ${map.linearOrphans.length}`)
    lines.push("")
    if (apply) ensureMappingCsvHeader()

    // Find tracking issue numbers for sub-issue wiring.
    const trackingByTag = new Map<string, number>()
    for (const sm of SUB_MILESTONE_PLAN) {
      const t = gh.find((i) => i.title === sm.title)
      if (t) trackingByTag.set(sm.tag, t.number)
    }

    for (const li of [...map.matched.map((m) => ({ li: m.linear, gh: m.github })), ...map.linearOrphans.map((li) => ({ li, gh: null as GhIssue | null }))]) {
      const { state, state_reason } = stateFor(li.li.status)
      const labels = labelsFor(li.li)
      const body = composeBody(li.li)
      const mTitle = milestoneTitleFor(li.li)
      const milestone = milestones.get(mTitle) ?? null
      const ghNumber = apply
        ? (li.gh
            ? (yield* rest.updateIssue(li.gh.number, {
                title: li.li.title,
                body,
                labels,
                milestone,
                state,
                state_reason,
                assignees: li.li.assignee ? ["swissonid"] : undefined,
              })).number
            : (yield* rest.createIssue({
                title: li.li.title,
                body,
                labels,
                milestone: milestone ?? undefined,
                assignees: li.li.assignee ? ["swissonid"] : undefined,
              })).number)
        : li.gh?.number ?? -1
      lines.push(`- ${apply ? "wrote" : "[dry-run]"} ${li.li.identifier} → #${ghNumber} ${li.li.title}`)
      if (apply) appendMapping(li.li.identifier, ghNumber, li.li.title)

      // Sub-issue wiring for M-A1..M-A4 task issues.
      const match = /ZER-(\d+)/.exec(li.li.identifier)
      if (match) {
        const n = parseInt(match[1])
        const tag = subMilestoneFor(n)
        if (tag) {
          const parent = trackingByTag.get(tag)
          if (parent && apply && ghNumber > 0) {
            yield* gql.addSubIssue(parent, ghNumber)
            lines.push(`  - wired as sub-issue of #${parent} (${tag})`)
          }
        }
      }

      // Close state enforcement (updateIssue does it above, but if creating then re-update).
      if (apply && !li.gh && state === "closed" && ghNumber > 0) {
        yield* rest.updateIssue(ghNumber, { state, state_reason })
      }

      // Missing comments.
      if (apply && ghNumber > 0) {
        const existing = yield* rest.listComments(ghNumber)
        const missing = commentsToPost(li.li, existing)
        for (const c of missing) {
          yield* rest.addComment(ghNumber, formatComment(c))
        }
        if (missing.length > 0) {
          lines.push(`  - posted ${missing.length} missing comment(s)`)
        }
      }
    }
    return lines.join("\n") + "\n"
  }).pipe(Effect.provide(GithubRestLive), Effect.provide(GithubGqlLive))

  const report = await Effect.runPromise(program)
  console.log(report)
  if (apply) {
    const date = new Date().toISOString().slice(0, 10)
    writeFileSync(reportPath("reconcile", date), report)
  }
  return 0
}
```

- [ ] **Step 2: Dry-run**

```bash
bun zl-migrate reconcile
```

Expected: prints the planned per-issue actions. ~93 lines, one per Linear issue.

- [ ] **Step 3: Apply**

```bash
bun zl-migrate reconcile --apply
```

Expected: 93 issues updated-or-created, sub-issue wires on M-A1..M-A4, comments posted, mapping CSV grown to 93 rows.

Spot check in GitHub UI:
- A tracking issue (e.g. M-A1 Core Hardening) — should show `X of Y done` with ~16 children
- A closed-done issue — footer with Linear link, completed date
- A comment mirrored from Linear — attribution line intact

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-linear-to-github/src/phases/4-reconcile.ts docs/migration/reconcile-*.md docs/migration/linear-github-mapping.csv
git commit -m "feat(migrate): phase 4 reconciliation + mapping CSV"
```

---

## Task 16: Populate Projects v2 (Phase 5)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/phases/5-populate-project.ts`

Requires the Projects v2 project to exist (from Phase 3c) and all issues to exist (Phase 4). Reads the project + field IDs via GraphQL, adds every repo issue as an item, sets Sub-milestone / Priority / Type / Area for each.

- [ ] **Step 1: Write the phase**

```ts
// scripts/migrate-linear-to-github/src/phases/5-populate-project.ts
import { Effect } from "effect"
import { GithubRest, GithubRestLive } from "../github/rest"
import { GithubGql, GithubGqlLive } from "../github/graphql"
import { GITHUB_OWNER } from "../config"
import { SUB_MILESTONE_PLAN, subMilestoneFor } from "./3b-tracking-issues"
import { reportPath } from "../config"
import { writeFileSync, readFileSync, existsSync } from "fs"
import { MAPPING_CSV_PATH } from "../config"

// Find the project by title, look up its fields, map optionIds by option-name.
// (Encoded via the addProjectField mutation responses in Phase 3c would be tidier
// but Phase 5 is safe to re-derive via a listing query.)

const FIND_PROJECT = `
  query($login:String!){
    user(login:$login){
      projectsV2(first:50){ nodes { id number title fields(first:20){ nodes { __typename ... on ProjectV2SingleSelectField { id name options { id name } } } } } }
    }
  }
`

export const run = async ({ apply }: { apply: boolean }): Promise<number> => {
  const program = Effect.gen(function* () {
    const rest = yield* GithubRest
    const gql = yield* GithubGql
    const lines: string[] = ["# Phase 5 — populate projects v2", ""]
    // Inline GraphQL for the list query (simpler than adding another method).
    const proj: any = yield* Effect.tryPromise(async () => {
      const { graphql } = await import("@octokit/graphql")
      const g = graphql.defaults({ headers: { authorization: `token ${process.env.GITHUB_TOKEN}` } })
      const r: any = await g(FIND_PROJECT, { login: GITHUB_OWNER })
      const p = r.user.projectsV2.nodes.find((n: any) => n.title === "zero-line")
      if (!p) throw new Error("Project 'zero-line' not found — run setup-structure --apply first")
      return p
    })
    const fieldIds = new Map<string, string>()
    const optionIds = new Map<string, Map<string, string>>()
    for (const f of proj.fields.nodes) {
      if (f.__typename !== "ProjectV2SingleSelectField") continue
      fieldIds.set(f.name, f.id)
      const opts = new Map<string, string>()
      for (const o of f.options) opts.set(o.name, o.id)
      optionIds.set(f.name, opts)
    }

    const issues = yield* rest.listAllIssues()
    const zerOf = (body: string): number | null => {
      const m = /Migrated from Linear \[ZER-(\d+)\]/.exec(body)
      return m ? parseInt(m[1]) : null
    }
    for (const issue of issues) {
      const nodeId = yield* gql.issueNodeId(issue.number)
      const itemId = apply ? yield* gql.addItemToProject(proj.id, nodeId) : "[dry-run]"
      lines.push(`- ${apply ? "added" : "[dry-run] would add"} #${issue.number} to project (${itemId})`)
      if (!apply) continue

      // Sub-milestone from ZER-N.
      const zerN = zerOf(issue.body)
      if (zerN) {
        const tag = subMilestoneFor(zerN)
        if (tag) {
          const f = fieldIds.get("Sub-milestone")
          const o = optionIds.get("Sub-milestone")?.get(tag)
          if (f && o) yield* gql.setProjectItemFieldSingleSelect(proj.id, itemId, f, o)
        }
      }
      // Priority from label.
      const prio = issue.labels.find((l) => l.startsWith("priority:"))
      if (prio) {
        const name = prio.slice("priority:".length).replace(/^./, (c) => c.toUpperCase())
        const f = fieldIds.get("Priority")
        const o = optionIds.get("Priority")?.get(name)
        if (f && o) yield* gql.setProjectItemFieldSingleSelect(proj.id, itemId, f, o)
      }
      // Type from label.
      const type = issue.labels.find((l) => l.startsWith("type:"))
      if (type) {
        const name = type.slice("type:".length)
        const f = fieldIds.get("Type")
        const o = optionIds.get("Type")?.get(name)
        if (f && o) yield* gql.setProjectItemFieldSingleSelect(proj.id, itemId, f, o)
      }
    }
    return lines.join("\n") + "\n"
  }).pipe(Effect.provide(GithubRestLive), Effect.provide(GithubGqlLive))

  const report = await Effect.runPromise(program)
  console.log(report)
  if (apply) {
    const date = new Date().toISOString().slice(0, 10)
    writeFileSync(reportPath("populate-project", date), report)
  }
  return 0
}
```

- [ ] **Step 2: Dry-run**

```bash
bun zl-migrate populate-project
```

- [ ] **Step 3: Apply**

```bash
bun zl-migrate populate-project --apply
```

Expected: every issue added to Projects v2 with Sub-milestone / Priority / Type set.

Spot check the Roadmap view — should show M-A Foundation grouped by M-A1..M-A4 swim lanes.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-linear-to-github/src/phases/5-populate-project.ts docs/migration/populate-project-*.md
git commit -m "feat(migrate): phase 5 Projects v2 population"
```

---

## Task 17: Wiki renderer + push (Phase 6)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/wiki/templates.ts`
- Create: `scripts/migrate-linear-to-github/src/wiki/renderer.ts`
- Create: `scripts/migrate-linear-to-github/tests/wiki/renderer.test.ts`
- Create: `scripts/migrate-linear-to-github/src/phases/6-write-wiki.ts`

- [ ] **Step 1: Failing test for the renderer**

```ts
// scripts/migrate-linear-to-github/tests/wiki/renderer.test.ts
import { describe, expect, test } from "bun:test"
import { renderWiki } from "../../src/wiki/renderer"

describe("renderWiki", () => {
  test("produces all 10 expected pages", () => {
    const out = renderWiki({
      fetchedAt: "2026-04-21T00:00:00Z",
      issues: [], milestones: [], documents: [],
    }, new Map([["M-A Foundation", 1]]), {
      mappingRowCount: 93,
    })
    const names = Object.keys(out).sort()
    expect(names).toEqual([
      "Contributing.md",
      "Decisions.md",
      "Design-Specification.md",
      "Home.md",
      "Migration-Archive.md",
      "Notes.md",
      "Plans.md",
      "Roadmap.md",
      "_Footer.md",
      "_Sidebar.md",
    ])
  })
  test("Home links to Milestones and Projects v2", () => {
    const { "Home.md": home } = renderWiki({
      fetchedAt: "2026-04-21T00:00:00Z",
      issues: [], milestones: [], documents: [],
    }, new Map(), { mappingRowCount: 0 })
    expect(home).toContain("/milestones")
    expect(home).toContain("/projects/")
  })
  test("Migration-Archive references the mapping CSV row count", () => {
    const { "Migration-Archive.md": ma } = renderWiki({
      fetchedAt: "2026-04-21T00:00:00Z",
      issues: [], milestones: [], documents: [],
    }, new Map(), { mappingRowCount: 93 })
    expect(ma).toContain("93")
    expect(ma).toContain("linear-github-mapping.csv")
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement templates**

```ts
// scripts/migrate-linear-to-github/src/wiki/templates.ts
export const HOME = `# zero-line

> A modern, TypeScript-native mobile CI/CD toolkit that replaces fastlane.
> Bun + Effect.ts + step-based architecture.

## Navigation

- [Issues](https://github.com/swissonid/zero-line/issues) · active work
- [Milestones](https://github.com/swissonid/zero-line/milestones) · roadmap view
- [Projects v2 board](https://github.com/users/swissonid/projects/) · kanban + roadmap
- [Design Specification](./Design-Specification)
- [Roadmap](./Roadmap)
- [Plans](./Plans) · per-milestone implementation plans
- [Decisions](./Decisions) · architecture decision records
- [Notes](./Notes) · working notes
- [Contributing](./Contributing)
- [Migration Archive](./Migration-Archive) · Linear history pointer

## Source of truth

All designs, plans, and decisions live in the repository under
\`docs/superpowers/\`. This wiki is a navigable index — never the authoritative
document for any design or plan.
`

export const DESIGN_SPEC = `# Design Specification

Authoritative: [\`docs/superpowers/specs/2026-04-14-zero-line-design.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/specs/2026-04-14-zero-line-design.md).

Summary — zero-line (\`zl\`) is a CLI for automating mobile app builds, signing, testing, and deployment. It replaces fastlane's Ruby ecosystem with TypeScript and the npm ecosystem. The core is a thin execution engine; all capabilities are delivered as **steps** — reusable, composable units of work.

Head to the spec file for architecture, the \`defineStep\` contract, the hexagonal layer model, and the plugin-registry roadmap.
`

export const ROADMAP = (milestones: Array<{ title: string; due: string | null; trackingNumbers?: ReadonlyArray<number> }>) => `# Roadmap

Authoritative: [\`docs/superpowers/specs/2026-04-16-zero-line-roadmap-design.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/specs/2026-04-16-zero-line-roadmap-design.md).

## Milestones

${milestones.map((m) => `- [\`${m.title}\`](https://github.com/swissonid/zero-line/milestone/${m.title.slice(0, 3)}) · due **${m.due ?? "—"}**`).join("\n")}

## Sub-milestones (M-A)

Each sub-milestone is a **tracking issue** with native GitHub sub-issues.

- [M-A1 Core Hardening](https://github.com/swissonid/zero-line/issues?q=is%3Aissue+%22%5BTracking%5D+M-A1%22)
- [M-A2 CLI Subcommands](https://github.com/swissonid/zero-line/issues?q=is%3Aissue+%22%5BTracking%5D+M-A2%22)
- [M-A3 Release Tooling](https://github.com/swissonid/zero-line/issues?q=is%3Aissue+%22%5BTracking%5D+M-A3%22)
- [M-A4 v0.1.0 Tag](https://github.com/swissonid/zero-line/issues?q=is%3Aissue+%22%5BTracking%5D+M-A4%22)
`

export const PLANS = `# Plans

One plan per milestone / sub-milestone. Source of truth is the repo; this page indexes them.

- [\`2026-04-14-core-and-cli.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/plans/2026-04-14-core-and-cli.md)
- [\`2026-04-16-m-a1-core-hardening.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/plans/2026-04-16-m-a1-core-hardening.md)
- [\`2026-04-17-m-a2-cli-subcommands.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/plans/2026-04-17-m-a2-cli-subcommands.md)
- [\`2026-04-17-m-a3-release-tooling.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/plans/2026-04-17-m-a3-release-tooling.md)
- [\`2026-04-17-m-a4-v0-1-0-tag.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/plans/2026-04-17-m-a4-v0-1-0-tag.md)
- [\`2026-04-17-zer-150-config-loading-effect-migration.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/plans/2026-04-17-zer-150-config-loading-effect-migration.md)
- [\`2026-04-21-linear-to-github-migration.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/plans/2026-04-21-linear-to-github-migration.md)

### Working cadence
One GitHub issue per task. One PR per issue. Tracking issues group related work via native sub-issues.
`

export const DECISIONS = `# Decisions

- [\`2026-04-16-options-schema-library.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/decisions/2026-04-16-options-schema-library.md)
`

export const NOTES = `# Notes

- [\`step-lifecycle.md\`](https://github.com/swissonid/zero-line/blob/main/docs/superpowers/notes/step-lifecycle.md)
`

export const CONTRIBUTING = `# Contributing

## Cadence

- One GitHub issue per task.
- One branch per issue: \`feature/gh-<number>\` (new issues) · \`feature/zer-<number>\` (legacy ZER references from pre-migration commits — kept for historical PR archaeology).
- One PR per branch.

## Sub-milestones

\`[Tracking] M-A<N>\` tracking issues group related tasks via GitHub's native sub-issues. Open the tracking issue for progress rollup.

## PR review

Post \`please review @codex\` after pushing fixes for Codex review comments.
`

export const MIGRATION_ARCHIVE = (rowCount: number) => `# Migration Archive

Zero-line was tracked on Linear until 2026-04 when it moved to GitHub-native tooling (Issues, Milestones, Projects v2, Wiki). The migration was a one-shot reconciliation; the Linear workspace is now read-only archive.

## Historical ZER-N references

Old commits, PR titles, and historical plan files reference Linear issue IDs like \`ZER-117\`. The ZER→GitHub mapping lives in the repo at [\`docs/migration/linear-github-mapping.csv\`](https://github.com/swissonid/zero-line/blob/main/docs/migration/linear-github-mapping.csv) — ${rowCount} rows, one per migrated issue.

## Source of truth

Implementation plans and specs (\`docs/superpowers/\`) remain authoritative. Linear URLs still appear in the \`Migrated from Linear\` footers on migrated issues and as read-only pointers back to the archive.
`

export const SIDEBAR = `- [Home](Home)
- [Design Specification](Design-Specification)
- [Roadmap](Roadmap)
- [Plans](Plans)
- [Decisions](Decisions)
- [Notes](Notes)
- [Contributing](Contributing)
- [Migration Archive](Migration-Archive)
`

export const FOOTER = `Source of truth for code & plans lives in [\`swissonid/zero-line\`](https://github.com/swissonid/zero-line). Wiki is the navigable index.`
```

- [ ] **Step 4: Implement `renderer.ts`**

```ts
// scripts/migrate-linear-to-github/src/wiki/renderer.ts
import type { LinearSnapshot } from "../types"
import * as T from "./templates"
import { MILESTONE_PLAN } from "../phases/3a-labels-milestones"

export interface RenderContext {
  readonly mappingRowCount: number
}

export const renderWiki = (
  _snapshot: LinearSnapshot,
  _milestoneNumbers: ReadonlyMap<string, number>,
  ctx: RenderContext
): Record<string, string> => ({
  "Home.md": T.HOME,
  "Design-Specification.md": T.DESIGN_SPEC,
  "Roadmap.md": T.ROADMAP(MILESTONE_PLAN.map((m) => ({ title: m.title, due: m.due }))),
  "Plans.md": T.PLANS,
  "Decisions.md": T.DECISIONS,
  "Notes.md": T.NOTES,
  "Contributing.md": T.CONTRIBUTING,
  "Migration-Archive.md": T.MIGRATION_ARCHIVE(ctx.mappingRowCount),
  "_Sidebar.md": T.SIDEBAR,
  "_Footer.md": T.FOOTER,
})
```

- [ ] **Step 5: Run tests — expect pass**

```bash
bun test tests/wiki/
```

Expected: 3 pass.

- [ ] **Step 6: Write the phase**

```ts
// scripts/migrate-linear-to-github/src/phases/6-write-wiki.ts
import { readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from "fs"
import { execSync } from "child_process"
import { MIGRATION_DIR, MAPPING_CSV_PATH, reportPath, GITHUB_OWNER, GITHUB_REPO } from "../config"
import { renderWiki } from "../wiki/renderer"
import type { LinearSnapshot } from "../types"

const WIKI_CLONE_DIR = "/tmp/zero-line-wiki"

export const run = async ({ apply }: { apply: boolean }): Promise<number> => {
  const files = readdirSync(MIGRATION_DIR).filter((f) => f.startsWith("linear-snapshot-")).sort()
  const snap = JSON.parse(readFileSync(`${MIGRATION_DIR}/${files[files.length - 1]}`, "utf8")) as LinearSnapshot
  const mappingRowCount = existsSync(MAPPING_CSV_PATH)
    ? readFileSync(MAPPING_CSV_PATH, "utf8").split("\n").filter(Boolean).length - 1
    : 0
  const pages = renderWiki(snap, new Map(), { mappingRowCount })
  const lines: string[] = ["# Phase 6 — write wiki", ""]
  if (!apply) {
    for (const name of Object.keys(pages)) lines.push(`- [dry-run] would write ${name} (${pages[name].length} bytes)`)
    console.log(lines.join("\n"))
    return 0
  }
  if (existsSync(WIKI_CLONE_DIR)) rmSync(WIKI_CLONE_DIR, { recursive: true, force: true })
  const token = process.env.GITHUB_TOKEN
  execSync(`git clone https://x-access-token:${token}@github.com/${GITHUB_OWNER}/${GITHUB_REPO}.wiki.git ${WIKI_CLONE_DIR}`, { stdio: "inherit" })
  for (const [name, content] of Object.entries(pages)) {
    writeFileSync(`${WIKI_CLONE_DIR}/${name}`, content)
    lines.push(`- wrote ${name}`)
  }
  execSync(`cd ${WIKI_CLONE_DIR} && git add -A && git commit -m "Migrate wiki content from Linear→GitHub migration" || true && git push`, { stdio: "inherit" })
  lines.push("")
  lines.push("- pushed to wiki remote")
  const date = new Date().toISOString().slice(0, 10)
  writeFileSync(reportPath("write-wiki", date), lines.join("\n") + "\n")
  console.log(lines.join("\n"))
  return 0
}
```

- [ ] **Step 7: First wiki initialization (manual — required once)**

If the repo's wiki has never been written, GitHub requires one manual edit via the UI to initialize the wiki git repo. Open `https://github.com/swissonid/zero-line/wiki` and click "Create the first page", save any content. Close the tab. Now the wiki repo exists.

- [ ] **Step 8: Dry-run**

```bash
bun zl-migrate write-wiki
```

Expected: lists 10 pages with byte counts.

- [ ] **Step 9: Apply**

```bash
bun zl-migrate write-wiki --apply
```

Expected: clones `zero-line.wiki.git`, writes 10 files, commits, pushes. Inspect the wiki in the browser — all 10 pages should render with sidebar navigation.

- [ ] **Step 10: Commit migration script changes**

```bash
git add scripts/migrate-linear-to-github/src/wiki scripts/migrate-linear-to-github/tests/wiki scripts/migrate-linear-to-github/src/phases/6-write-wiki.ts docs/migration/write-wiki-*.md
git commit -m "feat(migrate): phase 6 wiki generation + push"
```

---

## Task 18: Rewrite Linear URLs in /docs (Phase 7)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/phases/7-rewrite-plan-links.ts`

- [ ] **Step 1: Write the phase**

```ts
// scripts/migrate-linear-to-github/src/phases/7-rewrite-plan-links.ts
import { readFileSync, writeFileSync, readdirSync } from "fs"
import { MAPPING_CSV_PATH, GITHUB_OWNER, GITHUB_REPO, MIGRATION_DIR, reportPath } from "../config"

const PLAN_DIRS = [
  "docs/superpowers/plans",
  "docs/superpowers/specs",
]

const parseMapping = (csv: string): Map<string, number> => {
  const m = new Map<string, number>()
  const lines = csv.split("\n").slice(1)
  for (const l of lines) {
    if (!l.trim()) continue
    const [zer, n] = l.split(",", 2)
    m.set(zer.trim(), parseInt(n.trim()))
  }
  return m
}

const rewrite = (contents: string, mapping: Map<string, number>): { out: string; count: number } => {
  let count = 0
  let out = contents
  for (const [zer, n] of mapping) {
    // Linear URL pattern: https://linear.app/splitcast/issue/<zer-lower>/<slug>
    const lower = zer.toLowerCase()
    const urlRe = new RegExp(`https://linear\\.app/splitcast/issue/${lower}/[a-zA-Z0-9-]+`, "g")
    const ghUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${n}`
    out = out.replace(urlRe, (m) => {
      count++
      return ghUrl
    })
  }
  return { out, count }
}

export const run = async ({ apply }: { apply: boolean }): Promise<number> => {
  const mapping = parseMapping(readFileSync(MAPPING_CSV_PATH, "utf8"))
  const lines: string[] = ["# Phase 7 — rewrite plan links", ""]
  let totalEdits = 0
  for (const dir of PLAN_DIRS) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
    for (const f of files) {
      const path = `${dir}/${f}`
      const before = readFileSync(path, "utf8")
      const { out, count } = rewrite(before, mapping)
      if (count === 0) continue
      lines.push(`- ${apply ? "rewrote" : "[dry-run] would rewrite"} ${path} (${count} link${count === 1 ? "" : "s"})`)
      totalEdits += count
      if (apply) writeFileSync(path, out)
    }
  }
  lines.push("")
  lines.push(`Total: ${totalEdits} link rewrite${totalEdits === 1 ? "" : "s"}`)
  console.log(lines.join("\n"))
  if (apply) {
    const date = new Date().toISOString().slice(0, 10)
    writeFileSync(reportPath("rewrite-plan-links", date), lines.join("\n") + "\n")
  }
  return 0
}
```

- [ ] **Step 2: Dry-run**

```bash
bun zl-migrate rewrite-plan-links
```

Expected: prints per-file counts. Total likely 50-200 rewrites.

- [ ] **Step 3: Apply**

```bash
bun zl-migrate rewrite-plan-links --apply
```

Expected: `/docs/superpowers/plans/*.md` and `/docs/superpowers/specs/*.md` updated in place.

- [ ] **Step 4: Review the diff and commit**

```bash
git diff docs/superpowers/
```

Look for any unexpected rewrites (false positives). Then:

```bash
git add docs/superpowers docs/migration/rewrite-plan-links-*.md scripts/migrate-linear-to-github/src/phases/7-rewrite-plan-links.ts
git commit -m "docs: rewrite Linear URLs to GitHub issue URLs (phase 7)"
```

---

## Task 19: Verify (Phase 8)

**Files:**
- Create: `scripts/migrate-linear-to-github/src/phases/8-verify.ts`

- [ ] **Step 1: Write the phase**

```ts
// scripts/migrate-linear-to-github/src/phases/8-verify.ts
import { Effect } from "effect"
import { readFileSync, readdirSync, writeFileSync } from "fs"
import { MIGRATION_DIR, reportPath } from "../config"
import { GithubRest, GithubRestLive } from "../github/rest"
import { matchIssues } from "../audit/matcher"
import { MILESTONE_PLAN } from "./3a-labels-milestones"
import { SUB_MILESTONE_PLAN } from "./3b-tracking-issues"
import type { LinearSnapshot } from "../types"

export const run = async ({ apply: _apply }: { apply: boolean }): Promise<number> => {
  const files = readdirSync(MIGRATION_DIR).filter((f) => f.startsWith("linear-snapshot-")).sort()
  const snap = JSON.parse(readFileSync(`${MIGRATION_DIR}/${files[files.length - 1]}`, "utf8")) as LinearSnapshot
  const program = Effect.gen(function* () {
    const rest = yield* GithubRest
    const gh = yield* rest.listAllIssues()
    const map = matchIssues(snap.issues, gh.filter((g) => !g.labels.some((l) => l.startsWith("area:"))))
    const problems: string[] = []
    if (map.linearOrphans.length > 0) problems.push(`${map.linearOrphans.length} Linear tickets without a GH counterpart`)
    if (map.oraCalendarContamination.length > 0) problems.push(`${map.oraCalendarContamination.length} ora-calendar tickets still present`)
    const drifted = map.matched.filter((m) => m.drift.length > 0)
    if (drifted.length > 0) problems.push(`${drifted.length} pairs still showing drift`)
    for (const m of MILESTONE_PLAN) {
      const milestoneIssues = gh.filter((i) => i.milestone?.title === m.title)
      if (m.title !== "M-0 Pre-Foundation" && milestoneIssues.length === 0) {
        problems.push(`milestone '${m.title}' has no issues`)
      }
    }
    for (const sm of SUB_MILESTONE_PLAN) {
      const tracking = gh.find((i) => i.title === sm.title)
      if (!tracking) problems.push(`tracking issue '${sm.title}' not found`)
    }
    const lines: string[] = [
      "# Phase 8 — verify",
      "",
      `- Linear issues: ${snap.issues.length}`,
      `- GH issues (non-contaminated): ${gh.filter((g) => !g.labels.some((l) => l.startsWith("area:"))).length}`,
      `- Matched: ${map.matched.length}`,
      "",
      "## Problems",
      ...(problems.length > 0 ? problems.map((p) => `- ${p}`) : ["- none ✓"]),
      "",
    ]
    const report = lines.join("\n")
    console.log(report)
    const date = new Date().toISOString().slice(0, 10)
    writeFileSync(reportPath("verify", date), report)
    return problems.length === 0 ? 0 : 1
  }).pipe(Effect.provide(GithubRestLive))
  return await Effect.runPromise(program)
}
```

- [ ] **Step 2: Run**

```bash
bun zl-migrate verify
```

Expected: reports `- none ✓` under Problems. Exit 0. If anything is wrong, exit 1 and fix first (re-run earlier phases — they're idempotent).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-linear-to-github/src/phases/8-verify.ts docs/migration/verify-*.md
git commit -m "feat(migrate): phase 8 verification"
```

---

## Task 20: Linear decommissioning + memory updates (Phase 9, manual)

**Files:**
- Modify: `~/.claude/projects/.../memory/feedback_pr_per_issue.md`
- Modify: `~/.claude/.../memory/feedback_worktrees_per_ticket.md`
- Create: `~/.claude/.../memory/feedback_github_sub_issues.md` (replaces `feedback_linear_blocked_by.md`)
- Create: `~/.claude/.../memory/reference_github.md` (replaces `reference_linear.md`)
- Delete: `~/.claude/.../memory/feedback_linear_blocked_by.md`
- Delete: `~/.claude/.../memory/reference_linear.md`
- Modify: `~/.claude/.../memory/MEMORY.md` (index)
- Modify: `README.md` (remove Linear references)

**Gate:** Phase 8 verify must be green and the 7-day grace period must have elapsed.

- [ ] **Step 1: Wait 7 days after Phase 8 green**

The grace period lets any unnoticed problem surface. During this window, Linear remains read-only-viewable but nothing is written. If something surfaces, re-run the affected phase (all idempotent).

- [ ] **Step 2: Archive the Linear `zero-line MVP` project (manual, UI)**

1. Open Linear → Settings → Projects → `zero-line MVP`.
2. Click **Archive**. Confirm.
3. Optionally: Settings → Integrations → GitHub → revoke.

- [ ] **Step 3: Update CLAUDE memory files**

Replace file contents. Use your editor of choice.

`~/.claude/projects/-Users-patricemuller-Projects-platfrom-plane-mobile-zero-line/memory/feedback_pr_per_issue.md`:

```markdown
---
name: One PR per GitHub issue
description: Each closed GitHub issue in zero-line gets its own PR; don't batch.
type: feedback
---

One PR per GitHub issue.

**Why:** Reviewable unit-of-work, matches the tracking-issue + sub-issue model; makes the issue→commit→merge trail legible for CHANGELOG generation.

**How to apply:** Before opening a PR for zero-line, confirm it closes exactly one issue (or one sub-issue of a tracking issue). Do not combine unrelated issue fixes in one PR.
```

`~/.claude/.../memory/feedback_worktrees_per_ticket.md`:

```markdown
---
name: Use git worktrees per GitHub issue
description: Each GitHub issue gets its own worktree for isolation.
type: feedback
---

Use git worktrees per GitHub issue.

**Why:** Isolation — keeps work on different issues from colliding mid-flight; lets the user review state per-issue without stashing.

**How to apply:** When starting work on a new zero-line GitHub issue, create a worktree named `feature/gh-<number>`. Legacy `feature/zer-<number>` branches remain valid historical references (don't rename existing ones).
```

Create `~/.claude/.../memory/feedback_github_sub_issues.md`:

```markdown
---
name: Use GitHub native sub-issues for dependency structure
description: Express parent/child and "blocked by" relationships via native sub-issues.
type: feedback
---

Use GitHub native sub-issues for parent/child structure, not label hacks.

**Why:** Sub-issues give automatic progress rollup on the parent, are queryable via GraphQL, and survive rename/rehoming in a way that body-text references do not. For zero-line, the M-A1..M-A4 tracking issues and their task children model the old Linear "parent/Follows" structure.

**How to apply:** When a task belongs under a tracking issue (e.g. a new M-B1 task under the M-B tracking issue), wire it as a sub-issue via the GitHub UI or `gh api graphql`. Do not rely on "Blocked by #N" text in the issue body as the only signal — use it for cross-milestone dependencies only.
```

Create `~/.claude/.../memory/reference_github.md`:

```markdown
---
name: zero-line GitHub references
description: Where tracking, roadmap, and docs live for zero-line post-migration.
type: reference
---

- **Repo:** github.com/swissonid/zero-line
- **Issues:** github.com/swissonid/zero-line/issues
- **Milestones:** github.com/swissonid/zero-line/milestones (M-0..M-F)
- **Projects v2 board (roadmap):** github.com/users/swissonid/projects/... — see `[Tracking]` issues filter for sub-milestone rollups
- **Wiki:** github.com/swissonid/zero-line/wiki
- **Migration mapping** (ZER-N → #N): `docs/migration/linear-github-mapping.csv`
- **Migration spec:** `docs/superpowers/specs/2026-04-21-linear-to-github-migration-design.md`
```

Delete the superseded files:

```bash
rm ~/.claude/projects/-Users-patricemuller-Projects-platfrom-plane-mobile-zero-line/memory/reference_linear.md
rm ~/.claude/projects/-Users-patricemuller-Projects-platfrom-plane-mobile-zero-line/memory/feedback_linear_blocked_by.md
```

Update `~/.claude/.../memory/MEMORY.md` — replace Linear-referencing entries:

```markdown
- [User profile](user_profile.md) — Senior eng, 14yr exp, new to Effect.ts, prefers hexagonal/feature-sliced arch
- [Broader vision](project_vision.md) — zl could become general-purpose CI tool beyond mobile, keep core domain-agnostic
- [GitHub tracking](reference_github.md) — repo swissonid/zero-line, issues + Projects v2 + Wiki + docs/migration/mapping CSV
- [One PR per GitHub issue](feedback_pr_per_issue.md) — each closed GitHub issue gets its own PR, don't batch
- [Ping Codex after fixing PR review comments](feedback_greptile_rereview.md) — post "please review @codex" after pushing fixes
- [Use git worktrees per GitHub issue](feedback_worktrees_per_ticket.md) — each GitHub issue gets its own worktree for isolation
- [Say "step author", not "plugin author"](feedback_terminology_step_author.md) — step is the user-facing unit; "plugin" only for package/distribution terms
- [User merges PRs themselves](feedback_user_merges_prs.md) — stop after greploop converges; do not run `gh pr merge`
- [Use GitHub native sub-issues for dependency structure](feedback_github_sub_issues.md) — parent/child via sub-issues, not label hacks
- [Wait for all open PRs to merge before dispatching follow-ons](feedback_wait_for_merges.md) — batch-at-a-time cadence, not continuous
- [Agents must invoke superpowers + effect-ts skills](feedback_superpowers_skills_in_agent_prompts.md) — every implementation agent prompt calls out TDD / executing-plans + effect-ts explicitly
```

- [ ] **Step 4: Update repo README**

Search for and remove any Linear references:

```bash
grep -n -i "linear" README.md
```

Replace with GitHub references (Issues, Projects v2 board, Wiki). Commit separately:

```bash
git add README.md
git commit -m "docs(readme): replace Linear references with GitHub tooling (phase 9)"
```

- [ ] **Step 5: Optional — remove the Linear MCP server**

If you no longer want Linear MCP access, edit `~/.claude/settings.json` (or wherever the MCP server is registered) and remove the Linear entry. Alternatively, leave it installed for read-only access to the archive.

- [ ] **Step 6: Post-migration verification**

Start a new Claude Code session in the repo and confirm the updated memory loads correctly (the MEMORY.md index rows should all reference the new filenames).

- [ ] **Step 7: Close out**

The migration is complete. All new work uses GitHub Issues. The Linear workspace stays archived; the ZER-N mapping CSV remains the permanent historical reference.

No git commit for this task (memory files live outside the repo).

---

## Plan self-review

**Spec coverage check** — every spec section maps to a task:

| Spec section | Task(s) |
|---|---|
| Labels | Task 5 (label mapping), Task 12 (3a create) |
| Milestones (M-0..M-F) | Task 12 (3a) |
| Tracking issues + sub-issues | Task 13 (3b), Task 15 (4 wiring) |
| Issue body footer | Task 7 |
| Field mapping table | Tasks 5, 6, 7, 15 |
| Comments policy | Task 15 |
| Drift resolution | Task 15 (Linear wins via `rest.updateIssue(..., { body })`) |
| Projects v2 fields/views/automations | Task 14 (fields), manual UI step (views/automations) |
| Wiki structure (10 pages) | Task 17 |
| Migration tooling CLI | Tasks 1, 4 |
| Phase 0b snapshot | Task 3 |
| Phase 1 audit | Task 10 |
| Phase 2 eviction | Task 11 |
| Phase 3 setup | Tasks 12, 13, 14 |
| Phase 4 reconcile | Task 15 |
| Phase 5 populate project | Task 16 |
| Phase 6 wiki | Task 17 |
| Phase 7 rewrite /docs | Task 18 |
| Phase 8 verify | Task 19 |
| Phase 9 decommission + memory | Task 20 |
| Grace period (7 days) | Task 20 Step 1 |
| Mapping CSV | Task 15 |
| Rollback posture | Inherent — each phase idempotent |

**Placeholder scan** — no `TODO`, `TBD`, "implement later". One pure-stub (`priority.ts` written in Task 5 before its own test in Task 6) — acceptable because the test in Task 6 verifies it independently.

**Type consistency** — `LinearIssue`, `GhIssue`, `MigrationMap`, `MatchEntry` are defined in `types.ts` (Task 1) and referenced consistently. `SUB_MILESTONE_PLAN` + `subMilestoneFor` (Task 13) are reused in Tasks 15 and 16. Field names (`state_reason`, `milestone.number`) match the Octokit return shape.

**Scope note** — Task 15 (reconcile) is the largest; if its implementation grows beyond ~300 lines, consider splitting along the three responsibility axes: body/labels/state update, sub-issue wiring, comment backfill. For now it's kept as one phase to preserve atomicity.
