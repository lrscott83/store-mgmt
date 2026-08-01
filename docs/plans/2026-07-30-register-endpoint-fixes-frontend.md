# Register Endpoint Fixes — Frontend Impact

**Date**: 2026-07-30
**Backend change**: `register-endpoint-fixes`

## Contract Changes

### POST /api/v1/auth/register

| Before | After |
|--------|-------|
| HTTP 200 OK | HTTP 201 Created |
| `ResponseResult<bool>` | `ResponseResult<AuthDto>` |
| Body: `{ succeeded: true, data: true }` | Body: `{ succeeded: true, data: { login, authToken, expiresIn } }` |

### New AuthDto shape
```json
{
  "succeeded": true,
  "data": {
    "login": "string",
    "authToken": "string",
    "expiresIn": "2026-08-29T00:00:00Z"
  }
}
```

### Rate limiting
- 10 requests per 10 minutes per IP
- HTTP 429 Too Many Requests on exceeded limit

## Required Frontend Changes

1. Update response type for register endpoint from `boolean` to `AuthDto` —
   `app/shared/lib/http/auth-http-service.ts:18` still declares
   `Promise<BaseResponseModel<boolean>>`
2. Handle 201 Created status code (was 200 OK)
3. Extract `authToken` from register response (no longer need separate login call after registration)
4. Handle 429 rate-limit errors gracefully (show "Too many attempts, try later")

## No Changes Needed
- Request body format is unchanged

---

# Addendum — full backend contract audit (2026-07-30)

Added after auditing all three backend implementation plans against `backend/src`. The
document above covered `register` only; these are the rest of the contract changes that
landed with the same backend work.

## 1. Rate limiting also applies to LOGIN — not documented above

`AuthController.cs:27` carries `[EnableRateLimiting("LoginPolicy")]`. The policy in
`Program.cs:117` is **5 requests per minute per IP**, distinct from `RegisterPolicy`'s 10 per
10 minutes. `options.RejectionStatusCode` is 429 for both.

The frontend handles 429 nowhere — a grep across `apps/web-store-pos/app` and `packages`
returns no reference to the status.

**Corrected 2026-07-30 by the exploration**, which traced the actual branch: a rate-limited
login falls to the `else` in `login.tsx:129-156` and renders `AUTH.SERVER_ERROR` — *"Algo
salió mal. Intentá de nuevo."* Register falls to `REGISTRATION.UNEXPECTED_ERROR`. An earlier
version of this section said it would read as "wrong password"; that was wrong — 401 is what
maps to `AUTH.INVALID_CREDENTIALS`, and a 429 never reaches it. The user is still misled, just
by generic-failure copy rather than a credentials message, and five attempts per minute is
reachable by a person mistyping a password.

**Frontend work:** handle 429 on both `login` and `register`, with a distinct message.

## 2. Nullable date fields — already compatible, no work needed

Two DTOs became nullable as part of the F2 fix (`null` is now the domain model for "the
billing clock never started"):

| Endpoint | Field | Backend type | Frontend type | Verdict |
|---|---|---|---|---|
| `GET /auth/me` | `paymentDueDate` | `DateOnly?` | `string \| null` (`packages/domain/src/models/auth.ts:37`) | compatible |
| `GET /stores/to-collect` | `nextDueDate` | `DateOnly?` | `string \| null` (`packages/domain/src/models/store.ts:47`) | compatible |

Recorded so a future reader does not re-investigate: the frontend already modelled both as
nullable, so the backend change closed a mismatch rather than opening one.

## 3. Offline roster bundle is now `formatVersion: 2` with wrapped-DEK fields

`OfflineRosterUserDto` gained `wrappedDek`, `wrapSalt` and `wrapIv`, and the handler emits
`FormatVersion = 2`. The frontend's `app/shared/lib/offline/roster-types.ts` declares
`formatVersion: number` but none of the three wrap fields.

This is not new work created by this audit — it is the frontend half of at-rest encryption,
already tracked in `docs/plans/2026-07-25-at-rest-encryption-frontend-plan.md`. It is noted
here only because the backend side is now live, so the two sides are out of step in a way
they were not when that plan was written.

## 4. Still missing from the roster — a decision, not a contract change

`OfflineRosterUserDto` carries no `paymentDueDate` / `isInTrial` / `paymentStatus`. See §7b
of `docs/plans/2026-07-28-backend-pending-work.md`. Until it is decided, a store with an
expired plan shows no payment warning while operating offline.
