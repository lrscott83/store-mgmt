# Proposal: Update Store Endpoint Fixes

## Intent

Fix 7 bugs identified in the `PUT /api/v1/stores/{id}` endpoint ranging from a crash-level fire-and-forget async issue to missing OpenAPI metadata. The endpoint currently has unhandled async void tasks, N+1 database queries, redundant existence checks, and incorrect HTTP status codes.

## Scope

### In Scope
1. **Fire-and-forget fix** — Replace `List.ForEach` with async `foreach` loop in `UpdateStoreModules` to properly await `AddAsync`
2. **N+1 elimination** — Batch-load modules using existing `GetModulesByIdsAsync` instead of individual `GetByIdAsync` calls
3. **Double DB query elimination** — Remove validator's `StoreExists` rule that pre-loads the store; validator relies on handler result
4. **Add missing `ProducesResponseType`** — Add `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(400)]` to controller action
5. **Fix auth failure status code** — Change `BadRequest` to `Forbidden` (403) with proper message
6. **Remove unused import** — Delete `using static System.Formats.Asn1.AsnWriter;`

### Out of Scope
- Handler SRP violation (11 dependencies, 85-line private method) — deferred for a future refactor
- Adding new tests or integration tests — covered separately

## Approach

Per-file targeted fixes:

- **`UpdateStoreCommand.cs`**: Refactor `ForEach(async ...)` to `foreach + await`, batch-load modules via `GetModulesByIdsAsync`, fix auth status code, remove unused import
- **`StoresController.cs`**: Add missing `[ProducesResponseType]` attributes
- **`UpdateStoreCommandValidator.cs`**: Remove `StoreExists` rule and simplify

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/Application/.../UpdateStoreCommand.cs` | Modified | Fix async, N+1, auth code, unused import |
| `backend/src/Application/.../UpdateStoreCommandValidator.cs` | Modified | Remove redundant store existence check |
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Modified | Add missing response type attributes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Removing validator's existence check could break validation flow | Low | Handler already handles null store gracefully (throws `NotFoundException`) |
| Refactoring ForEach could miss a parallel side effect | Low | `ForEach` never actually ran in parallel — tasks were fire-and-forget; sequential `foreach` is equivalent |

## Rollback Plan

Revert individual file changes via `git checkout` on each modified file. No migration or DB changes involved.

## Dependencies

None.

## Success Criteria

- [ ] No `async void` in `UpdateStoreModules` — all async calls are properly awaited
- [ ] Single DB call for module loading instead of N individual calls
- [ ] Store existence is queried exactly once per request (not in both validator and handler)
- [ ] Swagger/OpenAPI doc shows 400, 401, 403 response codes for the endpoint
- [ ] Unauthorized request returns 403 (not 400) with correct message
