# Tasks: admin-dashboard — Admin Dashboard (SuperAdmin Store Stats)

**Change:** admin-dashboard
**Phase:** Tasks
**Status:** Done
**Date:** 2026-06-02
**Mode:** Hybrid (engram + openspec file)
**TDD:** Strict — RED first, then GREEN per unit
**Test runner:** `pnpm test` (vitest via turbo)
**Typecheck:** `pnpm -C apps/web-store-pos exec tsc --noEmit`

---

## Review Workload Forecast

| Metric | Value |
|--------|-------|
| Files created | 4 |
| Files modified | 2 |
| Estimated changed lines (tests + impl + wiring) | ~280–320 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Delivery strategy | ask-on-risk → single work unit, proceed without chaining |
| Decision needed before apply | No — well under 400 lines, additive slice only |

---

## Phase 1 — HTTP Service (ADMIN-DASHBOARD-HTTP)

### Task 1.1 — RED: Write failing service tests
- [x] Done — `usage-http-service.test.ts` written (RED), then passed GREEN after 1.2

### Task 1.2 — GREEN: Implement `usage-http-service.ts`
- [x] Done — 4 tests passing (HTTP-1, HTTP-2, HTTP-3)

---

## Phase 2 — Day-Label Helpers (ADMIN-DASHBOARD-PAGE pure helpers)

### Task 2.1 — RED: Write failing helper tests
- [x] Done — `dashboard.test.tsx` written with getDiasSemana and getDias30 tests (RED)

### Task 2.2 — GREEN: Implement pure helpers inside `dashboard.tsx`
- [x] Done — both helpers implemented and tested

---

## Phase 3 — i18n Keys (ADMIN-DASHBOARD-I18N)

### Task 3.1 — Add ADMIN_DASHBOARD keys to es.ts
- [x] Done — 7 ADMIN_DASHBOARD.* keys added to `es.ts` after `// Admin — Features` block

---

## Phase 4 — Container Component (ADMIN-DASHBOARD-PAGE, ADMIN-DASHBOARD-ACCESS)

### Task 4.1 — RED: Write failing component tests
- [x] Done — ACCESS-1..3, PAGE-1..6 test describes written (RED)

### Task 4.2 — GREEN: Implement `AdminDashboardPage` component
- [x] Done — all 11 tests passing in dashboard.test.tsx

---

## Phase 5 — Route Wiring (ADMIN-DASHBOARD-ROUTE)

### Task 5.1 — Add route to routes.ts
- [x] Done — `route('admin/dashboard', 'admin/dashboard/routes/dashboard.tsx')` added after Admin — Stores block

---

## Phase 6 — Full Suite Verification

### Task 6.1 — Run full test suite
- [x] Done — 623 tests passing (61 files), baseline was 608 (59 files), +15 new tests, zero regressions

### Task 6.2 — Typecheck
- [x] Done — `pnpm -C apps/web-store-pos exec tsc --noEmit` → zero errors

---

## Task Dependency Graph

```
1.1 (RED service) → 1.2 (GREEN service)
                                        → 2.1 (RED helpers) → 2.2 (GREEN helpers)
3.1 (i18n) ──────────────────────────────────────────────────────────────↓
                                                          → 4.1 (RED component) → 4.2 (GREEN component)
                                                                                          → 5.1 (route wiring)
                                                                                                  → 6.1 + 6.2
```

3.1 can start in parallel with Phase 2. All other tasks are sequential within their phase.

---

## File Map

| Action | Path |
|--------|------|
| CREATE | `apps/web-store-pos/app/admin/dashboard/lib/services/__tests__/usage-http-service.test.ts` |
| CREATE | `apps/web-store-pos/app/admin/dashboard/lib/services/usage-http-service.ts` |
| CREATE | `apps/web-store-pos/app/admin/dashboard/routes/__tests__/dashboard.test.tsx` |
| CREATE | `apps/web-store-pos/app/admin/dashboard/routes/dashboard.tsx` |
| MODIFY | `apps/web-store-pos/app/shared/lib/i18n/es.ts` |
| MODIFY | `apps/web-store-pos/app/routes.ts` |

---

## Spec Coverage

| Req ID | Task(s) |
|--------|---------|
| ADMIN-DASHBOARD-ROUTE | 5.1 |
| ADMIN-DASHBOARD-ACCESS | 4.1 (RED), 4.2 (GREEN) |
| ADMIN-DASHBOARD-HTTP | 1.1 (RED), 1.2 (GREEN) |
| ADMIN-DASHBOARD-PAGE | 2.1 (RED helpers), 2.2 (GREEN helpers), 4.1 (RED component), 4.2 (GREEN component) |
| ADMIN-DASHBOARD-I18N | 3.1 |
| ADMIN-DASHBOARD-TEST | 1.1, 2.1, 4.1, 6.1, 6.2 |
| ADMIN-DASHBOARD-NGOAL-1..5 | Explicitly excluded — no chart, no activeStoreCount render, no dead helpers, no new deps |
