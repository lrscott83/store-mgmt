# refresh-token-persistence Capability Specification

**Capability**: refresh-token-persistence — explicit `IApplicationUnitOfWork` persistence for the auth refresh-token cluster (Login/Refresh/Revoke handlers)
**Origin**: SDD change `fix-refresh-token-persistence`
**Status**: Active
**Last Updated**: 2026-08-06

## Purpose

The auth refresh-token cluster (Login/Refresh/Revoke handlers) MUST persist `RefreshTokens` rows explicitly via `IApplicationUnitOfWork`, because `UnitOfWorkBehaviour.IsQuery()` is a known dead pipeline (returns `true` unconditionally; it never saves). This matches the repo-wide 37/40 handler convention. Option A (fixing `UnitOfWorkBehaviour` globally) is OUT OF SCOPE — the behaviour stays as documented dead code with a `// Do not rely on this` warning; only the three handlers change.

## Requirements

### Requirement: R1: Login persists the issued refresh token

The `LoginCommandHandler` MUST call `IApplicationUnitOfWork.SaveChangesAsync` after staging the new `RefreshToken` via `_refreshTokenRepository.Add` (mirroring `RegisterCommand.cs:122`).

#### Scenario: Successful login with a unique superadmin persists the refresh token

- GIVEN a unique superadmin with valid credentials
- WHEN `LoginCommand` is handled
- THEN the handler SHALL stage the new `RefreshToken` via `_refreshTokenRepository.Add`
- AND SHALL call `SaveChangesAsync` once, persisting the row to the database

### Requirement: R2: Refresh persists the rotated refresh token

The `RefreshCommandHandler` MUST read the old token by its hash, stage rotation (revoke old + add new), then call `IApplicationUnitOfWork.SaveChangesAsync` after the repository staging calls.

#### Scenario: Valid old token rotates and persists

- GIVEN a valid, non-revoked, non-expired stored refresh token (persisted per R1)
- WHEN `RefreshCommand` is handled with that token
- THEN the handler SHALL revoke the old token and stage a new one
- AND SHALL call `SaveChangesAsync` once, persisting both the new row and the old token's revocation

### Requirement: R3: Revoke persists the revocation

The `RevokeCommandHandler` MUST call `IApplicationUnitOfWork.SaveChangesAsync` after marking the token revoked via `_refreshTokenRepository.Update`.

#### Scenario: Revoke request persists the revocation

- GIVEN a stored refresh token owned by the authenticated user
- WHEN `RevokeCommand` is handled for that token
- THEN the handler SHALL mark the token revoked
- AND SHALL call `SaveChangesAsync` once, persisting the revocation

### Requirement: R4: Failure paths must not save

Handlers MUST NOT call `IApplicationUnitOfWork.SaveChangesAsync` when the command returns a failure — no save occurs on authentication/validation errors, and none before staging.

#### Scenario: Invalid refresh token fails without saving

- GIVEN a refresh token that is null, revoked, or expired
- WHEN `RefreshCommand` is handled with that token
- THEN the handler SHALL return failure
- AND SHALL NOT call `SaveChangesAsync`
