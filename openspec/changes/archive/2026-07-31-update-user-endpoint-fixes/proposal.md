# Proposal: PUT /api/v1/users/{id} — Endpoint Fixes

## Intent

`UpdateUserCommandHandler` has NO ownership check (any user with the Profile feature can edit ANY user — verified IDOR), destroys data on partial bodies (CellPhone/Email/IsActive silently nulled), and NREs on the delete race (500 instead of envelope-404). The silent `IsActive = request.IsActive` bug DEACTIVATES an OwnerAdmin editing their own Angular profile (form omits `isActive` → default `false`). This change hardens the handler (ownership guard, tri-state partial updates, race guard), fixes the validator's double round-trip, trims a redundant full-column UPDATE, completes Swagger metadata, and adds E2E coverage that actually proves the IDOR.

## Scope

### In Scope
- **D1 (HIGH, IDOR)**: handler ownership guard — `if (request.Id != _httpContextService.UserExternalId.ToGuid() && !_httpContextService.IsSuperAdminOrOwnerAdmin) return Failure(NotFound, 404)` — mirror `UpdateUserPasswordCommand.cs:49-56`; envelope 404 (HTTP 200 + ActionCode 404), NOT real 403
- **D2 (HIGH, partial update)**: tri-state guards in handler — CellPhone/Email: `null` → keep existing; `""` → clear to null; non-empty → assign. FullName stays required (validator)
- **D3 (HIGH, NRE race)**: `User? user = await GetByIdAsync(...)`; `if (user is null) return Failure<bool>(UserErrors.NotFound, 404)` — mirror `GetUserByIdQuery.cs:27-28`
- **D4 (MEDIUM, validator)**: replace `GetByIdAsync` with existing `ExistsAsync(id, cancellationToken)` (already on `IUserRepository.cs:19` / `UserRepository.cs:99-102` — no new method); rename misleading `tenantId` param → `userId`; propagate `cancellationToken`
- **D5 (MEDIUM)**: remove redundant `await _userRepository.UpdateAsync(user)` — FindAsync tracks; just `SaveChangesAsync` (UpdateAsync = `Entry.State=Modified` on ALL columns)
- **D6 (MEDIUM, silent IsActive)**: `bool? IsActive` on command + handler applies ONLY when `IsSuperAdminOrOwnerAdmin && request.IsActive.HasValue`
- **D7 (MEDIUM, controller)**: `[ProducesResponseType]` 200/400/401/403/404 (currently only 200) + explicit `[FromRoute] Guid id` — mirror `GetAllUsersAsync:29-32`
- **E2E (D5, RED→GREEN, NO unit tests — parity with GET precedent)**: 6 new tests in `UsersUpdateTests.cs`
- **Archive-time**: align `users-e2e` spec R3 (404 row contradicts 400 contract; add StoreUser-with-feature IDOR row)

### Out of Scope
- Email uniqueness (D3) — no constraint/repo method; separate product decision (needs data cleanup + migration + Register/Create alignment)
- Frontend changes — Angular profile `isActive` omission is a separate frontend task; backend guard makes it harmless (no deactivation)
- Real HTTP 403 for IDOR (rejected — anti-enumeration) / PATCH semantics / required-field DTO (rejected)
- Unit tests (D5 — E2E-first, GET precedent scoped them out)
- Filter-level authz re-architecture (overkill; filter is feature-based, not id-based)

## Approach

Mirror the canonical endpoint-fix pattern: handler-level guard for ownership (self-or-admin, envelope-404, `UpdateUserPasswordCommand` shape) + tri-state field guards + race guard (envelope-404, `GetUserByIdQuery` shape); validator switches to the existing lightweight `ExistsAsync` (no new interface method); drop the redundant tracked-entity `UpdateAsync`; controller mirrors `GetAllUsersAsync` metadata. E2E proves each fix RED→GREEN (actor ≠ target to avoid EF fixup masking), including the REAL IDOR test that the current 403 test can't catch (StoreUser WITH Profile feature passes the filter → reaches handler → edits any user).

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | IDOR response | Envelope 404 (`UserErrors.NotFound`, HTTP 200) — anti-enumeration, mirrors password-handler shape; NOT real 403 |
| D2 | Partial update | Tri-state: null=keep / ""=clear / value=assign (CellPhone, Email); FullName required |
| D3 | Email uniqueness | NOT enforced — separate product decision, out of scope |
| D4 | IsActive | `bool?` on command; apply only `IsSuperAdminOrOwnerAdmin && HasValue` — kills self-deactivate bug, admin toggle intact |
| D5 | Tests | E2E-first, NO unit tests (GET precedent parity) |
| D6 | Finding 8: controller `command.Id = id` mutation | **Design decides**: keep minimal mutation, or `command with { Id = id }` if record-conversion is safe for MediatR/DI. No behavior change in this proposal |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/Application/Features/UserManagement/Users/Commands/UpdateUser/UpdateUserCommand.cs` | Modified | D1 ownership guard; D2 tri-state; D3 race guard; D4 remove `UpdateAsync`; D6 `bool? IsActive` + HasValue |
| `.../UpdateUser/UpdateUserCommandValidator.cs` | Modified | `MustAsync(UserExists)` → `ExistsAsync(id, ct)`; `tenantId` → `userId`; token propagation |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modified | `[ProducesResponseType]` 200/400/401/403/404 + `[FromRoute] Guid id` (D7) |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersUpdateTests.cs` | Modified | 6 new tests (IDOR, field preservation, tri-state clear, IsActive preservation ×2, OwnerAdmin staff edit) |
| `openspec/specs/users-e2e/spec.md` | Modified (archive) | R3 → 400 alignment + StoreUser-with-feature IDOR row |

