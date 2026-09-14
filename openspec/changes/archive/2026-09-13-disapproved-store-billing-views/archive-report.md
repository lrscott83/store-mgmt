# Archive Report — disapproved-store-billing-views

**Change**: disapproved-store-billing-views · **Archive date**: 2026-09-13 · **Mode**: openspec (filesystem only — Engram unavailable in this session)
**Verdict carried from verify**: PASS WITH WARNINGS (`gentle-ai.verify-result/v1`, verdict `pass_with_warnings`, blockers 0, critical findings 0, requirements 8/8, scenarios 20/20) — no CRITICAL findings, archive not blocked
**Archive status**: PASS

## Archived path

`openspec/changes/archive/2026-09-13-disapproved-store-billing-views/` — moved with `git mv` (folder staged first with `git add`; `verify-report.md` was untracked). Byte-identity of every file verified against the pre-move recursive snapshot.

## Artifacts read

Change folder (all read before archive): proposal.md, exploration.md, design.md, tasks.md, apply-progress.md, verify-report.md, specs/{admin-stores, disapproved-store-payment-visibility, management-stores, stores-by-current-user}/spec.md. Canonical specs read: `openspec/specs/{stores-by-current-user, management-stores, admin-stores}/spec.md`. Sibling format reference: `openspec/changes/archive/2026-09-12-store-list-active-stores/archive-report.md`. Config: `openspec/config.yaml` (`rules.archive: Warn before merging destructive deltas` — no destructive delta present; ADDED-only + one new full spec). Task Completion Gate: regex `^\s*- \[ \]` over tasks.md → **0 unchecked** (18/18 checked).

## Structured status findings

Native `gentle-ai sdd-status` (run during this archive phase, gentle-ai 2.8.0) at `d9b77ae0`: `apply: all_done`, `verify: all_done`, `archive: ready`, tasks 18/18 complete, `blockedReasons: []`, `nextRecommended: archive`. `reviewGate` is **structurally ABSENT** from the status JSON (no receipt-driven review exists for this candidate) → archive proceeds under ordinary repository policy; no review artifacts exist to read or block on. `actionContext` mode `repo-local`, `allowedEditRoots` = workspace root; all archive operations stayed inside `openspec/`. The native `gentle-ai sdd-sync` command does **not exist** in this CLI (checked: `unknown command "sdd-sync"`); the orchestrator pre-approved the documented archive-time manual sync for that case.

## Domains synced

| Domain | Operation |
|--------|-----------|
| `disapproved-store-payment-visibility` | NEW canonical spec created: `openspec/specs/disapproved-store-payment-visibility/spec.md` — the delta IS a full spec (5 requirements REQ-1..REQ-5, 13 scenarios), copied mechanically (shell `cp`-style: temp file + `mv`, never Read→Write) with deliberate LF→CRLF line-ending conversion to match the canonical store convention (82/82 canonical spec files are CRLF; deltas are LF). Content identity verified: `git diff --no-index --ignore-cr-at-eol` delta vs canonical → **EMPTY, exit 0**. |
| `stores-by-current-user` | MODIFIED (ADDED): `### Requirement: REQ-SCU-1 — StoreDto Plan Contract for Disapproved Stores` (3 scenarios) inserted into the `## Requirements` section, before the `---` footer preceding `## Verification Criteria`. Existing R1–R6 preserved byte-for-byte (git diff: +24 lines, 0 deletions). |
| `management-stores` | MODIFIED (ADDED): `### Requirement: REQ-MS-1 — My-Stores View Hides Payment Info for Disapproved Stores` (3 scenarios) appended to the aggregated ADDED-requirements document (git diff: +23 lines, 0 deletions; 2 trailing blank lines normalized). |
| `admin-stores` | MODIFIED (ADDED): `### Requirement: REQ-AS-1 — Super-Admin Store Card Hides Price for Disapproved Stores` (2 scenarios) appended after the succeeded:false requirement, separated by `---` per file style (git diff: +18 lines, 0 deletions). |

### ADDED requirement names (now canonical)

1. `REQ-1 — Disapproved Store Plan Name Is "Gratis" on Every Store DTO` (3 scenarios) → `openspec/specs/disapproved-store-payment-visibility/spec.md`
2. `REQ-2 — Disapproved Store Due Dates Are Null on Every Store DTO` (3 scenarios) → same
3. `REQ-3 — Store Cards Render No Price for Disapproved Stores` (3 scenarios) → same
4. `REQ-4 — Plan Views and Filters Treat Disapproved Stores as Gratis` (2 scenarios) → same
5. `REQ-5 — Billing Summary Contract Unchanged (Non-Goal Guard)` (1 scenario) → same
6. `REQ-SCU-1 — StoreDto Plan Contract for Disapproved Stores` (3 scenarios) → `openspec/specs/stores-by-current-user/spec.md`
7. `REQ-MS-1 — My-Stores View Hides Payment Info for Disapproved Stores` (3 scenarios) → `openspec/specs/management-stores/spec.md`
8. `REQ-AS-1 — Super-Admin Store Card Hides Price for Disapproved Stores` (2 scenarios) → `openspec/specs/admin-stores/spec.md`

### REMOVED / MODIFIED (replace) / RENAMED requirement names

(none — this change is ADDED-only plus one new full spec; no destructive merge, per `rules.archive` the warn gate was not triggered)

## Merge byte-identity evidence

Each requirement block was extracted from its delta by shell line-slice (lines 9..EOF of the delta file — the `### Requirement:` block), converted LF→CRLF mechanically, and inserted into the CRLF canonical file by shell string operation — no model Read/Write path touched requirement content. After merge, each canonical's inserted region was extracted back and compared against the extracted block:

