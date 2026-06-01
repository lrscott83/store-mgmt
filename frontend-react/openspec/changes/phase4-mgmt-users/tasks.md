# Tasks: phase4-mgmt-users (Users sub-domain)

**Change**: phase4-mgmt-users
**Phase**: Tasks
**Status**: Complete
**Date**: 2026-06-01
**Mode**: Hybrid (engram + openspec file)
**Reads**: spec #219, design #218

## Baseline test count

**Declared baseline: 515** (phase4-mgmt-stores final). All pre-existing tests must stay GREEN.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,050–1,150 LOC (additions + deletions) |
| Number of files touched | ~20 new + 2 modified |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Units 1–4) → PR 2 (Units 5–7) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `userHttpService` — 7 HTTP contracts | PR 1 | Base = feat/phase4-mgmt-users; no UI deps |
| 2 | `UserCreateForm` presentational | PR 1 | Password regex + confirm validation |
| 3 | `UserDetailsForm` presentational | PR 1 | isActive role-conditional toggle |
| 4 | `UserCredentialsForm` presentational | PR 1 | oldPassword required; no login field |
| 5 | `UserList` presentational | PR 2 | Base = PR 1 branch; degraded + empty-state |
| 6 | Route containers (3) + integration tests | PR 2 | UserEditPage: 2 independent sub-forms |
| 7 | Wire `app/routes.ts` + `es.ts` | PR 2 | 27 USERS.* keys; 3 routes with :id/edit shape |

PR 1 estimated: ~560 LOC (Units 1–4). PR 2 estimated: ~540 LOC (Units 5–7).
Both slices exceed 400 lines individually; a 3-PR split is also viable (see risks section).

---

## Phase 1: Foundation — HTTP Service (Unit 1)

- [x] 1.1 RED: Create `app/management/users/lib/services/__tests__/user-http-service.test.ts` — 8 cases: `listUsers` (GET /v1/storeusers/list/true), `getUser` (GET /v1/storeusers/:id), `createUser` (POST /v1/storeusers, body has roleIds:[3]), `updateUserDetails` (PUT /v1/users/:id, body includes isActive), `activateUser` (POST /v1/users/activate, body {id, isActive:true}), `deactivateUser` (DELETE /v1/users/:id), `changePassword` (POST /v1/users/change-password/:id, body {oldPassword,newPassword}), `.data` unwrap for each; assert path is `/storeusers/list/true` NOT `/users/all/true`. Confirm RED.
- [x] 1.2 GREEN: Create `app/management/users/lib/services/user-http-service.ts` — singleton wrapping `apiClient`, all 7 methods, returns unwrapped `.data`. No own Axios instance. Confirm GREEN (13 tests).
- [x] 1.3 VERIFY: Existing 515 tests still passing.

**Spec coverage**: HTTP-1..8, CRED-1..3, TEST-8

---

## Phase 2: Core Implementation — Presentational Components (Units 2–5)

### Unit 2 — UserCreateForm

- [x] 2.1 RED: Create `app/management/users/components/__tests__/user-create-form.test.tsx` — 7 cases. Confirm RED.
- [x] 2.2 GREEN: Create `app/management/users/components/UserCreateForm.tsx`. Confirm GREEN (7 tests).

**Spec coverage**: PRES-4, PRES-5, PRES-8, PRES-9, PRES-10, CREATE-4

### Unit 3 — UserDetailsForm

- [x] 3.1 RED: Create `app/management/users/components/__tests__/user-details-form.test.tsx` — 6 cases. Confirm RED.
- [x] 3.2 GREEN: Create `app/management/users/components/UserDetailsForm.tsx`. Confirm GREEN (6 tests).

**Spec coverage**: PRES-6, PRES-8, PRES-9, EDIT-3, EDIT-5

### Unit 4 — UserCredentialsForm

- [x] 4.1 RED: Create `app/management/users/components/__tests__/user-credentials-form.test.tsx` — 5 cases. Confirm RED.
- [x] 4.2 GREEN: Create `app/management/users/components/UserCredentialsForm.tsx`. Confirm GREEN (5 tests).

