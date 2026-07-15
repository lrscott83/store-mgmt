# HTTP Client — Response Interceptor Specification

## Purpose

Define React `apiClient`'s (axios) response-interceptor contract so it mirrors Angular's registered
`ErrorInterceptor` (`_interceptors/error-interceptor.service.ts`, wired `app.module.ts:97`) for the
3 behaviors it implements that React currently omits or contradicts: 401 delegation to session
logout, 500 error dialog, and network-error tagging. Closes the item auth-session spec explicitly
deferred ("401 axios interceptor reusing `logout()` — HTTP follow-up, not this slice").

## Requirements

### Requirement: 401 Response Delegates To Auth Store Logout

`apiClient`'s response interceptor MUST call `useAuthStore.getState().logout()` on HTTP 401,
instead of performing its own inline storage-clear and unconditional redirect. This restores
call-site parity with Angular's `case 401: authService?.logout()`
(`error-interceptor.service.ts:62-66`) and stops contradicting React's own Decision 1/2
(`auth-store.ts:184-197`: AUTH_MODEL-only clear, `token`/`currentUser` stay stale, redirect
skipped when already on `/login` or `/`).

**Rules**: 9 (exact error contract — 401 handling matches Angular's single `logout()` delegation,
not a divergent inline clear), 10 (call-site parity — same trigger condition, `status === 401`),
12 (no invention — reuses the existing `logout()` action, no new interceptor abstraction).

#### Scenario: 401 delegates to the session store
- GIVEN an authenticated request receives a 401 response
- WHEN the response interceptor handles the error
- THEN `useAuthStore.getState().logout()` is invoked
- AND the interceptor does NOT independently remove `token` or `currentUser` from storage
- AND the interceptor does NOT unconditionally set `window.location.href`

#### Scenario: Redirect-loop guard is preserved via logout()
- GIVEN the user is already on `/login` when a 401 arrives
- WHEN the interceptor delegates to `logout()`
- THEN no redundant redirect occurs (guard lives in `logout()`, not duplicated in the interceptor)

### Requirement: 500 Response Surfaces An Error Dialog

On HTTP 500, the response interceptor MUST trigger the existing React dialog idiom
(`blocking-alert.ts`) with a generic error title/message, mirroring Angular's
`Swal.fire({ icon: 'error', ... })` (`error-interceptor.service.ts:77-85`).

**Rules**: 9 (same trigger: `status === 500`), 10 (call-site parity: fires for every 500,
independent of caller), 12 (reuse `blocking-alert.ts`; no new dialog library/service).

#### Scenario: 500 shows a blocking error dialog
- GIVEN any request receives a 500 response
- WHEN the response interceptor handles the error
- THEN the existing `blocking-alert` dialog is shown with an error icon and generic error copy
- AND the original error is still rejected/re-thrown to the caller (interceptor does not swallow it)

### Requirement: Network Errors Are Tagged For The Global Error Path

Requests that fail with no HTTP response (timeout, connection refused, offline) MUST be tagged
with a network-error marker on the rejected error object, mirroring Angular's `isNetworkError`
flag (`error-interceptor.service.ts:53-59`) consumed by `GlobalErrorHandler`.

**Rules**: 9 (same detection condition: no response / timeout, not merely `status === 0`), 12 (tag
the existing axios error object; no new error class).

#### Scenario: Timeout is tagged as a network error
- GIVEN a request exceeds the client timeout with no server response
- WHEN the response interceptor handles the rejection
- THEN the rejected error carries a network-error marker (e.g. `isNetworkError: true`)

#### Scenario: 401/500 are not mistagged as network errors
- GIVEN a request receives an HTTP 401 or 500 response
- WHEN the response interceptor handles it
- THEN the error is NOT tagged as a network error (it has an HTTP response)

## Non-Requirements

- 403 and 404 MUST continue to pass through unchanged (Angular re-throws both with no side effect;
  no dialog, no logout) — do not add new handling for these codes.
- MUST NOT introduce a new interceptor/service class; extend the existing `apiClient.interceptors.response.use` handler in `shared/lib/http/api-client.ts`.

## Known Divergence (non-blocking, ratified)

Angular's network-error branch discards the original error and re-throws a brand-new
`Error(err.message)` with only `isNetworkError` attached, losing HTTP metadata. React instead
tags `isNetworkError` directly onto the original axios error object, preserving more information.
Functionally equivalent for the one confirmed consumer pattern (checking `err.isNetworkError`);
not a byte-identical envelope per rule 9's strict language, but no live consumer currently depends
on the stricter Angular shape. Low risk, does not block. (Verify report WARNING-2, 2026-07-15.)