- `stores-by-current-user`: `git diff --no-index` block vs region → **EMPTY (exit 0)**
- `management-stores`: `git diff --no-index` block vs region → **EMPTY (exit 0)**
- `admin-stores`: `git diff --no-index` block vs region → **EMPTY (exit 0)**
- `disapproved-store-payment-visibility`: `git diff --no-index --ignore-cr-at-eol` delta vs canonical → **EMPTY (exit 0)** (only intentional EOL conversion)

## Final Task Completion Gate

Re-checked immediately before the move: **0 unchecked** implementation tasks in the persisted tasks artifact (18/18 `[x]`). No stale-checkbox reconciliation needed.

## Final-state facts (post-snapshot events recorded for the audit trail)

Per the Final-State Authority hierarchy, the archive reflects the state at close; claims below are attributed to their sources:

1. **Verify W1 (pre-existing, OUT OF SCOPE — NOT fixed by this change)**: repo-wide `pnpm typecheck` exits 2 with two TS2339 errors — `Property 'isActive' does not exist on type 'StoreSummary'` at `configurations.tsx(41,64)` and `store-switcher.tsx(56,59)`. Per `verify-report.md` (observation: verify phase 2026-09-13): both files have **zero diff** in the change's exact range and were last modified by pre-change commits (`12f1e426`, `0014b5d3`); no file in this change's diff is implicated. This is a pre-existing backend-contract drift (frontend `StoreSummary.isActive` field removed) unrelated to this change and out of its scope — recorded here as a known open item for a separate decision, not a defect of this change.
2. **apply-progress count nit (verify S1)**: `apply-progress.md` header says "all 16 tasks complete" while `tasks.md` has **18** checkboxes, all checked. The 18/18 figure is authoritative (persisted tasks artifact + native status). Documentation arithmetic only, no work missing.
3. **E2E seat deviation (verify S2, documented in apply-progress)**: all three endpoints asserted as the owner-admin seat rather than super-admin for by-current-user per task 2.2's original wording. No coverage gap — the SuperAdmin branch is covered by the unit suite (`ArrangeRoles(isSuperAdmin: true)`).
4. **Frontend full-suite noise (verify S3)**: full app vitest run shows 2 failures (`sync-routes.test.tsx` S-ROUTE-1, `user-routes.test.tsx` S-LIST-1) that pass in isolation (37/37 confirmed) and on pre-change state — vitest module-isolation noise, not a regression; both files untouched by this change.
5. **Runtime evidence at verify time (attributed to verify-report.md, executed fresh during verify)**: backend build exit 0 (0 errors); filtered E2E 1/1; Application.Tests 447/447; full backend E2E 500/500; card suites 24/24. The declared envelope `build_command` is the backend solution build.

## No-Touch Audit

Per `verify-report.md` no-touch audit: the only `M` entries on test files are 4 permitted additive unit-test files (new methods only); **zero** modifications to any existing E2E test (backend `SMCA.WebApi.E2ETests/` or frontend `frontend-react/e2e/`) or any E2E support file. This archive phase itself touched ONLY: the canonical spec store (`openspec/specs/**`) and the change folder move within `openspec/`. **No code, test, or support file was touched by the archive phase.**

## Byte-identity evidence (archive move)

Pre-move recursive snapshot (10 files) → `git add` (verify-report.md was untracked) → `git mv` → source-gone assert (`True`) → whole-tree comparison `git diff --no-index` snapshot vs archived → **EMPTY (exit 0)** → per-file SHA-256 before/after:

| File | SHA-256 (before = after) |
|------|--------------------------|
| apply-progress.md | `5d6c091b8832a95a63e2d10ce77b89b5b347368640507b5792fab5f2fb0223a5` |
| design.md | `052a24d18e91381110f138e0538db9367a813f4cf5d757c1caf314837afb0485` |
| exploration.md | `c16a4d53b06cdd2125916a5eb9eeb2735e6a9c844c4e6fb5c8be51c9ea6c41ac` |
| proposal.md | `e2882469699a7b9befbb0cf82038b0435f8aebc786204695e1f14eabe4a84220` |
| specs/admin-stores/spec.md | `b6818197b3cca145c89407baa922344c5aacdf6ec4d42730d9606b135d7ef30f` |
| specs/disapproved-store-payment-visibility/spec.md | `196572bad298c9f9cd5bc5243fc93bd529524adeaefce90b1d9a497f58ffd10e` |
| specs/management-stores/spec.md | `9c7b241d7f8d948c32666a6a99a4d2d43f0cf435e36bcd986bfc23ae6b2fae6b` |
| specs/stores-by-current-user/spec.md | `ac20bd21e9b03253c99ce80fedcba15398da1fd627384db36c4c8d4c3a5ad06d` |
| tasks.md | `177314133ffd7622efb044851d5c9ee2eebb353baa95bde8e651d88f0ac6eaf7` |
| verify-report.md | `2778d46e2baf9d5001a009d534ff1fdbe9e61efc5ed339ea4284e9ce7cad26a0` |

All 10 MATCH, file sets identical, tree diff empty → **ALL FILES BYTE-IDENTICAL: True**. This archive-report.md is additive-only and excluded from the comparison (it did not exist in the pre-move snapshot).

## Risks / leftovers

- **Pre-existing typecheck drift (W1)** — `StoreSummary.isActive` contract drift in `configurations.tsx` / `store-switcher.tsx`; out of scope, needs a separate decision. Recorded in this report as the known open item.
- Direct-to-branch commits on `qa` (`0f359f79`, `9ea1a9f2`, `d9b77ae0`) — no PRs per user decision during apply; archive commit follows the same convention (no push unless requested).

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.