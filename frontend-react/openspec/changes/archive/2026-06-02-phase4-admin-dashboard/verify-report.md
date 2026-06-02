# Verification Report: admin-dashboard — Admin Dashboard (SuperAdmin Store Stats)

**Change:** admin-dashboard
**Phase:** Verify
**Verdict:** PASS WITH WARNINGS
**Date:** 2026-06-02
**Mode:** Hybrid (engram + openspec file)
**Commit:** 8de394b
**Branch:** feat/phase4-admin-dashboard (local only, not pushed)
**Strict TDD:** Active

---

## Build / Test Evidence

| Check | Result | Detail |
|-------|--------|--------|
| `pnpm test` | PASS | 623 tests, 61 files — zero failures, zero regressions |
| Baseline delta | +15 tests, +2 files | Baseline was 608/59 |
| `tsc --noEmit` | PASS | Zero errors |
| AI attribution in commit | ABSENT | Conventional commit, no Co-Authored-By |
| Branch pushed to remote | NO | Local only — confirmed |

---

## Task Completeness

All 9 tasks (1.1→1.2→2.1→2.2→3.1→4.1→4.2→5.1→6.1+6.2) marked [x] in tasks.md. Verified
against apply-progress artifact and commit content.

---

## Spec Compliance Matrix

### ADMIN-DASHBOARD-ROUTE
| Scenario | Implementation | Test | Status |
|----------|----------------|------|--------|
| Route registered | `route('admin/dashboard', ...)` in routes.ts line 67 | typecheck | PASS |

### ADMIN-DASHBOARD-ACCESS
| Scenario | Implementation | Test | Status |
|----------|----------------|------|--------|
| ACCESS-1: SuperAdmin reaches page | `export const loader = superAdminLoader` | loaders.test.ts — returns null for SuperAdmin | PASS |
| ACCESS-2: OwnerAdmin blocked | Same (delegates to superAdminLoader) | loaders.test.ts — redirects OwnerAdmin to /unauthorized | PASS |
| ACCESS-3: Unauthenticated redirected | Same | loaders.test.ts — redirects unauthenticated to /login | PASS |

### ADMIN-DASHBOARD-HTTP
| Scenario | Implementation | Test | Status |
|----------|----------------|------|--------|
| HTTP-1: singleton exists | `usageHttpService` exported object | HTTP-1 describe | PASS |
| HTTP-2: getStoresLastWeek GET endpoint | `apiClient.get('/v1/usages/stores-last-week')` | HTTP-2: URL assertion + response.data unwrapping | PASS |
| HTTP-3: getStoresLastMonth GET endpoint | `apiClient.get('/v1/usages/stores-last-month')` | **Test labeled HTTP-3 only covers throw path; URL assertion and happy-path UNTESTED at unit level** | WARNING |
| HTTP-3 alt: Dead helpers absent | Not present | Verified by grep; no runtime assertion | PASS (structural) |

### ADMIN-DASHBOARD-PAGE
| Scenario | Implementation | Test | Status |
|----------|----------------|------|--------|
| PAGE-1: render header/title/buttons | h1, h2, 2 buttons in JSX | "render" describe — getByText + getByRole | PASS |
| PAGE-2: default 7-day fetch on mount | `useEffect → loadData('7days')` | "7-day fetch on mount" — `getStoresLastWeek` called once | PASS |
| PAGE-3 (toggle TO 30 days) | button click → `loadData('30days')` | "30-day toggle" — `getStoresLastMonth` called, '30' labels appear | PASS |
| PAGE-3 (toggle BACK to 7 days) | button handler calls `loadData('7days')` | **No test exercises toggle back from 30→7** | WARNING |
| PAGE-4: value fallback (data[i]\|\|0) | `{data[i] \|\| 0}` line 87 | **Implemented but UNTESTED — no shorter-array test** | WARNING |
| PAGE-5: getDiasSemana Sunday edge | `diaHoy===0?6` | "Sunday edge" describe — injected Date, ends 'Dom' | PASS |
| PAGE-6: No chart, activeStoreCount not in DOM | No chart import; activeStoreCount absent from JSX | "activeStoreCount not rendered" (9999 sentinel); chart by grep | PASS |

### ADMIN-DASHBOARD-I18N
| Check | Status |
|-------|--------|
| 7 keys added to es.ts (lines 374–380) | PASS |
| en.ts untouched | PASS |

### Non-Goals
| Non-Goal | Status |
|----------|--------|
| No ApexCharts / recharts | PASS |
| activeStoreCount NOT rendered | PASS |
| Dead Angular helpers NOT ported | PASS |
| en.ts NOT modified | PASS |

---

## Day-Label Algorithm Correctness

Independently verified via Node.js against the Angular-parity algorithm:

| Input | Result | Expected | Match |
|-------|--------|----------|-------|
| Sunday 2026-06-07 | `['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']` | same | YES |
| Monday 2026-06-01 | `['Mar','Mié','Jue','Vie','Sáb','Dom','Lun']` | same | YES |
| Tuesday 2026-06-02 | `['Mié','Jue','Vie','Sáb','Dom','Lun','Mar']` | same | YES |

---

## Issues

### WARNINGS (3)

**W-1 — getStoresLastMonth unit contract partially uncovered**
The describe block labeled HTTP-3 tests only the throw path. No unit test asserts that
`getStoresLastMonth` calls `apiClient.get` with `/v1/usages/stores-last-month` and unwraps
`response.data`. The method is correctly implemented; the gap is test coverage only.

**W-2 — Toggle back to 7 days (PAGE-3) UNTESTED**
Spec S-ADMIN-DASHBOARD-PAGE-3 requires testing the 30→7 toggle. The implementation supports it
(button handler calls `loadData('7days')`), but no test exercises the path.

**W-3 — value||0 fallback (PAGE-4) UNTESTED**
`data[i] || 0` is implemented on line 87. The spec requires a test passing a shorter
`storeUsagesCountDays` array. No such test exists.

### SUGGESTIONS (1)

**S-1 — Mislabeled HTTP-3 describe**
The describe title says "GET /v1/usages/stores-last-month" but the test only covers the throw
path. Renaming it and adding the happy-path URL assertion would close W-1.

---

## Final Verdict: PASS WITH WARNINGS

- 623 tests pass, typecheck clean, branch local only.
- 3 warnings = missing coverage for correctly implemented behaviors; no behavioral bugs.
- Non-goals honored. Day-label algorithm matches spec verbatim.
- Not blocking archive.
