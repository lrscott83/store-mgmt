# Tasks: Admin Features Parity (Stage 5 Admin)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 60-100 (1 route file rewritten, 2 i18n value edits, 1 test file additions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single work unit |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Card+FAB shell swap + i18n typo/copy fix + structural test assertions | commits-only | single autonomous unit, tests included, no PR/push |

## Phase 1: Structural Parity — Card Shell + FAB

- [x] 1.1 RED: `app/admin/features/routes/__tests__/features.test.tsx` — add assertion that `container.querySelector('[data-slot="card"]')` is truthy after render (Card shell present).
- [x] 1.2 RED: same file — add assertion that `screen.getByRole('button', { name: esMessages['FEATURES.ACTIVATE_FEATURES'] }).querySelector('svg')` is truthy (FAB carries an icon; no path-data assertions). Run suite, confirm both new assertions fail against current `features.tsx`.
- [x] 1.3 GREEN: `app/admin/features/routes/features.tsx` — import `Card` from `~/shared/components/ui/card`, `Button` from `~/shared/components/ui/button`, `SettingsIcon` from `~/shared/components/ui/icons` (paths confirmed via `reseller-card-list.tsx`/`owner-card-list.tsx`). Replace `<div><h1>...</h1><button>...</button>...</div>` with `<Card title={formatMessage({ id: 'FEATURES.TITLE' })}>` wrapping a `div.space-y-4` containing a `div.flex.justify-end` with `<Button variant="fab" onClick={handleActivate} disabled={isLoading}><SettingsIcon />{formatMessage({ id: 'FEATURES.ACTIVATE_FEATURES' })}</Button>`, followed by the existing inline `<p>` success/error blocks (add `text-sm text-success` / `text-sm text-danger` classes). Keep `handleActivate`, `isLoading` guard, and state hooks verbatim — no logic changes.
- [x] 1.4 Verify: `pnpm -C apps/web-store-pos exec vitest run app/admin/features/routes/__tests__/features.test.tsx` — all tests green (existing title/button-role/success/error/double-submit/throw tests stay green; new Card/FAB-icon assertions now pass).

## Phase 2: i18n Copy Parity (ADR-2)

- [x] 2.1 `app/shared/lib/i18n/es.ts:607` — in-place value change: `'FEATURES.FEATURES_ACTIVATED'` → `'Las funcionalidades se activaron satisfactoriamente'`.
- [x] 2.2 `app/shared/lib/i18n/es.ts:608` — in-place value change: `'FEATURES.UNEXPECTED_ERROR'` → `'Ocurrió un error inesperado activando las funcionalidades'` (fixes Angular's `unb` typo to `un`; do NOT copy the typo verbatim; do NOT replicate the unrelated `GENERAL.RESPONSE.ERROR` missing-key bug — out of scope, React path is already correct).
- [x] 2.3 Verify: re-run `app/admin/features/routes/__tests__/features.test.tsx` — success/error/throw assertions read `esMessages[...]` dynamically, confirm they stay green with no literal test edits needed.

## Phase 3: Full Verification Gate

- [x] 3.1 `pnpm -C apps/web-store-pos exec vitest run features` — targeted features suite green.
- [x] 3.2 `pnpm -C apps/web-store-pos exec tsc --noEmit` — zero errors.
- [x] 3.3 `pnpm -C apps/web-store-pos exec vitest run` — full suite green, no regressions from the es.ts value changes (grep-confirm no other consumer relies on old `FEATURES.FEATURES_ACTIVATED`/`FEATURES.UNEXPECTED_ERROR` literal values).
- [x] 3.4 `pnpm -C apps/web-store-pos build` — succeeds.

## Commit Plan (work-unit-commits)

1. `fix(web-store-pos): admin features page Card + FAB shell parity` (Phase 1)
2. `fix(web-store-pos): admin features i18n copy parity + typo fix` (Phase 2)

Commits-only on `feat/frontend-parity-audit`, no PR/push. Each commit includes its tests. Rollback: revert either commit independently without affecting the other.
