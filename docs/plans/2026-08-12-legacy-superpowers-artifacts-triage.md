# Legacy `docs/superpowers/` Artifacts — Triage Plan

Date: 2026-08-12
Status: **Open — decision pending. Nothing moves until this is reviewed.**
Scope: the 5 files under `docs/superpowers/` that predate the new artifact rule. No code is involved; this is a documentation-placement decision.

## Why this file exists

`CLAUDE.md` now routes every Superpowers artifact into `openspec/changes/<change-name>/` (`superpowers-design.md` / `superpowers-plan.md`) and forbids the `sdd-*` skills in this project. That rule governs **new** work. It leaves 5 pre-existing files in the old default location.

They were deliberately **left in place**, not migrated, because only 2 of the 5 have an unambiguous destination. Guessing the other 3 would scatter related documents across folders that do not describe them. The decision is queued here instead of being made silently.

## The 5 files

| File | Lines | Last commit | Obvious destination? |
|---|---:|---|---|
| `plans/2026-07-25-store-paid-plan-billing-backend.md` | 909 | `176e7e2c` (2026-07-25) | ✅ `openspec/changes/archive/2026-07-27-store-paid-plan-billing-backend/` |
| `plans/2026-07-25-store-paid-plan-billing-frontend.md` | 365 | `176e7e2c` (2026-07-25) | ✅ `openspec/changes/archive/2026-07-27-store-paid-plan-billing-frontend/` |
| `plans/2026-07-25-store-plan-picker.md` | 417 | `32ea3ad7` (2026-07-25) | ❌ no change folder by that name exists |
| `specs/2026-07-25-store-paid-plan-billing-enforcement-design.md` | 206 | `1c79e5b7` (2026-07-25) | ❌ one design, **two** candidate changes (backend and frontend) |
| `specs/2026-07-25-store-plan-picker-design.md` | 151 | `4ae1d36e` (2026-07-25) | ❌ no change folder by that name exists |

## What the evidence actually says

Three findings that must not be misread when this is picked up.

### 1. The unchecked boxes do NOT mean the work is pending

All three plans show **0 checked and 105 unchecked** task boxes combined (58 + 34 + 13). The work nevertheless shipped. Verified in code, not inferred:

- `frontend-react/apps/web-store-pos/app/management/stores/components/plan-picker.tsx` exists and is wired into `store-form.tsx`, with tests.
- `backend/src/Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommand.cs` and `.../Queries/GetReSellerCommissions/GetReSellerCommissionsQuery.cs` exist.
- `openspec/changes/archive/2026-07-27-store-paid-plan-billing-{backend,frontend}/` are archived changes with their own `verify-report.md` / `archive-report.md`.

These plans were never executed through Superpowers task-by-task; the work was re-driven through the (now retired) SDD pipeline. The checkboxes are stale, not a backlog. **Do not re-open them as work.**

### 2. The design docs carry a stale status line

Both design files say `Status: Approved design, pending implementation plan`. Implementation happened. Whatever is decided below, that line is wrong today.

### 3. Moving these files breaks internal links

The backend plan links to its design as `../specs/2026-07-25-...-design.md` and to the frontend plan as a sibling. These are **relative paths that depend on the current two-folder layout**. Any move that separates a plan from its design, or a plan from its companion plan, silently breaks those links. Whoever moves them must rewrite the links in the same commit.

## The decision to make

Pick one, for all 5 files together:

- [ ] **A — Leave as legacy (current state).** `docs/superpowers/` becomes a read-only historical folder. Zero risk, zero work. Cost: two folders hold planning artifacts forever, and someone will eventually ask which one is authoritative.
- [ ] **B — Move the 2 that map, leave 3.** Honest about what is known, but it splits the billing set: the backend plan would land in the archive while the design it links to stays behind. Worst option for the relative links.
- [ ] **C — Create archive folders for the unmapped ones.** e.g. `openspec/changes/archive/2026-07-25-store-plan-picker/` and place the shared billing design in whichever change is chosen as its owner. Fully consolidates, but invents a change folder that never existed as a change, which makes `archive/` slightly fictional.
- [ ] **D — One legacy bucket.** `openspec/changes/archive/2026-07-25-legacy-superpowers-plans/` holding all 5 with their current relative layout intact, so no link rewriting is needed. Consolidates without inventing per-change history.

## Execution rules if anything moves

- [ ] Use `git mv`. **Never** read-then-write. Re-authoring artifacts during a move has silently corrupted them in this repo before — a table `\|` became `||` at an identical line count, so the diff looked clean. `git mv` preserves bytes and history.
- [ ] Rewrite the relative cross-links (`../specs/...`, sibling-plan links) in the same commit as the move, then confirm every link resolves.
- [ ] Fix the stale `Status:` line on both design docs while touching them.
- [ ] After the move, `docs/superpowers/` must be empty and removed — a half-migrated folder is worse than either end state.

## Related

- `CLAUDE.md` § "Planning workflow — Superpowers only, artifacts in `openspec/`"
- `openspec/changes/archive/2026-07-27-store-paid-plan-billing-{backend,frontend}/`
