# Tasks: phase4-mgmt-configurations (Configurations sub-domain)

**Change**: phase4-mgmt-configurations
**Phase**: Tasks
**Status**: Applied — all 13 tasks complete, 601 tests GREEN, typecheck clean
**Date**: 2026-06-01
**Mode**: Hybrid (engram + openspec file)
**Reads**: spec #240, design #239, precedent tasks #220 (users)

## Baseline test count

**Declared baseline: 576** (phase4-mgmt-users final + W-1 fix). All pre-existing tests MUST stay GREEN.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~230–290 LOC (additions + deletions) |
| Number of files touched | ~10 new + 2 modified |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception (not needed — fits budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Estimate rationale

This is the smallest slice of the Management phase: 1 route, 1 presentational component, 1 HTTP service, no create/edit sub-routes, no lifecycle actions (create/update-credentials/activate/deactivate), no per-field typed form — pure generic list. Compared to Stores (~330 LOC) and Users (~1,100 LOC), Configurations is scoped to N-row read/edit only. Breakdown:

| File | New LOC est. |
|------|-------------|
| `packages/domain/src/models/store.ts` (+3 lines) | 3 |
| `configuration-http-service.ts` (~30 lines) | 30 |
| `configuration-http-service.test.ts` (~40 lines) | 40 |
| `ConfigurationsForm.tsx` (~55 lines) | 55 |
| `ConfigurationsForm.test.tsx` (~60 lines) | 60 |
| `configurations.tsx` (container, ~60 lines) | 60 |
| `configurations.test.tsx` (~70 lines) | 70 |
| `es.ts` (+~12 keys, ~15 lines) | 15 |
| `app/routes.ts` (+1 route block, ~5 lines) | 5 |
| **Total** | **~338 LOC** |

Adjusted for deletions/churn: net diff ~250–290 lines. Under the 400-line budget. **No chain needed.**

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| W-1 | Domain model + HTTP service (compile gate) | PR 1 | No UI deps; RED→GREEN isolated |
| W-2 | `ConfigurationsForm` presentational | PR 1 | Generic N-row edit; offline disable |
| W-3 | `ConfigurationsPage` container + route + i18n | PR 1 | LOADING gate (DC5); all wiring |

All three work units target the same PR (fits budget). The design build sequence is W-1 → W-2 → W-3 (strict dependency order).

---

## Phase 1: Foundation — Domain Model + HTTP Service (W-1)

**Spec**: HTTP-1..4, ERR-5, TEST-5 | **Design**: DC1, DC3, DC7

- [x] 1.1 RED: Create `app/management/configurations/lib/services/__tests__/configuration-http-service.test.ts` with 4 cases: `listConfigurations()` calls `GET /v1/configurations` and returns `.data`; `listConfigurations()` handles HTTP error; `updateConfigurations(payload)` calls `PUT /v1/configurations` with full `SystemConfiguration[]` body (DC3); `updateConfigurations(payload)` returns `.data` (boolean). Confirm RED (no service file yet).
- [x] 1.2 DOMAIN: Add `export interface SystemConfiguration { id: string; name: string; value: string }` to `packages/domain/src/models/store.ts` (after existing interfaces). Note: id is string (not number) for BaseRepository<T extends {id:string}> compatibility. Barrel already exports — NO index.ts edit needed (DC7).
- [x] 1.3 GREEN: Create `app/management/configurations/lib/services/configuration-http-service.ts` — singleton, imports `apiClient` and `SystemConfiguration`, exports `listConfigurations()` → `GET /v1/configurations` → `BaseResponseModel<SystemConfiguration[]>`, `updateConfigurations(configurations: SystemConfiguration[])` → `PUT /v1/configurations` → `BaseResponseModel<boolean>`. Both unwrap `.data`. 5 tests GREEN.
- [x] 1.4 VERIFY: Run full test suite; 581 tests GREEN (576 baseline + 5 W-1).

**Spec coverage**: HTTP-1, HTTP-2, HTTP-3, HTTP-4, ERR-5, TEST-5

---

## Phase 2: Core Implementation — ConfigurationsForm (W-2)

**Spec**: PRES-1..6, SAVE-1, SAVE-3, SAVE-5, OFFLINE-3, OFFLINE-5, TEST-3 | **Design**: DC4, DC5 (partial)

- [x] 2.1 RED: Create `app/management/configurations/components/__tests__/ConfigurationsForm.test.tsx` with 7 cases: renders N rows (one per entry, label=name read-only, input bound to value); editing a value updates that row's input; submit emits full updated `SystemConfiguration[]` (DC3 shape); submit button disabled + offline notice when `isOnline=false`; degraded-mode banner shown when `isDegraded=true`; empty-state message when `initialValues=[]`; error prop renders inline below form. Confirm RED.
- [x] 2.2 GREEN: Create `app/management/configurations/components/ConfigurationsForm.tsx` — pure presentational, props `{ initialValues: SystemConfiguration[]; isOnline: boolean; isLoading?: boolean; isDegraded?: boolean; onSubmit: (values: SystemConfiguration[]) => void; error?: string }`. Uses `useIntl` only; no router/HTTP/online imports (PRES-4). Manages local `useState<SystemConfiguration[]>` initialised from `initialValues`. Iterates entries, renders read-only label (`name`) + text input (`value`). Single submit button disabled when `!isOnline`. Inline error and degraded banner from props. 7 tests GREEN.
- [x] 2.3 VERIFY: Full suite 588 tests GREEN (576 + 5 W-1 + 7 W-2).

**Spec coverage**: PRES-1, PRES-2, PRES-3, PRES-4, PRES-5, PRES-6, SAVE-1 (emit shape), SAVE-3, SAVE-5, OFFLINE-3, OFFLINE-5

---

## Phase 3: Integration — Route Container + Wiring (W-3)

**Spec**: ACCESS-1..5, ROUTE-1..2, CONFIG-1..5, SAVE-1..4, OFFLINE-1..6, I18N-1..3, ERR-1..4, TEST-1..4, TEST-6 | **Design**: DC2, DC5, DC6, DC8

### 3a: i18n keys (add first — avoids typecheck failure during container build)

- [x] 3.1 I18N: Add `CONFIGURATIONS.*` block to `app/shared/lib/i18n/es.ts` with 10 keys: `TITLE`, `SAVE`, `SAVE_SUCCESS`, `OFFLINE_NOTICE`, `DEGRADED_NOTICE`, `EMPTY`, `VALUE_LABEL`, `NAME_LABEL`, `SAVE_ERROR`, `LOADING`. Added EARLY (before container build to avoid false-RED). Rioplatense wording matching `USERS.*` / `STORES.*` style.

### 3b: Container tests (RED first — DC5 LOADING gate is the critical invariant)

- [x] 3.2 RED: Create `app/management/configurations/routes/__tests__/configurations.test.tsx` with 13 cases (ACCESS:2, online:1, empty:1, offline+cache:1, offline+empty:1, LOADING gate:1, submit success:1, offline blocked:1, HTTP error:1, write-through cache:1, success indicator:1, DC3 full payload:1). Confirm RED.
- [x] 3.3 GREEN: Create `app/management/configurations/routes/configurations.tsx` — loader=adminFeatureLoader([EFeatures.Configurations]); LOADING gate DC5 (configs null until resolved); online: listConfigurations()+repo.save write-through; offline: repo.getAll+setDegraded; handleSubmit: online→updateConfigurations, offline→blocked. Named ConfigurationsPage + default export. No presentational markup. 13 tests GREEN.

### 3c: Route registration

- [x] 3.4 ROUTES: Add 1 route entry to `app/routes.ts` after the Users block: `route('management/configurations', 'management/configurations/routes/configurations.tsx')`. Compiles clean.

### 3d: Final verification

- [x] 3.5 VERIFY: Full test suite 601 tests GREEN (576 baseline + 5 W-1 + 7 W-2 + 13 W-3). Typecheck: `pnpm turbo run typecheck` → 5 tasks successful, 0 errors. DONE.

**Spec coverage**: ACCESS-1..5, ROUTE-1..2, CONFIG-1..5, SAVE-1..4, OFFLINE-1..5, I18N-1..3, ERR-1..4, TEST-1..4, TEST-6

---

## Dependency Order

```
1.1 (RED http-service test)
  → 1.2 (domain model — compile gate)
    → 1.3 (GREEN http-service)
      → 1.4 (suite verify 576)
        → 2.1 (RED form test)
          → 2.2 (GREEN ConfigurationsForm)
            → 2.3 (suite verify 583)
              → 3.1 (i18n keys — before container to pass typecheck)
                → 3.2 (RED container test)
                  → 3.3 (GREEN container)
                    → 3.4 (route wiring)
                      → 3.5 (final verify 597 + typecheck)
```

Strict sequential — each GREEN gate unlocks the next RED. No parallel tracks (single-dev, single-file dependencies).

---

## Test Delta Summary

| Work Unit | New Tests | Running Total |
|-----------|-----------|---------------|
| Baseline (before this change) | — | 576 |
| W-1 HTTP service | +4 | 580 |
| W-2 ConfigurationsForm | +7 | 587 |
| W-3 Container | +14 | 601 |

> Note: exact count depends on final test granularity. Target ≥ 595 (14 container + 7 form + 4 service added to 576 baseline).

---

## Harness Notes (mirror users precedent)

- Vitest + Testing Library (same as Stores/Users).
- Add `makeSystemConfiguration(overrides?)` factory alongside test file.
- Mock `configurationHttpService` module at `app/management/configurations/lib/services/configuration-http-service`.
- Mock `useOnlineStatus` from `app/shared/lib/hooks/use-online-status`.
- Mock `adminFeatureLoader` (return passthrough `loader` for authorised case, redirect for others).
- Mock `BaseRepository` with controllable `getAll` / `save` stubs.
- Wrap all renders in real `IntlProvider` with `es` messages.
- No real `navigator.onLine` dependency (TEST-6).
