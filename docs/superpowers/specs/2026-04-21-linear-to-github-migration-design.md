# Linear → GitHub migration — Design

**Status:** Draft · **Created:** 2026-04-21 · **Author:** @swissonid

---

## Context

zero-line is moving off Linear to a GitHub-only workflow. Going forward, GitHub owns issue tracking, milestone/roadmap planning, and public-facing project documentation. Linear will be archived (read-only) after migration completes.

This is an **open-source project**; GitHub-native tooling (Issues, Milestones, Projects v2, Wiki) is the right long-term home for contributor-facing state.

### Goals

- Every zero-line Linear ticket has a corresponding GitHub Issue with full content, state, labels, and milestone
- The Linear milestone structure (M-A Foundation … M-F Play Store + v1.0) is recreated on GitHub, including the sub-milestone decomposition (M-A1..M-A4)
- All content currently in the Linear `zero-line MVP` Document feature is accessible from the GitHub Wiki
- A Projects v2 roadmap board replaces the Linear roadmap view
- Linear becomes an immutable archive; GitHub is the sole source of truth for all new work

### Non-goals

- Migrating the `ora-calendar` Linear project. That project has its own repo (`swissonid/ora-calendar`) and will get its own migration. This spec only evicts ora-calendar tickets that leaked into `swissonid/zero-line`.
- Building a docs website (Docusaurus/Pages). Wiki is enough for now; Pages is a potential follow-up.
- Preserving Linear's ZER-N numbering. GitHub assigns its own issue numbers; correspondence is preserved as body footers and a mapping CSV.
- Backdating `created_at` timestamps on GitHub issues (not supported by the API). Original Linear dates are preserved in issue body footers only.

---

## Existing-state findings

Observed before designing the migration:

1. **Linear `zero-line` team** holds two projects: `zero-line MVP` (in scope) and `ora-calendar` (out of scope).
2. **Linear issues in `zero-line MVP`**: 93 total — 54 Done, 31 Backlog, 7 In Progress, 1 Canceled. 56 under milestone `M-A Foundation`, 37 pre-milestone (older `Plan Task N` / `Core: X` tickets from the original core-and-cli plan). No issue parent/child relationships in use.
3. **Linear milestones in `zero-line MVP`**: 6 (M-A through M-F) with target dates 2026-05-07 through 2026-07-16. The M-A description text encodes a four-way sub-plan split (M-A1/M-A2/M-A3/M-A4) pointing at `docs/superpowers/plans/*.md` files and Linear ticket ranges. Sub-milestones are **not a native Linear feature** — they're structured prose.
4. **Linear labels actually applied on `zero-line MVP` issues**: only `type:bug` (8 issues). All other `type:*` and `area:*` labels visible in the workspace were used on `ora-calendar`, not zero-line.
5. **Linear Documents for `zero-line MVP`**: one — "zero-line (zl) — Design Specification". Its body is a summary that links to `docs/superpowers/specs/2026-04-14-zero-line-design.md` as source of truth.
6. **GitHub repo `swissonid/zero-line`**: public, Issues + Projects + Wiki enabled, Discussions disabled. No `.github/` directory. No milestones exist yet. No Projects v2 board.
7. **GitHub already contains 98 issues** (66 open, 32 closed) — a partial, out-of-sync mirror of Linear tickets created by a previous Linear↔GitHub two-way sync. That sync has now been disabled (phase 0a already complete at time of writing).
8. **Ora-calendar contamination on `swissonid/zero-line`**: the team-level Linear→GitHub sync routed ora-calendar tickets into this repo. Dozens of GitHub issues carry `area:o365|sidecar|db|sync|docs|cli` labels and describe ora-calendar work (OWA probe, sidecar dispatcher, outbox commands, etc.). They must be evicted before zero-line's structure is imposed.

---

## Target end-state on GitHub

### Labels

Minimal, usage-driven, additive only where needed:

| Label | Purpose |
|---|---|
| `type:bug`, `type:feature`, `type:chore`, `type:test` | **Keep** — mirror Linear |
| `priority:urgent`, `priority:high`, `priority:normal`, `priority:low` | **Add** — GitHub has no priority field; map from Linear |
| `tracking` | **Add** — identifies sub-milestone tracking issues |
| `migrated-from-linear` | **Add** — applied to every migrated issue; easy filter after cutover |
| `good first issue`, `help wanted`, `documentation`, `question` | **Keep** — GitHub defaults |
| `Bug`, `Feature`, `Improvement` | **Drop** — legacy dupes of `type:*` |
| `area:o365`, `area:sidecar`, `area:db`, `area:sync`, `area:docs`, `area:cli`, `area:caldav`, `area:google` | **Drop** — all ora-calendar, unused on zero-line tickets |