## E2E Matrix (D5)

| Test | Actor → Target | Body | Expected |
|------|----------------|------|----------|
| IDOR | StoreUser+Profile → other user | `{FullName}` | 200 + envelope ActionCode 404 (RED today: 200 data:true) |
| Field preservation | SuperAdmin → other user | `{FullName}` only | Email/CellPhone unchanged |
| Tri-state clear | SuperAdmin → other user | `cellPhone: ""` | CellPhone becomes null |
| IsActive preserved (non-admin) | StoreUser+Profile → self | no isActive | IsActive unchanged |
| IsActive preserved (admin) | SuperAdmin → other user | no isActive | IsActive unchanged (RED today: deactivates) |
| Explicit toggle | SuperAdmin → other user | `isActive: false` | 200 + deactivated |
| Legit flow | OwnerAdmin → staff | `{FullName}` | 200 (UsersAdmin screen) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Envelope 404 invisible to frontend error paths (200 resolves) | Low | Pre-existing project-wide UX gap; frontends never trigger IDOR path |
| `ExistsAsync` uses `IgnoreQueryFilters()` vs handler filtered path → validator true / handler null | Low | Race guard absorbs (GET precedent) |
| Angular profile `isActive` omission (prod data-corruption today) | Med | D4 guard prevents damage now; Angular fix tracked as separate frontend task |
| Existing partial-body E2E tests (`Update_as_super_admin_returns_200`) change behavior | Low | D2/D4 make partial bodies harmless; keep/update body assertions |
| Dirty working tree (prior batches uncommitted) | Med | This phase: NO git operations; apply phase sequences commits carefully (GET precedent Deviation 3) |
| users-e2e R3 alignment forgotten | Low | Archive-time task explicit in scope |

## Rollback Plan

Per-file revert, all additive/small: remove ownership/tri-state/race guards, restore `request.IsActive` assignment, restore `UpdateAsync` call, revert validator to `GetByIdAsync`, drop controller metadata, delete 6 new E2E tests. No schema/migration impact; no frontend changes. `bool? IsActive` on the command is a DTO-only shape change — safe to revert.

## Dependencies

- Postgres `smca_test` running — E2E command: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersUpdateTests"`
- `IUserRepository.ExistsAsync(Guid, CancellationToken)` already exists (added by GET change) — no new method
- `UserErrors.NotFound` exists (`UserErrors.cs:19`); `AuthzSeed.SeedStoreUserAsync((int)FeatureType.Profile)` + `SeedOwnerAdminWithStoreAsync` available for E2E seeds

## Success Criteria

- [ ] 6 new E2E tests RED before fixes, GREEN after (IDOR test proves the hole today's 403 test can't)
- [ ] IDOR: StoreUser+Profile → other user returns envelope 404; legit OwnerAdmin staff edit returns 200
- [ ] Partial body `{FullName}` no longer nulls Email/CellPhone; `""` clears CellPhone to null
- [ ] Omitted `isActive` never deactivates (non-admin AND admin); explicit `isActive: false` as admin still deactivates
- [ ] NRE race returns envelope 404 — no 500
- [ ] Validator issues single `ExistsAsync` — no `GetByIdAsync`/`FindAsync` double round-trip
- [ ] Handler saves once via `SaveChangesAsync` — no `UpdateAsync` full-column UPDATE
- [ ] Swagger documents 400/401/403/404; `[FromRoute]` explicit
- [ ] All 6 existing `UsersUpdateTests` still pass; regression: `UsersListTests|UsersUpdateTests`
