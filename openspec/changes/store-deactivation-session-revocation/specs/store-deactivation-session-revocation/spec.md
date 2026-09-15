# store-deactivation-session-revocation Specification

**Capability**: store-deactivation-session-revocation — active session kill on store deactivation
**Status**: Active

## Purpose

Contract for revoking sessions when a store is deactivated: the deactivation act itself revokes affected users' refresh tokens; the refresh endpoint enforces user/store/owner activation state; `/me` blacklists the caller's access token on store/owner-inactive verdicts. Passive `/me` 404 remains as defense-in-depth.

## Requirements

### Requirement: Deactivation Revokes Affected Users' Refresh Tokens

When a store transitions `IsActive` true→false via `SetStoreActivation`, `DeactivateStore`, or `UpdateStore` (SuperAdmin `IsActive`), the system MUST revoke all active refresh tokens of the affected user set, in the same persistence transaction as the flag flip. The affected set MUST be `users with SelectedStoreId == X` UNION `users employed at X (StoreUser rows)`.

#### Scenario: Only active store deactivated

- GIVEN an owner with one active store X, logged-in store users on X, and their active refresh tokens
- WHEN X is deactivated
- THEN every affected user's active refresh tokens are revoked
- AND subsequent `POST /v1/auth/refresh` with those tokens returns 401

#### Scenario: Non-last store isolation

- GIVEN stores X and Y (both active) with users logged in on each
- WHEN X is deactivated
- THEN only X's affected users have their refresh tokens revoked
- AND Y's users' refresh succeeds

#### Scenario: Idempotent same-value flip does not revoke

- GIVEN store X already inactive
- WHEN a deactivation command sets `IsActive=false` again (same-value PUT)
- THEN no revocation pass runs (A-13 idempotency preserved)

#### Scenario: Reactivation does not resurrect tokens

- GIVEN X reactivated after a prior deactivation revoked its users' tokens
- WHEN an affected user presents the revoked refresh token
- THEN refresh returns 401; the user MUST log in again

### Requirement: Refresh Enforces Activation State

`POST /v1/auth/refresh` MUST validate, after token-state checks: user `IsActive`, selected store `IsActive` (when `SelectedStoreId` is set), and owner `IsActive` (when the user belongs to an owner). Any failure MUST return 401 and revoke the presented refresh token.

#### Scenario: Inactive store refresh rejected

- GIVEN a user with a non-revoked refresh token whose selected store just became inactive
- WHEN the refresh token is presented
- THEN the response is 401 and the token is revoked

#### Scenario: Inactive user refresh rejected

- GIVEN an inactive user with a non-revoked refresh token
- WHEN the token is presented
- THEN the response is 401 and the token is revoked

#### Scenario: Active path unaffected

- GIVEN an active user on an active store with a valid refresh token
- WHEN the token is presented
- THEN refresh succeeds and rotates normally (R2 rotation contract intact)

### Requirement: /me Blacklists on Store/Owner-Inactive Verdicts

On the store-inactive and owner-inactive branches, `GetMeQuery` MUST blacklist the caller's access-token jti (same per-jti mechanism as the user-inactive branch) before returning 404. First call: 404 with the same error codes; subsequent calls with the same token: 401 from middleware.

#### Scenario: Second /me call after store-inactive verdict

- GIVEN a user whose selected store was deactivated
- WHEN `/v1/auth/me` is called twice with the same access token
- THEN the first call returns 404 `Store.Inactive`
- AND the second call returns 401 (blacklisted jti)

#### Scenario: Owner-inactive parity

- GIVEN a user whose owner was deactivated
- WHEN `/v1/auth/me` is called twice with the same token
- THEN the first returns 404 `Owner.Inactive`, the second 401

### Requirement: Deactivation Blast Radius Boundary

The revocation set MUST include the owner's own user when `SelectedStoreId == X`, and MUST NOT include: users of other stores, users whose `SelectedStoreId` points elsewhere but are employed at X (their session store is elsewhere), or offline roster sessions (non-revocable until roster expiry — documented limitation).

#### Scenario: Owner self-revocation on only store

- GIVEN an owner whose `SelectedStoreId` is their only (active) store X
- WHEN X is deactivated
- THEN the owner's own refresh tokens are revoked (consistent with A-04 lockout)

#### Scenario: Offline users out of scope

- GIVEN an offline roster session for a user of X
- WHEN X is deactivated
- THEN the offline session is unaffected until roster expiry (documented limitation, not a defect)