Zero-line-specific area labels (e.g. `area:core`, `area:cli`, `area:config`, `area:steps`) are **not added preemptively** — introduced when the need emerges.

### Milestones

Seven total, matching Linear + one bucket for pre-foundation history:

| Milestone | Due date | Description source |
|---|---|---|
| `M-0 Pre-Foundation` | — (closed) | The 37 pre-M-A Linear tickets (core-and-cli era). Permanent archive. |
| `M-A Foundation` | 2026-05-07 | Linear M-A description + dependency note |
| `M-B iOS Archive` | 2026-05-21 | Linear M-B description |
| `M-C iOS → TestFlight` | 2026-06-04 | Linear M-C description |
| `M-D iOS App Store + Android Archive` | 2026-06-18 | Linear M-D description |
| `M-E Android → Firebase / Play Internal` | 2026-07-02 | Linear M-E description |
| `M-F Play Store + v1.0 Release` | 2026-07-16 | Linear M-F description |

Milestone descriptions include a **"Depends on" line** pointing at the prior milestone's tracking issue (e.g. M-B depends on the M-A4 tracking issue). This is as close to "milestone depends on milestone" as GitHub exposes.

### Sub-milestones — tracking issues with native sub-issues

For each sub-plan under M-A, one **tracking issue**:

- Title: `[Tracking] M-A1 Core Hardening` (and M-A2 / M-A3 / M-A4)
- Labels: `tracking`, `migrated-from-linear`
- Milestone: `M-A Foundation`
- Body: the M-A milestone description paragraph for this sub-plan, rewritten to reference GitHub issue numbers (not Linear URLs)
- **Sub-issues** (GitHub native parent/child): all task issues belonging to that sub-plan are wired under the tracking issue. GitHub's sub-issue feature provides automatic "X of Y done" rollup on the tracking issue.

A task issue has **one** sub-issue parent (the tracking issue) and **one** milestone (the release milestone M-A). Both relationships exist simultaneously: the task shows up under the tracking issue AND in the release milestone's burn-down.

M-B through M-F have no sub-plans yet — no tracking issues are created for them during migration. They are added later when each release is planned.

### Issue body footer (standardised, appended to every migrated issue)

```
---
**Migrated from Linear [ZER-NNN](https://linear.app/splitcast/issue/ZER-NNN/slug)**
Created 2026-MM-DD · Started 2026-MM-DD HH:MM · Completed 2026-MM-DD HH:MM
Priority: High · Assignee: @swissonid
```

The Linear URL is preserved as a **read-only historical reference**. No automation attempts to keep them in sync — the sync is disabled, and the Linear workspace is archived at end of migration.

### Linear → GitHub field mapping

| Linear field | GitHub target | Notes |
|---|---|---|
| `identifier` (ZER-N) | body footer + `docs/migration/linear-github-mapping.csv` | GH issue numbers cannot be forced to match ZER-N |
| `title` | issue title | Already in Linear format on existing GH issues — no retitling |
| `description` | issue body (+ footer) | **Linear wins on drift** — frozen Linear state is canonical |
| `state` | open/closed + state_reason | Backlog→open · In Progress→open · Done→closed(completed) · Canceled→closed(not_planned) |
| `priority` | label `priority:*` | None → no label |
| `projectMilestone` | GH milestone | M-A..M-F, M-0 for pre-foundation |
| `labels` | GH labels | Only `type:bug` is currently present on zero-line tickets |
| `assignee` | GH assignee | `swissonid` (sole contributor) |
| `createdAt` / `completedAt` / `startedAt` | body footer text | No API support for backdating |
| `gitBranchName` (`feature/zer-117`) | dropped | Already in git history |
| `comments` | individual GH comments | Faithful preservation; see below |
| `parent` | — | Not used in Linear data |

**Comments policy.** For every Linear ticket, the audit computes a per-issue diff of `Linear comments ↔ GH comments` (matching by substring/timestamp heuristic, conservative). Any Linear comment not already present on the GH issue is posted as an **individual** GH comment with a text-prefix attribution line:

```
> Originally posted by @patrice on Linear, 2026-04-16 09:12
(original comment body)
```

Individual comments preserve chronology and are faithful at the cost of more noise than an aggregated summary would create. Acceptable trade-off per scope decision.

**Drift resolution on bodies.** Where Linear body ≠ existing GH body, Linear wins — the GH body is overwritten. The dry-run audit report shows the diff for every drifted issue before `--apply` is used.

---

## Projects v2 roadmap

One project, owned by `swissonid`, linked to `swissonid/zero-line`.

### Fields

