# Delta for plan-frontend: Change-Password Contract Plan Doc

**Domain**: `plan-frontend` — `docs/plans/2026-08-02-change-password-contract-frontend.md` (new deliverable, D12)
**Change**: `change-password-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## ADDED Requirements

### Requirement: PF-CPW1 — Plan Doc Created With Contract BEFORE vs AFTER

A new file `docs/plans/2026-08-02-change-password-contract-frontend.md` MUST be created (name pattern `YYYY-MM-DD-<endpoint>-contract-frontend.md`, mirroring `2026-07-30-register-endpoint-fixes-frontend.md` structure). It MUST document the contract change with a BEFORE/AFTER table: route (`POST /api/v1/users/change-password` + body `UserId` → `POST /api/v1/users/change-password/{id}` + password-only body), response envelope, and the real status codes 400/401/403/404 (previously HTTP 200 always).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | File exists | Apply completes | `docs/plans/` inspected | File `2026-08-02-change-password-contract-frontend.md` present |
| 1b | BEFORE/AFTER table | Plan doc read | Route section inspected | Body-UserId route vs `{id}` route documented |
| 1c | Status codes | Plan doc read | Failure section inspected | 400/401/403/404 real statuses documented |

### Requirement: PF-CPW2 — Affected Frontend Consumers Documented

The plan doc MUST list the consumers: Angular `frontend/src/app/_services/user/user.service.ts:65-66` (`changePassword` already calls `change-password/${id}`) and React `frontend-react/apps/web-store-pos/app/profile/lib/services/profile-http-service.ts:28-37` (already calls `/v1/users/change-password/${userId}`). It MUST note that the React admin reset was REMOVED — the React consumer is self-service profile only (no admin changePassword path to update).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Angular consumer | Plan doc read | Consumers section | `user.service.ts` changePassword listed with `{id}` URL |
| 2b | React consumer | Plan doc read | Consumers section | `profile-http-service.ts` listed; admin reset marked REMOVED |

### Requirement: PF-CPW3 — Frontend Tasks Specified

The plan doc MUST specify frontend tasks: (1) handle real 4xx WITHOUT logging out — React `change-password.tsx:24-31` currently calls `logout()` on ANY resolved response; with real 4xx the failure lands in the `catch` and MUST show `PROFILE.UPDATE_ERROR` instead of logging out; (2) verify the request URL uses `{id}` (route param) in both frontends; (3) update frontend tests — React `profile-http-service.test.ts:82` asserts `POST /v1/users/change-password/u1` (kept, but verified against the new contract) and any test asserting the old body-`UserId` shape.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | No logout on 4xx | Wrong old password; backend returns real 400 | React `change-password.tsx` handles | Error shown; `logout()` NOT called |
| 3b | URL has `{id}` | Both frontends send change-password | Request inspected | URL `change-password/{id}`; body password-only |
| 3c | Tests updated | React test file edited | `profile-http-service.test.ts` run | Asserts `POST /v1/users/change-password/u1` (new contract) |

### Requirement: PF-CPW4 — Verification Criteria Stated

The plan doc MUST include verification criteria: frontends reach the endpoint with `{id}`; wrong-old-password shows an inline error and the session survives; success still logs out per the product decision (password change forces re-auth); frontend unit tests pass.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Criteria present | Plan doc read | Verification section | Reachability, error-handling, logout-on-success, test criteria listed |

## Verification Criteria

- [ ] `docs/plans/2026-08-02-change-password-contract-frontend.md` exists with BEFORE/AFTER contract, consumers, tasks, verification criteria
- [ ] Mirrors the register plan-frontend precedent structure
- [ ] Frontend executes its own work from this doc (out of scope here — D5)
