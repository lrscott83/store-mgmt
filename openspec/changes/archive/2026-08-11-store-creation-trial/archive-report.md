# Archive Report — `store-creation-trial`

**Archived**: 2026-08-11
**Archived to**: `openspec/changes/archive/2026-08-11-store-creation-trial/`
**Verify verdict carried into this archive**: PASS (verdict `pass`, 0 blockers, 0 CRITICAL findings, 0 WARNING)
**Artifact store**: hybrid (filesystem + Engram)
**Branch**: `feat/e2e-s2-01-backend` (change code already on `main`, ancestor of HEAD)

## Project rules (carried verbatim)

> **Backend scope rule (user-mandated 2026-08-08)**: the agent may ONLY ADD new backend E2E tests; modifying production source code or existing E2E tests requires explicit notification + approval.
>
> **E2E tests are untouchable (user-mandated 2026-08-10)**: never modify, delete, rename, skip, weaken, or "fix" an existing E2E test (backend `backend/src/SMCA.WebApi.E2ETests/` or frontend `frontend-react/e2e/`) without explicit authorization.

This archive phase touched ONLY SDD artifacts under `openspec/` (folder move + spec merge + archive report). It touched no test code, no production code, and made no git commit (the orchestrator commits after this report). The change itself shipped previously on `main` with `StoreActivationTests.cs` byte-identical to before (no existing E2E test touched; all 18 new tests are ADD-ONLY, plus 1 new infra file `BillingConfigSeed.cs` and mandatory unit-test collateral).

## Final State (at close time)

Per the orchestrator's final-state handoff and the persisted, validated `verify-report` (rank-1 delivery authority — `sdd-verify-validate --input verify-report.md --requirements 9 --scenarios 36` → `{valid: true, verdict: pass}`), both of which outrank intermediate snapshots:

- **Delivered** (already on `main`, ranges verified at archive time via `git log`):
  - **WU1 production**: `CreateStoreService.cs` — `IDateTimeProvider` injected as 8th/last ctor param; `Store.Create(...)` 5th positional arg changed from `null` to `DateOnly.FromDateTime(_dateTimeProvider.UtcNow.UtcDateTime)` so **every** new store (admin `POST /v1/stores` + self-registration, paid or free-only) starts its trial clock at creation. `RegisterStorePaymentCommand.cs:67` comment-only refresh; guard intact. Mandatory unit collateral `CreateStoreServiceTests.cs` (renamed test + 8-arg factory + provider clock).
  - **WU2**: `CurrentUserDto.PlanType` on the wire — `CurrentUserDto.cs:23` (`PlanType` default `"Free"`), `GetMeQuery.cs:104` (`PlanType = billing.PlanType`), `BillingService.cs:53` (store-not-found early return `"Free"`).
  - **WU3 infra**: `E2ETests/Infrastructure/BillingConfigSeed.cs` — per-test disposable pin of `TestingPeriodInMonths`/`PaymentGraceDays`/`DueSoonDays` with conditional DELETE-vs-UPDATE restore (absent Id-4 row restored to absent) and cache eviction on enter + dispose.
  - **WU4–WU9**: `E2ETests/Billing/StoreCreationTrialTests.cs` — 18 new tests across groups A–F (admin create, self-registration, derived boundaries C, to-collect D, payments E at `Price = 3000`, legacy null-start F).
