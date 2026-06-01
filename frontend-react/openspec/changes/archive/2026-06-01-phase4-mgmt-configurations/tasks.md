# Tasks: phase4-mgmt-configurations

**Change**: phase4-mgmt-configurations
**Phase**: Tasks
**Status**: Applied — all 13 tasks complete, 601 tests GREEN, typecheck clean
**Date**: 2026-06-01
**Mode**: Hybrid (engram + openspec file)

## Baseline test count

**Declared baseline: 576** (phase4-mgmt-users final). All pre-existing tests MUST stay GREEN.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~230–290 LOC |
| Number of files touched | ~10 new + 2 modified |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Decision needed before apply | No |

This is the smallest slice of the Management phase: 1 route, 1 presentational component, 1 HTTP service, no create/edit sub-routes. Total ~338 LOC. Under the 400-line budget. Single PR delivery.

---

## Phase 1: Foundation — Domain Model + HTTP Service (W-1)

**Spec**: HTTP-1..4, ERR-5, TEST-5 | **Design**: DC1, DC3, DC7

- [x] 1.1 RED: Create `configuration-http-service.test.ts` with 5 tests
- [x] 1.2 DOMAIN: Add `SystemConfiguration { id: string; name: string; value: string }` to `packages/domain/src/models/store.ts`
- [x] 1.3 GREEN: Create `configuration-http-service.ts` — `listConfigurations()` GET + `updateConfigurations()` PUT
- [x] 1.4 VERIFY: Full test suite 581 tests GREEN (576 baseline + 5 W-1)

---

## Phase 2: Core Implementation — ConfigurationsForm (W-2)

**Spec**: PRES-1..6, SAVE-1, SAVE-3, SAVE-5, OFFLINE-3, OFFLINE-5, TEST-3 | **Design**: DC4, DC5

- [x] 2.1 RED: Create `ConfigurationsForm.test.tsx` with 7 cases
- [x] 2.2 GREEN: Create `ConfigurationsForm.tsx` — pure presentational, generic N-row name/value form
- [x] 2.3 VERIFY: Full suite 588 tests GREEN (576 + 5 W-1 + 7 W-2)

---

## Phase 3: Integration — Route Container + Wiring (W-3)

**Spec**: ACCESS-1..5, ROUTE-1..2, CONFIG-1..5, SAVE-1..4, OFFLINE-1..5, I18N-1..3, ERR-1..4, TEST-1..4, TEST-6 | **Design**: DC2, DC5, DC6, DC8

- [x] 3.1 I18N: Add `CONFIGURATIONS.*` block (10 keys) to `es.ts`
- [x] 3.2 RED: Create `configurations.test.tsx` with 13 cases
- [x] 3.3 GREEN: Create `configurations.tsx` container — loader, fetch, online-gate, LOADING gate, submit
- [x] 3.4 ROUTES: Add 1 route to `app/routes.ts`
- [x] 3.5 VERIFY: Full suite 601 tests GREEN (576 + 5 + 7 + 13). Typecheck clean.

---

## Test Delta Summary

| Work Unit | New Tests | Running Total |
|-----------|-----------|---------------|
| Baseline | — | 576 |
| W-1 HTTP service | +5 | 581 |
| W-2 ConfigurationsForm | +7 | 588 |
| W-3 Container | +13 | 601 |

**Final: 601 tests GREEN. 3/3 work units, 13/13 tasks complete.**
