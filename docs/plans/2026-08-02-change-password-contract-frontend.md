# Change-Password Contract — Frontend Impact

**Date**: 2026-08-02
**Backend change**: `change-password-endpoint-fixes`

## Contract Changes

### POST /api/v1/users/change-password → POST /api/v1/users/change-password/{id}

| Before | After |
|--------|-------|
| Route `POST /api/v1/users/change-password` (no id) | Route `POST /api/v1/users/change-password/{id}` (id from route) |
| Body: `{ userId, oldPassword, newPassword }` | Body: `{ oldPassword, newPassword }` (password-only; `command.UserId = id`) |
| HTTP 200 always (business errors as `succeeded: false` envelope) | Real status codes: 200 / 400 / 401 / 403 / 404 |
| Handler compared hashed values (never matched — random salt) | Handler uses `VerifyPassword` (BCrypt + legacy SHA256 fallback) |
| Admin reset had no tenant-scope check (cross-tenant IDOR) | Admin branch scoped to own tenant (SuperAdmin bypasses) |

### Real status codes

| Code | Meaning |
|------|---------|
| 200 | Password changed |
| 400 | Weak new password / wrong old password / invalid body |
| 401 | Unauthenticated |
| 403 | Authenticated but lacking `ProfileAdmin` permission (filter-level) |
| 404 | User not found, or cross-tenant admin reset (anti-enumeration) |

## Affected Frontend Consumers

- **Angular**: `frontend/src/app/_services/user/user.service.ts:65-66` — `changePassword(id, oldPassword, newPassword)` already calls `change-password/${id}`. Caller: `frontend/src/app/presentation/users/edit-user-credentials/edit-user-credentials.component.ts:48,60-68` (admin reset UI — reads `response.succeeded` / `response.errors[0].description`).
- **React**: `frontend-react/apps/web-store-pos/app/profile/lib/services/profile-http-service.ts:28-37` — `changePassword(userId, payload)` already calls `/v1/users/change-password/${userId}`. Caller: `frontend-react/apps/web-store-pos/app/profile/routes/change-password.tsx:24-31` (self-service profile only).
- **React admin reset**: REMOVED — the React consumer is self-service profile only; there is no React admin changePassword path to update.

## Frontend Tasks

1. **Handle real 4xx WITHOUT logging out** — React `change-password.tsx:24-31` currently calls `logout()` on ANY resolved response (it sat inside the `try` after `await changePassword(...)`). With the new contract a 400/401/403/404 REJECTS the axios promise, so the failure lands in the `catch` — which already shows `PROFILE.UPDATE_ERROR` and never calls `logout()`. Verify this path stays correct (error shown, session survives).
2. **Verify `{id}` request URL in both frontends** — Angular `user.service.ts:66` (`change-password/${id}`) and React `profile-http-service.ts:33` (`/v1/users/change-password/${userId}`) both already send the id in the route; confirm neither sends `userId` in the body anymore.
3. **Update frontend tests** — React `profile-http-service.test.ts:82` already asserts `POST /v1/users/change-password/u1` with password-only body (kept, verified against the new contract). Remove any test asserting the old body-`UserId` shape (none found).
4. **Angular error surfacing (verify)** — `edit-user-credentials.component.ts:48-68` reads `response.succeeded` and `response.errors[0].description`. With real 4xx statuses, Angular's `HttpClient` throws, so failures land in `catchError` (`resolve(false)` — no message shown). Consider surfacing the backend error description on 4xx for parity; the `succeeded` path still covers 200.

## No Changes Needed

- Request body field names (`oldPassword`, `newPassword`) are unchanged
- Both frontend service URLs already use the `{id}` route shape (backend change aligns the contract TO them, not the reverse)
- React test suite already asserts the new contract

## Verification Criteria

- Both frontends reach the endpoint with `{id}` in the URL and password-only body (no 404 at routing)
- Wrong old password → inline error shown (React `PROFILE.UPDATE_ERROR`), user session survives (no `logout()`)
- Success still logs out per the product decision (password change forces re-auth)
- Frontend unit tests pass (React `profile-http-service.test.ts` asserts `POST /v1/users/change-password/u1`)

---
