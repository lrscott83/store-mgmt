# Delta for owners: GetAllOwners Handler Defensive Fixes

**Domain**: `owners` — `Application/.../Queries/GetAllOwners/GetAllOwnersQuery.cs`
**Change**: `owners-getall-endpoint-fixes`
**Source**: proposal.md → Modified Capabilities → `owners`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## ADDED Requirements

### Requirement: OQ-1 — Auth Gate Returns 403 Forbidden

The `GetAllOwnersQueryHandler` MUST reject an actor that is neither SuperAdmin nor ReSeller with HTTP 403 Forbidden and a meaningful message. It MUST NOT return 400 with "UserNotFound" — the previous behavior, which used a wrong status code and misleading copy for an identity/auth failure.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Unauthorized actor | Authenticated actor, not SuperAdmin/ReSeller | `GET /api/v1/Owners/all/true` | HTTP 403; NOT 400; message does not say "UserNotFound" |
| 1b | Authorized preserved | Authenticated SuperAdmin | `GET /api/v1/Owners/all/true` | HTTP 200, `Succeeded == true` (R1 unchanged) |

### Requirement: OQ-2 — Guid.Empty UserExternalId Guard

For a ReSeller actor whose `UserExternalId` resolves to `Guid.Empty`, the handler MUST return HTTP 400 BEFORE executing any repository query.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty identity rejected | ReSeller actor, `UserExternalId == Guid.Empty` | `GET /all/false` | HTTP 400; repository query never executed |

### Requirement: OQ-3 — Null Repository Result Guard

The handler MUST treat a null repository result as an empty collection before AutoMapper projection, preventing a NullReferenceException.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Null result | Repository returns null | Handler maps result | Empty collection returned; no NRE |

### Requirement: OQ-4 — CancellationToken Forwarding

The handler MUST forward its `CancellationToken` to every repository call it makes.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Token forwarded | Request with cancellation token | Handler calls repository | Token passed to repository method |

## Verification Criteria

- [ ] Non-SuperAdmin/non-ReSeller gets 403 (not 400 "UserNotFound")
- [ ] ReSeller with `Guid.Empty` UserExternalId gets 400 before any DB query
- [ ] Null repository result returns empty list, not NRE
- [ ] CancellationToken flows handler → repository → EF Core
- [ ] Existing E2E tests (`OwnersListTests`, `OwnersListGapTests`) pass unchanged
