# User Repository Specification

**Capability**: `IsUniqueLoginAsync` real async behavior  
**Origin**: SDD change `2026-07-30-register-endpoint-fixes`  
**Status**: Active  
**Last Updated**: 2026-07-30

---

## Purpose

Ensure the `UserRepository.IsUniqueLoginAsync` method performs a real async database query using `AnyAsync()` instead of faking async with `Task.FromResult()`.

---

## Specification

### UR1: IsUniqueLoginAsync Uses Real Async

**Requirement**: MUST use `AnyAsync()` — NOT `Task.FromResult(All(...))`, `ToList()`, sync `.Any()/.All()`. Returns `true` when login EXISTS (not unique), `false` when absent.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Login exists | `"existingUser"` in DB | `IsUniqueLoginAsync("existingUser")` | Returns `true` |
| 4b | Login absent | `"newUser"` not in DB | `IsUniqueLoginAsync("newUser")` | Returns `false` |
| 4c | No sync EF | Any call | Implementation inspected | Uses `AnyAsync()` only — no `Task.FromResult`, `ToList`, sync `.Any()/.All()`, `.AsEnumerable`, `.ToArray` |

## Verification Criteria

- [ ] Unit test verifies `AnyAsync` is called (not `Task.FromResult`)
- [ ] Integration test verifies correct true/false behavior with real DB

## Related Specifications

- **auth-http** — Register contract (caller of `IsUniqueLoginAsync`)
