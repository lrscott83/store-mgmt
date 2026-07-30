# Exploration: register-endpoint-contract-frontend

**Date**: 2026-07-30
**Scope**: `frontend-react/apps/web-store-pos` + `frontend-react/packages/*` ONLY. Backend is DONE, read-only source of truth.
**Branch**: `feat/register-endpoint-contract-frontend`. Commits-only, no PRs.
**strict_tdd**: true. Test: `pnpm test`. Typecheck: `pnpm typecheck`. Lint: `--max-warnings=0` across 4 packages.
**Artifact store**: hybrid — engram `sdd/register-endpoint-contract-frontend/explore` (obs 1688) + this file.

## Current State

### The `register()` call chain

`app/auth/routes/register.tsx:110` calls `authHttpService.register(...)`. On `succeeded: true` it does
**`navigate('/login')`** — it does NOT call `login()` afterwards.

This contradicts the impact doc's phrasing at face value: there is no "separate login call after
registration" to remove. The real opportunity is forward-looking — the new `authToken` makes it
*possible* to skip the forced re-login round trip, which is a UX decision, not a cleanup.

`guestOnlyLoader` in `app/auth/routes/loaders.ts` already handles "already authenticated →
`resolveUserHomePath` + redirect", so an auto-auth path would reuse that seam plus the sequence
`login.tsx` runs after success: `armTracking()` (line 124) and `preloadHeavyChunks()` (line 127).

### Contract facts, verified against backend source

- `AuthController.cs:83-101` — register carries `[EnableRateLimiting("RegisterPolicy")]`, returns
  `Created("/api/v1/auth/me", result)` → **201**, body `ResponseResult<AuthDto>`.
- `AuthController.cs:20-27` — login carries `[EnableRateLimiting("LoginPolicy")]`. Wrong credentials
  → 401, disabled user/store → 403.
- `Program.cs:113-140` — `LoginPolicy` = **5 req/min**; `RegisterPolicy` = **10 req/10 min**. Both
  reject with **429**.
- `Application/Dtos/Authentication/AuthDto.cs` —
  `record AuthDto(string Login, string AuthToken, DateTime ExpiresIn, string? RefreshToken = null, ...)`.
  `RegisterCommand.cs:132` builds it as `new AuthDto(request.Login, token, expiresAt)`, so
  **`RefreshToken` is always null on register**, and **`ExpiresIn` is a `DateTime`** — an ISO-8601
  string on the wire, not a number.
- Backend quirk, out of scope: register's failure `ActionCode`s are mostly 500 internally, but the
  controller's `_ => BadRequest` collapses every non-succeeded result to **HTTP 400**. Do not
  over-engineer frontend branching beyond 400 / 429.

### Frontend typing — stale, confirmed

- `app/shared/lib/http/auth-http-service.ts:18-36` — `register(): Promise<BaseResponseModel<boolean>>`.
  The request body is unaffected, matching the impact doc.
- `packages/domain/src/models/auth.ts` — no register-response type exists. `AuthModel` (used by
  `login()`) is `{ login, authToken, refreshToken: string (REQUIRED), expiresIn: number }`, which does
  **not** fit the register `AuthDto` (refreshToken absent, `expiresIn` a string). A new type is needed;
  reusing `AuthModel` as-is would be wrong.

### The `expiresIn` mismatch is already solved by precedent

`auth-store.ts` `login()` (~140-187) **already discards the backend's `ExpiresIn`** and stamps its own
`Date.now() + THIRTY_FIVE_DAYS_MS`, persisting `{ authToken, expiresIn }` as epoch ms to
`StorageKeys.AUTH_MODEL`. If register auto-authenticates through the same seam it follows the identical
pattern — no ISO-string parsing needed. The DateTime-vs-number divergence is pre-existing and resolved.

### Error surfacing — two different, uncentralized patterns

`app/shared/lib/http/api-client.ts` is a shared axios instance used by **13** http-service files. Its
response interceptor has exactly one status branch: `500` → blocking Swal. It deliberately does **not**
special-case 401 (offline-first sessions must survive one — see its comments at lines 49-53, 84-86).
There is no 429 handling anywhere; a grep across `apps/web-store-pos/app` and `packages` returns zero
references to the status.

- `login.tsx:129-156` reads `(err as {status?: number})?.status` — the axios `AxiosError.status`
  getter. Maps 401 → `AUTH.INVALID_CREDENTIALS`, 403 → `AUTH.ACCOUNT_INACTIVE`, else →
  `AUTH.SERVER_ERROR`.
