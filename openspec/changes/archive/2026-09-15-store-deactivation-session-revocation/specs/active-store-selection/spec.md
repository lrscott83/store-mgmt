# Delta for active-store-selection

## MODIFIED Requirements

### Requirement: Deactivation Logs Out Store Users Passively

When a store transitions `IsActive` true→false, the system MUST actively revoke
affected users' refresh tokens (see `store-deactivation-session-revocation`
spec) AND the passive `/me` verdict (404 `Store.Inactive`) remains in force as
defense-in-depth on any surviving access token. LOGIN remains blocked for
owners with no active store (`AuthenticationService.HasActiveStore`).
(Previously: the system MUST NOT add active session-invalidation
infrastructure; sessions died only by the passive `/me` verdict — user
decision 2026-09-11, superseded by the user's 2026-09-14 request and approved
4-point plan.)

#### Scenario: Store user of deactivated store dies on next /me

- GIVEN a store user with an active session on store Alpha when Alpha is
  deactivated
- WHEN any session refresh or natural `/me` fires
- THEN the response is 404 `Store.Inactive` and the frontend logs out

#### Scenario: Refresh token dies at deactivation time

- GIVEN the same store user holds an active refresh token
- WHEN Alpha is deactivated
- THEN the refresh token is revoked in the same transaction
- AND any later `POST /v1/auth/refresh` with it returns 401

#### Scenario: No store-keyed blacklist infrastructure

- WHEN a store is deactivated
- THEN no token blacklist write keyed by store occurs (blacklist remains
  per-jti, written only by GetMeQuery's own verdict paths: inactive-user,
  inactive-store, inactive-owner)
