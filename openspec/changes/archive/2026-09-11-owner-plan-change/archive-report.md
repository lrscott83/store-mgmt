# Archive Report — owner-plan-change

**Change**: owner-plan-change · **Archive date**: 2026-09-11 · **Mode**: openspec (file-backed)
**Verdict carried from verify**: PASS WITH WARNINGS (CRITICAL: 0, WARNING: 1, NOTE: 1) — envelope refreshed 2026-09-11 (3/3 requirements engine-count, 22/22 scenarios), attempt settled complete.
**Archive status**: PASS

## Archived path

`openspec/changes/archive/2026-09-11-owner-plan-change/` (moved with `git mv` after `git add`; byte-identity of every file verified against the pre-move snapshot).

## Artifacts read

proposal.md, explore.md, design.md, tasks.md, verify-report.md, specs/billing/spec.md (delta), openspec/config.yaml, canonical specs (billing, management-stores; surveyed admin-stores, stores-by-current-user, e2e-store-plan-activation-ui).

## Domains synced

| Domain | Operation |
|--------|-----------|
| `billing` | 3 requirements ADDED (`Owner Plan Change Endpoint`, `Sacred Payment Anchor`, `Next-Due Override Mechanics`) + Domain Model table rows MODIFIED (`Activation (legacy update path)` — auto-activation removed; `Lock` — DG-7 extended to all stores, no free-store exception) |
| `management-stores` | 1 requirement block REPLACED (`PlanPicker Read-Only Lock After Plan Activation` → `Plan Panels Activation Contract (owner plan change)`) |

### ADDED requirement names

- `Owner Plan Change Endpoint`
- `Sacred Payment Anchor`
- `Next-Due Override Mechanics`

### MODIFIED requirement names (and their canonical locations)

- `billing: Toggle Store Plan (store-plan-toggle era)` — the toggle-era requirements were never synced to a canonical spec (pre-existing sync gap from the 2026-09-02 `store-plan-toggle` archive, which predates the sync layer). No canonical counterpart block exists to replace; the current toggle contract is carried instead by the ADDED `Owner Plan Change Endpoint` requirement (SuperAdmin/ReSeller toggle semantics, direction from `StorePlanId`, anchor kept) and the `Sacred Payment Anchor` (toggle Paid→Free no longer nullifies the anchor). Recorded as a sync-gap note, not a destructive merge.
- `billing: UpdateStore DG-7 (one-way plan lock)` — canonical counterpart lives as the `Lock` row of the `Store.PaymentStartDate` Domain Model table in `openspec/specs/billing/spec.md`; replaced with the strengthened rule (non-SuperAdmin module-set lock on ANY store, no free-store activation exception, `ModuleIds == null` never fires, plan changes via `change-plan` only).
- `management-stores: Plan panels activation contract` — canonical counterpart `PlanPicker Read-Only Lock After Plan Activation` in `openspec/specs/management-stores/spec.md`; full block replaced per the delta (activation via `changeStorePlan`, no readOnly lock, stripped rows, strikethrough header, includes-previous text, green help icon, right-aligned close).

### REMOVED requirement names

(none)

## Archive-time sync fallback

Approved by the orchestrator (parent) for this archive: no `sync-report.md` existed (the change predates the `sdd-sync` phase introduction; verified `next: archive` with no blocked reasons on the native engine). Sync executed by the orchestrator inline following the `sdd-archive` merge rules, destructive-merge guard satisfied: no REMOVED blocks; the replaced `PlanPicker` block and Domain Model rows are authorized MODIFIED replacements from the delta.

## Final Task Completion Gate

Re-read `tasks.md` immediately before sync/move: **0 unchecked** implementation tasks (`grep -c "^\s*- \[ ]" = 0`; 41/41 complete per native status). No stale-checkbox reconciliation needed.

## Final-state facts (post-verify events recorded for the audit trail)

These happened after the verify-report was originally persisted and are part of this change's completion story:

1. **2026-09-11 merges onto main**: origin/main `9cadba57`, origin/qa `f47bf437`, origin/dev `a10afbe4`. Two semantic resolutions, both validated by full suites:
   - `BillingService.GetStoreBillingSummaryAsync` planType: combined qa's disapproved-store guard with this change's StorePlanId derivation → `!store.Approved || store.StorePlanId == (int)StorePlanType.Gratis ? "Free" : "Paid"`.
   - `AuthzSeed.cs`: union of qa's `approved: true` with `storePlanId: Gratis`.
2. **Full post-merge verification (2026-09-11)**: build 0 errors; Domain.UnitTests 22/22; Application.Tests 433/433; SMCA.WebApi.E2ETests 492/492 (real PostgreSQL); frontend typecheck 5/5, vitest 3430/3430, lint green after fixing a pre-existing split eslint-disable directive (commit `a7688240` — error introduced by qa's product-picker refactor, not this change).
3. **Verify-report envelope refresh (2026-09-11)**: totals realigned to the engine's requirement count (3/3; the original envelope counted 3 NEW + 3 MODIFIED = 6, the engine counts only `### Requirement:` NEW-format headers). Scenario coverage unchanged (22/22). Focused ChangeStorePlan E2E matrix re-run: 10/10 passed. Attempt `sha256:abb2b4c9…` settled complete.
4. **WARNING-1 (residual)**: FE Playwright runtime (`pnpm test:e2e`) remains DEFERRED — FE E2E specs are tsc-clean but no runtime pass was executed this cycle. Leftover, out of archive scope.
5. **WARNING-2**: remote plan doc `docs/plans/2026-09-10-store-plan-change-reauth-popup-plan.md` describes the OLD `updateStore` flow this change replaced (`changeStorePlan` superseded it); flagged for future implementers.

## Active same-domain change warnings

None. Other active changes (`dek-independent-of-auth-mode`, `pwa-offline-shell`) touch no billing/admin-stores/management-stores domain specs.

## Structured status findings

Native `sdd-status` at archive time: tasks 41/41, apply all_done, verify all_done (re-verified), archive ready, `blockedReasons: []`. A previous manual `git mv` archive attempt (commit `cb9d9aee`) was reverted (`7f983546`) at the user's request to redo archiving through the proper SDD flow; that revert is why this folder was untracked and required `git add` before `git mv`.

## Risks / leftovers

- FE Playwright runtime deferred (WARNING-1, user-accepted residual).
- Re-auth popup plan doc describes the superseded updateStore flow (WARNING-2).
- `store-plan-toggle`-era canonical sync gap (pre-existing; noted above, no action this archive).