- `register.tsx:124-138` reads `(err as {response?: {status: number}}).response?.status` — a
  **different** access pattern for the same problem. Maps 400 (+"email") → `REGISTRATION.EMAIL_TAKEN`,
  400 → `REGISTRATION.VALIDATION_ERROR`, else → `REGISTRATION.UNEXPECTED_ERROR`.

**Correction to the impact doc's addendum:** it claimed a rate-limited login "reads to the user as
wrong password". Verified behaviour is the `else` branch — `AUTH.SERVER_ERROR`, *"Algo salió mal.
Intentá de nuevo."* Still misleading, still worth fixing, but it is the generic server-error copy, not
the invalid-credentials one. Register falls to `REGISTRATION.UNEXPECTED_ERROR`.

No single status branch is shared between the two pages below 500. A 429 fix does **not** require
touching the shared interceptor.

### i18n

`AUTH.*` and `REGISTRATION.*` are flat sibling namespaces in `app/shared/lib/i18n/es.ts`, mirroring
Angular's `vocabs/es.ts`. Existing error keys: `AUTH.INVALID_CREDENTIALS`, `AUTH.ACCOUNT_INACTIVE`,
`AUTH.SERVER_ERROR`, `AUTH.INVALID_ERROR`; `REGISTRATION.EMAIL_TAKEN`, `REGISTRATION.VALIDATION_ERROR`,
`REGISTRATION.UNEXPECTED_ERROR`. A new key follows that convention.

### Tests — where the failing tests go first

- `app/shared/lib/http/__tests__/auth-http-service.test.ts` — asserts `typeof result.data === 'boolean'`
  (line 126); every mock is `data: true`. All of it flips.
- `app/auth/routes/__tests__/register.test.tsx` — the success test asserts `navigate('/login')`
  (line 103). This is the fork point for open decision 1.
- `app/auth/routes/__tests__/login.test.tsx` — models rejections as bare `{ status: 401 }` (line 155);
  a 429 test follows the identical shape.
- `app/shared/lib/http/__tests__/api-client.test.ts` — the template for interceptor-level tests, only
  needed if 429 detection is centralized.

## Affected Areas

| File | Change |
| --- | --- |
| `app/shared/lib/http/auth-http-service.ts:18` | `register()` return type |
| `app/auth/routes/register.tsx` | success branch + 429 in the catch |
| `app/auth/routes/login.tsx` | 429 in the catch |
| `packages/domain/src/models/auth.ts` | new register-response type |
| `app/shared/lib/i18n/es.ts` | new 429 key(s) |
| `app/shared/lib/http/api-client.ts` | only if centralizing |

Not affected: the nullable date fields (already compatible) and `roster-types.ts` `formatVersion`
(tracked separately in the at-rest encryption plan).

## Approaches

**1. Per-page local 429 branch.** Add `status === 429` to each page's existing catch.
*Pros:* zero blast radius, consistent with how 401/403/400 already work, smallest diff.
*Cons:* keeps the duplication — including the two different error-shape access patterns.
*Effort:* Low.

**2. Centralize in `api-client.ts` via a tag,** mirroring the existing `isNetworkError` tagging at lines
79-82: set `error.isRateLimited = true`, then each page checks the tag.
*Pros:* one source of truth, protects future rate-limited endpoints, reuses an in-file idiom.
*Cons:* touches the interceptor all 13 services share, for a problem currently scoped to 2 endpoints.
*Effort:* Low-Medium.

**Recommendation:** Approach 1. Approach 2 is worth raising in design as a cleanup, not a requirement.

## Open Decisions — NOT decided here

**1. Auto-authenticate after register?** Today the user registers and is bounced to `/login` to type
their credentials again. The `authToken` now makes it possible to hydrate the session directly and land
them on their home screen. Against it: this changes a well-tested flow, and "mirror Angular" is the
project's standing default — but Angular predates this backend contract entirely, so its
`register.component.ts` should be checked before assuming parity resolves it.

**2. One shared 429 i18n key, or two?** The policies differ materially — 5/min vs 10/10min. One generic
"too many attempts" key mis-states the wait for one of the two endpoints; two keys allow accurate copy
at the cost of a second string.

## Risks

- `register.test.tsx`'s success test asserts `navigate('/login')` — it changes whichever way decision 1
  goes. Under strict TDD it is the first failing test of that slice.
- `web-store-pos` imports `@store-mgmt/domain` from `dist/`, not source. A domain-only type change
  without `pnpm -C packages/domain build` will silently **not** surface as a typecheck failure.
- The two divergent error-shape access patterns are worth unifying while both files are open, though
  the contract change does not require it.

## Ready for Proposal

Yes — both open decisions need a call first.
