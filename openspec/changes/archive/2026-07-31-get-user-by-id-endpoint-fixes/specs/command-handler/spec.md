# Delta for command-handler: GetUserByIdQueryHandler

**Domain**: `command-handler` — `GetUserByIdQuery.cs`
**Change**: `get-user-by-id-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## ADDED Requirements

### Requirement: CH-G1 — Null User Race Guard Returns Envelope 404

After fetching the user via `_userRepository.GetUserByIdIncludingStoreAndRoles(...)`, the handler MUST check for null and return `ResponseResult.Failure<UserDto>(UserErrors.NotFound, 404)` if the user was deleted between validation and execution. The endpoint MUST NOT return HTTP 200 with `data: null` in the race window. Mirrors `GetStoreByIdQuery.cs:30-31` (envelope-404, not HTTP 404 status).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Race window hit | User exists at validation, deleted before handler fetch | Handler executes | Repository returns null; handler returns `Failure(UserErrors.NotFound, 404)` |
| 1b | Normal flow | User exists and is not deleted | Handler executes | Returns 200 OK with valid `UserDto`; no null branch taken |

### Requirement: CH-G2 — CancellationToken Forwarded to Repository

The `cancellationToken` received in `Handle(GetUserByIdQuery query, CancellationToken cancellationToken)` MUST be forwarded to the `GetUserByIdIncludingStoreAndRoles` repository call (which gains a token parameter per repository delta RR-G2).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Token reaches EF | Any request processed | Handler executes | `cancellationToken` flows into the repository query |
| 2b | Token cancelled mid-query | Request cancelled | DB query in progress | `OperationCanceledException` propagates; no partial result returned |

## Verification Criteria

- [ ] Handler returns `Failure(NotFound, 404)` when repository fetch yields null — never 200 `data:null`
- [ ] Repository call passes `cancellationToken` as final argument