| Field | Type | Source | Values |
|---|---|---|---|
| Title | built-in | issue title | — |
| Status | built-in single-select | Linear state | Backlog · In Progress · In Review · Done |
| Milestone | built-in (inherited) | GH milestone | M-0 / M-A / … / M-F |
| Sub-milestone | single-select (custom) | parent tracking issue | M-A1 · M-A2 · M-A3 · M-A4 · (extensible) |
| Priority | single-select (custom) | Linear priority | Urgent · High · Normal · Low |
| Type | single-select (custom) | `type:*` label | feature · bug · chore · test |
| Area | single-select (custom) | `area:*` label | (empty initially — values added when area labels are added) |
| Target date | date (custom) | milestone due_on | auto-populated at add time |

### Views

1. **Roadmap** — timeline grouped by Milestone, swim-laned by Sub-milestone. Linear roadmap replacement.
2. **Board** — kanban by Status. Day-to-day view.
3. **Backlog** — sortable table by Priority/Milestone, filterable by Area.
4. **Tracking** — filter `label:tracking`, shows tracking issues with sub-issue rollup.

### Automations

- **Auto-add**: every new issue in `swissonid/zero-line` → added to project, Status=Backlog
- **Issue closed** → Status=Done
- **PR linked via "closes #N"** → Status=In Review
- **Item reopened** → Status=Backlog

---

## Wiki structure

Wiki is a **navigable index** that links to in-repo docs. Content is not duplicated — Wiki pages are short intros + links; `/docs` files are authoritative.

| Wiki page | Purpose | Links to |
|---|---|---|
| `Home` | Overview + nav | README, Issues, Milestones, Projects v2 board, Design Spec |
| `Design-Specification` | Imported from the Linear "zero-line Design Specification" document, rewritten to reference `/docs` as source of truth | `docs/superpowers/specs/2026-04-14-zero-line-design.md` |
| `Roadmap` | Milestone overview (M-A..M-F with target dates) + tracking issues + link to roadmap spec | 6 milestones, 4 tracking issues, `docs/superpowers/specs/2026-04-16-zero-line-roadmap-design.md` |
| `Plans` | One-line entry per plan file | `docs/superpowers/plans/*.md` |
| `Decisions` | ADR index | `docs/superpowers/decisions/*.md` |
| `Notes` | Working notes index | `docs/superpowers/notes/*.md` |
| `Contributing` | Branch naming, one-PR-per-issue cadence, sub-milestone workflow | issue/PR templates |
| `Migration-Archive` | "This project used Linear until 2026-MM-DD"; link to mapping CSV; explains ZER-N references in old commits | `docs/migration/linear-github-mapping.csv` |

`_Sidebar.md` pins navigation to these pages on every wiki view. `_Footer.md` reads: "Source of truth for code & plans lives in `swissonid/zero-line`. Wiki is the navigable index."

Wiki population is a single commit to `swissonid/zero-line.wiki.git`, generated by the migration script from templates.

---

## Migration tooling

One CLI committed as `scripts/migrate-linear-to-github/` — Bun + TypeScript + Effect (matches the repo stack). One subcommand per phase. Every write-mode command is **dry-run by default**; requires `--apply` to mutate.

```
bun migrate snapshot           # Phase 0b — write docs/migration/linear-snapshot-<date>.json
bun migrate audit              # Phase 1 — write docs/migration/audit-<date>.md
bun migrate evict-ora-calendar # Phase 2 — close ora-calendar issues in zero-line repo
bun migrate setup-structure    # Phase 3 — labels, milestones, tracking issues, Projects v2
bun migrate reconcile          # Phase 4 — create/update issues, wire sub-issues, post comments
bun migrate populate-project   # Phase 5 — set Projects v2 custom fields
bun migrate write-wiki         # Phase 6 — push wiki pages
bun migrate rewrite-plan-links # Phase 7 — edit /docs plan files
bun migrate verify             # Phase 8 — final consistency check
```

Each command is idempotent: re-running with no new inputs is a no-op. All commands load Linear state from the `linear-snapshot-<date>.json` committed in phase 0b (not from live API) — guarantees determinism and lets the migration run from a frozen reference.

### Input / output artifacts

- **Committed to repo** (`docs/migration/`):
  - `linear-snapshot-<date>.json` — immutable Linear dump, created once, never rewritten
  - `audit-<date>.md` — phase 1 report (drift, missing, ora-calendar contamination)
  - `reconcile-<date>.md` — phase 4 report (per-issue changes applied)
  - `verify-<date>.md` — phase 8 report
  - `linear-github-mapping.csv` — `ZER-N,gh-issue-number,title` one row per migrated issue; permanent reference for historical commits/PRs

---

## Phased execution

