# Delta for validation: GetUserByIdQueryValidator

**Domain**: `validation` — `GetUserByIdQueryValidator.cs`
**Change**: `get-user-by-id-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## MODIFIED Requirements

### Requirement: VL-G1 — Existence Check Uses Lightweight ExistsAsync

The `MustAsync(UserExists)` rule MUST call the new `IUserRepository.ExistsAsync(id)` (single `IgnoreQueryFilters().AnyAsync(u => u.Id == id)` PK lookup) instead of `GetByIdAsync`/`FindAsync` (full entity fetch with navigation materialization). One DB query per validation, no aggregate load.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | User exists | Valid existing user GUID | Validation runs `ExistsAsync` | Single lightweight query executed; validation passes |
| 1b | User does not exist | Non-existent GUID | Validation runs `ExistsAsync` | Single lightweight query returns false; validation fails |
| 1c | No full fetch | Any request | Validator executes | No `GetByIdAsync`/`FindAsync`/Include-chain query issues from validator |

### Requirement: VL-G2 — 400 Semantics Preserved for Non-Existent Id

The validator MUST retain 400 Bad Request as the contract response when validation fails (user does not exist). HTTP 404 remains reserved for the handler race guard only (command-handler delta CH-G1). Contract decision D1=A.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Non-existent id → 400 | Request with well-formed GUID not in DB | Validation fails | Endpoint returns 400 Bad Request (validation error), not 404 |
| 2b | Existing id passes | Valid GUID in DB | Validation runs | No validation error; handler proceeds |

## Verification Criteria

- [ ] Validator issues single `AnyAsync` query — zero `GetByIdAsync`/`FindAsync` calls (finding 2)
- [ ] Non-existent id still returns 400 — no contract change for the non-race path
