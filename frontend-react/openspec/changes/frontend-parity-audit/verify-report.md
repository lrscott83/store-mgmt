# Verify Report: Frontend Parity Audit — Stage 0

**Change:** frontend-parity-audit
**Phase:** Verify (covers Stage 0 only)
**Date:** 2026-07-01
**Mode:** Hybrid (engram + openspec file)

---

## What

Verified Stage 0 (Foundations + Design Tokens) of frontend-parity-audit against spec/tasks. Verdict: **PASS-WITH-WARNINGS**.

## Why

Stage 0 is the hard-blocking gate before any module-slice (Stage 1+) work begins; spec Requirement L5 (Visual/Design Parity) and L1/L3/L7 requirements needed independent confirmation before greenlighting Stage 1 (Sales).

## Where

- `frontend-react/packages/web-common/styles.css` — design tokens
- `frontend-react/apps/web-store-pos/app/shared/components/ui/{button,card,info-box}.tsx` + `__tests__`
- `frontend-react/apps/web-store-pos/app/shared/routes/$.tsx` + `__tests__/$.test.tsx`
- `frontend-react/apps/web-store-pos/app/shared/lib/auth/authorization-service.ts`, `app/auth/routes/loaders.ts`

## Verification Results

1. **Design tokens: CORRECT.** `--color-primary: 103 58 183` (#673ab7, Deep Purple 500) confirmed matching Angular Material deeppurple-amber theme (`frontend/src/scss/deeppurple-amber.css` uses #673ab7 pervasively). NOT the old cyan (34 211 238), NOT Bootstrap #6f42c1. `@theme` block registers primary/secondary/accent/success/danger/warning/info/background/surface/text/border/radii(sm,md,lg,pill)/shadow(card,header)/font-size utilities — complete.
2. **Base UI components: EXIST and TESTED.** `button.tsx` (Button variants primary/secondary/danger/outline + FloatingButton) 12 tests, `card.tsx` 5 tests, `info-box.tsx` 5 tests — all pass, all use `bg-primary`/`text-primary`/`border-primary` token utility classes, zero hardcoded hex/cyan values. Confirmed zero consumers yet (grep found no imports outside `__tests__`) — correct, expected, module-slice work not started.
3. **L1 models/enums: zero live gaps confirmed.** `TodayInventoryStats=32` verified dead (`nav.ts` lines 312-316 commented out, `enums.ts:40` defines it but unused). Spot-checked against Angular source directly, matches apply-progress claim.
4. **L7 catch-all:** `shared/routes/$.tsx` has `loader()` returning `redirect('/')`, matching Angular's `{path:'**',redirectTo:''}` (`app-routing.module.ts:334`). 1 test passing. Correct — not a static 404.
5. **L3 auth:** `authorization-service.ts` `isUserAuthorized` uses `featureIds.some()`, `effectiveStoreId = storeId ?? user.selectedStoreId`, `loaders.ts` `denyAccess()` calls `logout()` then `redirect('/login')`. All three semantics confirmed matching Angular guards via direct code read, not just trusting apply-progress.
6. **Tests:** 74 files / 819 tests pass (`pnpm exec vitest run`). `tsc --noEmit` clean (web-store-pos).

## Learned

CRITICAL finding during verification — the apply-progress artifact (saved earlier in the session) is STALE regarding the primary color. It documents `--color-primary: 111 66 193` (#6f42c1, Bootstrap purple) as the "confirmed" choice with an open question flagging #673ab7 as the static-analysis-correct alternative. However git history shows a 4th commit `e11cce9` (~4 min after the apply-progress save) titled "fix(web-common): correct primary token to Material #673ab7 (deeppurple-amber)" that superseded this and is what's actually in the working tree today — code is CORRECT, only the persisted apply-progress narrative is outdated.

This is a process gap: apply-progress must be re-synced after any late fix-up commit, or verify will flag false CRITICALs by trusting stale memory over the actual file. Downgraded from CRITICAL to WARNING (documentation drift) precisely because independent code verification (not just trusting the artifact) caught that the actual deliverable already satisfies the spec.

## Scope Note

This report covers **Stage 0 only** (Foundations + Design Tokens). Stages 1-10 (per-module slices: Sales, Inventory, Expenses, Management, Admin, Sync, Reports, Statistics, Profile, Help) have not yet been verified — see `tasks.md` for their checklist status.