- **No production behavior removed**: the `UpdateStore` activation-on-first-paid conditional survives as the legacy-row activation path; no migration/backfill; `StoreBillingUtils` math untouched; `NoAplica` disappears for new stores (free stores may now show `Vencido` while owing $0 — accepted).
- **Commits** (the change's WU1–WU9, on `main`, ancestor of HEAD):
  - `bbcd934c` — `test(stores): pin that the client never seeds the trial clock on create` (WU1 unit collateral)
  - `fd0f4ba2` — `feat(stores): start the trial clock at creation, not at first paid update` (WU1)
  - `b94e7ce2` — `feat(billing): expose PlanType on CurrentUserDto` (WU2)
  - `7950a5ad` — `test(e2e): add BillingConfigSeed helper to pin trial/grace/due-soon config` (WU3)
  - `f6fae11d` — `test(e2e): pin admin store creation always seeds the trial clock (group A)` (WU4)
  - `a6e1e7ab` — `test(e2e): pin self-registered stores report trial + Paid plan (group B)` (WU5)
  - `8f93d1aa` — `test(e2e): pin trial/due/PorVencer/EnGracia/Vencido boundaries (group C)` (WU6)
  - `8c16d2db` — `test(e2e): pin to-collect visibility during trial and free-plan zero-amount (group D)` (WU7)
  - `61089680` — `test(e2e): pin brand-new self-registered store payment at 3000 (group E)` (WU8)
  - `b93e4ace` — `test(e2e): pin legacy null-start rows are never retro-activated (group F)` (WU9)
  - Openspec artifacts: `855a38c0` (docs(sdd): add change artifacts), `c216b9c5` (chore(openspec): tasks closed + verify report 22/22).
- **Verification PASS (GREEN)** — fresh runs on 2026-08-11 against real PostgreSQL (`localhost:5432`, db `smca_test`, `WebAppFixture` applies migrations):
  - Focused E2E: `dotnet test ... --filter "FullyQualifiedName~StoreCreationTrial|FullyQualifiedName~StoreActivation|FullyQualifiedName~RegisterStorePayment"` → **24/24** (exit 0).
  - Full E2E assembly (regression): **342/342** passed / 0 failed / 0 skipped (exit 0).
  - Full unit assembly (regression): **330/330** passed / 0 failed / 0 skipped (exit 0).
  - Unit collateral: `CreateStoreServiceTests` → **28/28** (exit 0).
  - Build: `dotnet build ... --no-restore` → **0 errors** (4 pre-existing NU1902/NU1903 package warnings).
  - Validate: `sdd-verify-validate` → `{valid: true, verdict: pass}`, **9/9 requirements, 36/36 scenarios, 0 CRITICAL, 0 WARNING**.
- **Task completion**: `tasks.md` **22/22 `[x]`** (14 work-unit boxes WU1–WU9 + 8 success criteria), 0 unchecked.

## Task Completion Gate

The persisted filesystem artifact `openspec/changes/archive/2026-08-11-store-creation-trial/tasks.md` was moved into the archive **as-is** with 22/22 checkboxes `[x]` — no stale unchecked task for completed work, no archive-time reconciliation needed. Each `[x]` was marked by apply (confirmed by apply-progress observation #748 and verify-report #749). The verify report's task-coverage section re-confirmed all 22 boxes and their evidence citations against current line numbers.

## Review Gate Disposition

No structured status with `reviewGate` supplied in the orchestrator launch prompt; no review artifacts exist for this change (no `reviews/` dir, no review transaction/ledger/receipt/gate-context topics in Engram). Kill switch `gentle-ai review mode status` → **off (clone_local)**. No review governs this change → gate disposition **`disabled/unmanaged`**: there is no review policy or receipt to validate. This matches the repo precedent `openspec/changes/archive/2026-08-11-e2e-s2-01-backend/archive-report.md` and every prior archive in this repository. No invented receipt — the runtime ledger (attempts 1+2 `passed`, `complete: true`) corroborates delivery without a review gate.

## Spec Sync (openspec) — Delta MERGE into main specs

Two delta specs were synced into the canonical `openspec/specs/` catalog. The prior precedent (e.g. `2026-07-28-billing-e2e-coverage-fixes`) merges delta ADDED/MODIFIED into the existing main spec for the billing domain. Both target main specs existed; a merge (not copy) was performed, preserving all requirements not mentioned in the deltas.

### `openspec/specs/billing/spec.md` (MODIFIED + ADDED merge)
| Action | Details |
|--------|---------|
| MODIFIED `Store.PaymentStartDate (modified)` | Domain-table updated to the new creation-time unconditional activation (both entry points, paid/free-only), the surviving legacy update-path conditional, client-input rule, and no-migration/backfill rule; 6 new creation/legacy scenarios appended. |
| MODIFIED `R4: Enforcement — Overdue Downgrade` | `CurrentUserDto` field list gains `PlanType` (`"Paid"`/`"Free"`); 2 new scenarios added: `Self-registered store reports PlanType=Paid`, `Free-only store reports PlanType=Free`. Existing overdue-downgrade and paid-full-access scenarios preserved. |
| ADDED | `Requirement: Free-plan stores surface in "to collect" at Amount = 0 (accepted consequence)` + scenario. |
| ADDED | `Requirement: Free-only stores may report Vencido while owing $0 (accepted consequence)` + scenario. |
| Preserved | All pre-existing requirements R1–R14, scenarios, and the `StorePayment`/`SystemConfigurationType`/other Domain Model sections untouched. |

### `openspec/specs/billing-e2e-coverage/spec.md` (MODIFIED + ADDED merge)
| Action | Details |
|--------|---------|
| MODIFIED `R8: PUT /stores/{id} — Activation on first paid` | Intro note added clarifying this conditional is now the legacy-row-only activation path; 3 scenarios copied verbatim (no behavior change). |
| MODIFIED `R9: POST /features/activate — Statistics price` | Intro note added (unchanged — pricing not touched); scenario copied verbatim. |
| ADDED | `Requirement: StoreCreationTrialTests Suite (18 tests)` — full A–F scenario set. |
| ADDED | `Requirement: Suite MUST Pin SystemConfiguration Rows` + scenario. |
| ADDED | `Requirement: StoreActivationTests Remains Unchanged` + scenario. |
| Preserved | Pre-existing R1–R7 coverage requirements and their scenarios untouched. |

**SUGGESTION 2 applied during doc-sync**: the group-C baseline absolute dates in the `StoreCreationTrialTests Suite` requirement were aligned from `2026-01-10`/`2026-03-10` to **`2026-03-10`/`2026-05-10`**, matching the implementation's anchor (`design.md` D7, `tasks.md` WU4) and the values the tests actually assert. All relative windows (`+2mo`, `-5d`, `+1..+5d`, `+6d`) are unchanged — this is a documentation-parity alignment only, no requirement semantics altered. The archived delta spec (in this archive folder) preserves the original `2026-01-10` baseline as the audit trail; the canonical catalog now carries the consistent numbers.

The repository's main specs already reference dates in the same family (e.g. `openspec/specs/billing/spec.md` uses `2026-01-10`/`2026-03-10` in R1/R2 R2 scenarios). Those pre-existing requirements belong to other changes and were **not** touched — the alignment was scoped strictly to this change's group-C baseline as instructed, and no requirement marked new that already exists.

## Out of Scope / Not Delivered (explicit, per orchestrator handoff)

- **`NoAplica` disappears for new stores** — documented behavior, not a defect (free-only stores may report `Vencido` while owing $0; no module lost).
- **`CurrentMonthAmount` divergence** in `RegisterStorePayment` — known, pre-existing, expressly not asserted (design D9).
- **SUGGESTION 1** (`PlanType == "Free"` not asserted on the wire in E2E) and **SUGGESTION 3** (null-store early-return `"Free"` untested) — optional future coverage parity, not required by the 18 scenarios; recorded, not delivered.
- **SUGGESTION 4** (pre-existing NU1902/NU1903 package vulnerabilities) — surfaced for the dependency-upgrade backlog; unrelated to this change.
- **Shared test DB `smca_test`** concurrent-run interference — documented risk, not a blocker.

## Traceability

- Filesystem archive: `openspec/changes/archive/2026-08-11-store-creation-trial/` (proposal, specs/billing, specs/billing-e2e-coverage, design, tasks 22/22 `[x]`, verify-report, archive-report).
- Engram `sdd/store-creation-trial/apply-progress` — observation **#748**
- Engram `sdd/store-creation-trial/verify-report` — observation **#749**
- Engram `sdd/store-creation-trial/archive-report` — this report (saved at archive time)
- Proposal/spec/design/tasks were persisted on the filesystem (openspec mode for those phases); only apply-progress and verify-report topics were found in Engram for this change. The filesystem artifacts (proposal.md, design.md, tasks.md, specs/*) are the canonical source, consistent with the repo's phase-persistence pattern.
- Canonical main specs updated: `openspec/specs/billing/spec.md`, `openspec/specs/billing-e2e-coverage/spec.md`.
- Deliverable commits WU1–WU9: `bbcd934c`, `fd0f4ba2`, `b94e7ce2`, `7950a5ad`, `f6fae11d`, `a6e1e7ab`, `8f93d1aa`, `8c16d2db`, `61089680`, `b93e4ace` — verified at archive time via `git log`/`git merge-base --is-ancestor`.

## Final State Summary

Change **COMPLETE** at close time: every new store starts its trial clock at creation (admin + self-registration, paid/free-only), `PlanType` exposed on `/auth/me`, 18 new E2E tests + 1 config-pin infra file + mandatory unit collateral, all verified **PASS** on real PostgreSQL (focused 24/24; regression E2E 342/342, unit 330/330; build 0 errors; validate 9/9 reqs, 36/36 scenarios; 0 CRITICAL/WARNING). tasks 22/22 `[x]`. `StoreActivationTests.cs` byte-identical to `main` (no existing E2E test touched). Delta specs merged into the canonical catalog (`billing`, `billing-e2e-coverage`) with SUGGESTION-2 date alignment; change folder moved to archive. SDD cycle closed.