| # | Name | Writes | Owner | Gate |
|---|---|---|---|---|
| 0a | Disable Linear↔GitHub sync in Linear settings | manual | @swissonid | **Done** (as of 2026-04-21) |
| 0b | Snapshot Linear state to committed JSON | local | script | commit merged |
| 1 | Audit — mapping, drift, ora-calendar contamination | local | script | user reviews report |
| 2 | Evict ora-calendar: close as `not_planned` with pointer comment; drop ora-calendar labels | GH API | script + --apply | user approval |
| 3 | Setup structure — labels, 7 milestones, 4 tracking issues, Projects v2 board + fields + views + automations | GH API | script + --apply; user does only one manual UI step (see below) | verify in UI |
| 4 | Reconcile — create/update issues: body, labels, milestone, state, assignee, footer, sub-issue parent, missing comments | GH API | script + --apply | spot-check in UI |
| 5 | Populate Projects v2 — set Sub-milestone / Priority / Type / Area on every item | GH API | script + --apply | spot-check roadmap view |
| 6 | Write wiki — 8 pages + sidebar/footer | wiki repo | script + --apply | diff review before push |
| 7 | Rewrite plan links in `/docs` | /docs commit | script + --apply | PR review, merge |
| 8 | Verify — consistency check, report | read-only | script | report committed |
| 9 | Decommission Linear | manual | @swissonid | after grace period |

**Manual step in Phase 3.** Creating the Projects v2 project via GraphQL works, but linking the project to the zero-line repository and confirming auto-add coverage is a one-click action in the GitHub UI. The script pauses here and instructs the user.

**Manual step in Phase 9.** Archiving the Linear project (UI action in Linear settings → Projects → `zero-line MVP` → Archive) and revoking any remaining GitHub → Linear integrations. The script emits a checklist but does not touch Linear.

### Grace period

Linear stays read-only for **7 days** after Phase 8 verify passes. During that window the Linear workspace can still be viewed; no writes. If a problem surfaces, re-running any phase is safe (idempotent). After 7 days, Phase 9 archives the project. This grace period is overridable — the user can shorten or skip it.

### CLAUDE.md / skill prompt updates (Phase 9, same PR as final archive)

Memory entries referencing Linear are updated in-place (not deleted — the principles are still valid, only the tooling changes):

- `feedback_pr_per_issue.md`: "One PR per Linear issue" → "One PR per GitHub issue"
- `feedback_greptile_rereview.md`: unchanged wording (codex flow is tool-agnostic)
- `feedback_worktrees_per_ticket.md`: "Linear ticket" → "GitHub issue"
- `feedback_linear_blocked_by.md`: "formal blockedBy on Linear tickets" → "native sub-issues on GitHub"
- `reference_linear.md`: replaced by `reference_github.md` describing the Projects v2 board URL, milestone view, and sub-issue hierarchy
- Any sub-agent prompt mentioning "create a Linear ticket" → "create a GitHub issue via `gh issue create`"

The Linear MCP server can remain installed for historical read-access but can be removed after grace period if desired.

---

## Rollback

Phases 2–7 are reversible via the GitHub API (reopen issues, delete labels/milestones/project/wiki pages). Phase 0a can be re-enabled in Linear settings (though this is not recommended — the sync caused the original pollution). Phase 9 archive is reversible via Linear's un-archive action.

The committed `linear-snapshot-<date>.json` means re-running any phase from a clean input is always possible, even weeks after the initial migration.

---

## Rate limiting & runtime

Estimated API budget: ~93 zero-line issues × ~6 write calls each (body, labels, milestone, state, sub-issue, project-field) ≈ 600 calls. Plus ~40 ora-calendar issue closures × 2 calls ≈ 80. Plus tracking issues, labels, project setup ≈ 50. Total ~730 GitHub API calls across the whole migration.

GitHub's authenticated REST rate limit is 5000 req/hr. Script throttles to 10 req/s (safety margin). Full migration: ~2 minutes of API traffic. No risk of throttling.

Linear API: snapshot is one read pass, under 100 calls total. Within free-tier limits.

---

## Open items resolved by this spec

- ~~Sub-milestones on GitHub~~ → tracking issues + native sub-issues
- ~~Milestone dependencies~~ → "Depends on" reference to prior tracking issue in milestone description
- ~~Historical Linear issues~~ → migrated, including Done (54) and Canceled (1)
- ~~Documentation target~~ → Wiki links to `/docs` (no duplication)
- ~~Linear Documents~~ → Wiki pages with in-repo links
- ~~Ora-calendar contamination~~ → Phase 2 evicts, preserves via closed-with-comment
- ~~Drift between existing GH mirror and Linear~~ → Linear wins
- ~~Comment faithfulness~~ → individual GH comments, not aggregated
- ~~Linear URLs in /docs~~ → rewritten in Phase 7

## Remaining open items

- None — this spec is ready for planning.
