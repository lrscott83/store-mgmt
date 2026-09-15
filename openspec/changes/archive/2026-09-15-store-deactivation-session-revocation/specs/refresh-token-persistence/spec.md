# Delta for refresh-token-persistence

## MODIFIED Requirements

### Requirement: R4: Failure paths must not save

Handlers MUST NOT call `IApplicationUnitOfWork.SaveChangesAsync` when the command returns a **token-state** failure — a null, revoked, or expired refresh token — and none before staging. Exception (store-deactivation-session-revocation): when `RefreshCommandHandler` returns 401 because the token's owner fails an **activation-state** check (user inactive, selected store inactive, or owner inactive), the handler MUST stage revocation of the presented refresh token (`Revoke()` + `Update`) and call `SaveChangesAsync` so the revocation persists — the token must not survive its owner's deactivation.
(Previously: blanket no-save on every failure return.)

#### Scenario: Invalid refresh token fails without saving

- GIVEN a refresh token that is null, revoked, or expired
- WHEN `RefreshCommand` is handled with that token
- THEN the handler SHALL return failure
- AND SHALL NOT call `SaveChangesAsync`

#### Scenario: Activation-state failure revokes and saves

- GIVEN an active refresh token whose owner user is inactive
- WHEN `RefreshCommand` is handled with that token
- THEN the handler SHALL return 401
- AND SHALL stage `Revoke()` + `Update` on the presented token
- AND SHALL call `SaveChangesAsync` once, persisting the revocation
