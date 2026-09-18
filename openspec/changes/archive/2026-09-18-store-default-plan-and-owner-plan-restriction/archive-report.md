# Archive Report — store-default-plan-and-owner-plan-restriction

Archived 2026-09-18 via the SDD flow (native `gentle-ai` archive readiness confirmed: 23/23 tasks complete, `verify: ready`, `archive: ready`, no blocked reasons).

## Verdict

**SUCCESS.** Change fully planned, implemented, verified, and archived. Canonical specs synced (parent-approved archive-time fallback), change folder moved byte-preserving to `openspec/changes/archive/2026-09-18-store-default-plan-and-owner-plan-restriction/`, canonical specs synced in the same commit.

## Final-State Facts (at close, 2026-09-18)

- **Tasks**: 23/23 complete; `tasks.md` has zero unchecked implementation tasks.
- **Implementation** commits on `main`: `df3695a6`, `f98da701`, `50bf6f5b`, `467d3e41`, `d93cb5fb`, `f4af62c3`, `c357c305`, `db2c7a65`.
- **Implementation** (final state, outranks intermediate snapshots):
  - Birth plan is `StorePlanType.Pago` for BOTH admin create and self-registration (`CreateStoreService.cs:45`, previously `Superior`).
  - Superior/VIP plan changes gated to SuperAdmin callers only (`ChangeStorePlanCommand.cs:97-101`); owners keep free change among Gratis/Pago.
  - Owner plan modal and plan route filtered to Gratis/Pago panels for non-SuperAdmin (`edit-plan-modal.tsx:85-91`, `store-plan.tsx:158-164`).
- **Verification** (final state):
  - Backend unit (authorized filter `StoreCreatePlanTests|ChangeStorePlanCommand`): **16/16 passed**.
  - Frontend: `pnpm test` **3736/3736 passed (259 files)**; `pnpm typecheck` clean.
  - Playwright (authorized pair `owner-stores.spec.ts` + `plan-change-permission-refresh.spec.ts`): **6/6 passed**.
  - Backend E2E (authorized set): **28/29 passed**, with ONE accepted environmental failure — see below. DB not cleaned; test not retried (per user acceptance).

## Canonical Spec Sync

Applied the combined delta in `spec.md` to the canonical specs. Composition ran through the native `gentle-ai sdd-archive-compose` (per-domain delta slices extracted byte-exact from `spec.md`; partition verified byte-identical to the source). Only the delta requirements were applied — nothing added or removed beyond the delta.

| Delta block | Section | Canonical file | Action | Scenarios |
|---|---|---|---|---|
| `Store Creation Default Plan — Pago at Birth` | ADDED | `openspec/specs/billing/spec.md` | appended | 3/3 |
| `Owner Plan Change Endpoint` | MODIFIED | `openspec/specs/billing/spec.md` | replaced by exact requirement name | 9 (owner→VIP-200 scenario deliberately replaced by owner→Superior/VIP-403, the delta's core behavior flip) |
| `Plan Panels Activation Contract (owner plan change)` | MODIFIED | `openspec/specs/management-stores/spec.md` | replaced by exact requirement name | 6 (4 prior scenarios preserved verbatim + 2 new role-filter scenarios) |

Scenario preservation: every unchanged scenario from the replaced canonical blocks is preserved verbatim inside the delta's full-block replacements. The one removed scenario (`Owner changes to VIP`, expected 200) is the intentional behavioral change of this delta — documented in the requirement text itself ("(Previously: :536 allowed 'owner or SuperAdmin' with NO plan restriction; the designed scenario :569-572 made owner→VIP a 200") and in the caller×target-plan matrix (Owner row: Superior/VIP = 403). Not a silent drop. No `## REMOVED Requirements` sections existed in this delta.

## Accepted Environmental Finding

`MeAfterOwnerPlanChangeTests.Me_follows_the_plan_across_superadmin_flips_with_same_owner_token` (`MeAfterOwnerPlanChangeTests.cs:120`) failed in the authorized E2E run (28/29). Root cause is environmental, not code: the shared `smca_test` database is polluted by a FOREIGN migration, `20260918153139_Add-Elaboration-Module`, which seeds Module 17 "Elaboración" (plus `StorePlanModule` rows (3,17) and (4,17)). That migration does NOT exist in this repo (`backend/src/Infrastructure/Migrations/` has no such file; no "Elaboración" anywhere in `backend/src`); the re-anchored test expectations match this repo's own catalog exactly (`StorePlanModuleEntityTypeConfiguration` Superior/VIP = 14 members, `ModuleType` max 15). The user explicitly accepted this failure; the DB was NOT cleaned and the test was NOT retried. The test itself is untouchable per project rules and was not modified. Same pollution explains the pre-existing `StorePlanCatalogTests` failure noted in earlier evidence.

## Move Evidence

- Move: `git mv openspec/changes/store-default-plan-and-owner-plan-restriction openspec/changes/archive/2026-09-18-store-default-plan-and-owner-plan-restriction`
- Integrity: every file SHA-256 hashed before and after the move; both hash sets byte-identical (full hash table in the archive phase result).
- Implementation commits (final-state evidence): `df3695a6`, `f98da701`, `50bf6f5b`, `467d3e41`, `d93cb5fb`, `f4af62c3`, `c357c305`, `db2c7a65`.
- Archive commit: `docs(sdd): archive store-default-plan-and-owner-plan-restriction and sync canonical specs` (final hash recorded in the phase result).

## Artifacts

`proposal.md`, `spec.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md` (read from `openspec/changes/store-default-plan-and-owner-plan-restriction/`) + this `archive-report.md`. All moved with the folder; archived `tasks.md` shows 23/23 complete.