**Spec coverage**: PRES-7, PRES-8, PRES-9, CRED-1, CRED-2, CRED-3, EDIT-6

### Unit 5 — UserList

- [x] 5.1 RED: Create `app/management/users/components/__tests__/user-list.test.tsx` — 9 cases (spec says 7, actual 9 for full coverage). Confirm RED.
- [x] 5.2 GREEN: Create `app/management/users/components/UserList.tsx`. Confirm GREEN (9 tests).

**Spec coverage**: PRES-1, PRES-2, PRES-3, PRES-8, LIST-4, LIST-5

---

## Phase 3: Integration — Route Containers (Unit 6)

- [x] 6.1 RED: Create `app/management/users/routes/__tests__/user-routes.test.tsx` — 20 cases. Confirm RED.
- [x] 6.2 GREEN: Create `app/management/users/routes/user-list.tsx` — `UserListPage`.
- [x] 6.3 GREEN: Create `app/management/users/routes/user-create.tsx` — `UserCreatePage`.
- [x] 6.4 GREEN: Create `app/management/users/routes/user-edit.tsx` — `UserEditPage` (2 stacked sub-forms).
- [x] 6.5 VERIFY: All 20 new cases GREEN; baseline + new = 575 tests passing.

**Spec coverage**: LIST-1..6, CREATE-1..7, EDIT-1..8, ACCESS-1..5, ROUTE-1..4, OFFLINE-1..5, ERR-1..6, TEST-1..7

---

## Phase 4: Wiring — Routes + i18n (Unit 7)

- [x] 7.1 I18N: Added 27+ USERS.* keys to `app/shared/lib/i18n/es.ts` (done first to prevent false-RED).
- [x] 7.2 ROUTES: Added 3 entries to `app/routes.ts` after the Stores block — `management/users`, `management/users/create`, `management/users/:id/edit`.
- [x] 7.3 VERIFY: Full suite 575 tests GREEN; `tsc --noEmit` clean; typecheck passes.

**Spec coverage**: I18N-1..4, ROUTE-1..4, ROUTE shape `/management/users/:id/edit`

---

## Route Shape Note (CRITICAL)

`/management/users/:id/edit` — the `:id` param precedes `/edit`. This differs from Stores' `/management/stores/edit/:id`. Route test in 6.1 MUST assert this shape explicitly to catch regression.

---

## Parallel vs Sequential

```
Phase 1 (Unit 1)  ──────────────────────────────────┐
Phase 2 (Units 2,3,4 PARALLEL after Unit 1 GREEN)  ──┤
Phase 2 (Unit 5 after Unit 2-4 GREEN)               ─┤
Phase 3 (Unit 6 needs all components GREEN)          ─┤
Phase 4 (Unit 7 after containers GREEN)  ────────────┘
```

Units 2, 3, 4 CAN be implemented in parallel (no inter-dependency). Unit 5 (UserList) has no hard dep on forms but can proceed in parallel with Units 2-4. Unit 6 requires all components from Phase 2. Unit 7 requires Unit 6.

---

## Spec Traceability

| Req group | Tasks |
|-----------|-------|
| HTTP-1..8, CRED-1..3 | 1.1, 1.2 |
| PRES-4,5,8,9,10 / CREATE-4 | 2.1, 2.2 |
| PRES-6,8,9 / EDIT-3,5 | 3.1, 3.2 |
| PRES-7,8,9 / CRED-1..3 / EDIT-6 | 4.1, 4.2 |
| PRES-1..3,8 / LIST-4,5 | 5.1, 5.2 |
| LIST-1..6, CREATE-1..7, EDIT-1..8, ACCESS-1..5, ROUTE-1..4, OFFLINE-1..5, ERR-1..6, TEST-1..7 | 6.1..6.5 |
| I18N-1..4, ROUTE-1..4 | 7.1, 7.2, 7.3 |

---

## Where

File: frontend-react/openspec/changes/phase4-mgmt-users/tasks.md
Engram: topic_key `sdd/phase4-mgmt-users/tasks`
Project: store-mgmt
