# Delta for owners: GetOwnerById 404 Contract, Structural Validator, Null Guard

**Domain**: `owners` — `Application/.../GetOwnerById/GetOwnerByIdQuery.cs` + `GetOwnerByIdQueryValidator.cs`
**Change**: `owners-getbyid-endpoint-fixes`
**Source**: proposal.md → Modified Capabilities → `owners`
**Status**: Draft
**Last Updated**: 2026-08-02

---

## MODIFIED Requirements

### Requirement: R2: GET /api/v1/Owners/{id}

The system MUST return 200 for an existing owner. MUST return an envelope with `Succeeded == false` and `ActionCode == 404` for a nonexistent, well-formed owner GUID (handler-level existence gate). MUST return 400 with `Errors[].Code == "OwnerId"` for an empty GUID (structural validation).
(Previously: nonexistent or empty GUID both returned 400 with `Errors[].Code == "OwnerId"`, produced by the validator's `MustAsync(OwnerExists)` DB check)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Get existing | Seeded owner exists | `GET /{ownerId}` | 200 |
| 2 | Nonexistent ID | Random GUID | `GET /{guid}` | Envelope `Succeeded == false`, `ActionCode == 404`, error `Code == "Owner.NotFound"` |
| 3 | Empty GUID | `Guid.Empty` | `GET /{0000...}` | 400, `Code == "OwnerId"` (structural, unchanged) |

## ADDED Requirements

### Requirement: OQ-2 — Validator Performs Structural-Only Validation

`GetOwnerByIdQueryValidator` MUST NOT perform existence checks. It SHALL keep only structural rules (`NotNull`, `NotEmpty` on `OwnerId`) and MUST NOT issue any repository query. The `MustAsync(OwnerExists)` rule, the private `OwnerExists` method, and the `IOwnerRepository` dependency MUST be removed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty GUID rejected | `Guid.Empty` | Validator runs | 400 validation failure, `Code == "OwnerId"` |
| 2b | Zero DB queries | Any request | Validator runs | No repository call issued — validation resolves from request data alone |

### Requirement: OQ-3 — Handler Null Guard

`GetOwnerByIdQueryHandler` MUST guard the repository result: when the owner is null, it MUST return `ResponseResult.Failure<OwnerDto>` with `ActionCode == 404` and error `Code == "Owner.NotFound"` — AutoMapper MUST NOT be invoked with a null owner.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Null result | Repository returns null | Handler executes | `Failure(404)` returned; mapping never runs |
| 3b | Non-null mapped | Repository returns owner | Handler executes | `Success(ownerDto)` with all navigation properties resolved |

## Verification Criteria

- [ ] E2E nonexistent-ID test asserts envelope `Succeeded == false` + `ActionCode == 404` (was HTTP 400 + `Code == "OwnerId"`)
- [ ] Validator issues zero DB queries (structural-only)
- [ ] Handler issues exactly 1 DB query with all includes
- [ ] Existing `Get_owner_by_id_returns_200` and empty-GUID-400 tests pass unchanged
