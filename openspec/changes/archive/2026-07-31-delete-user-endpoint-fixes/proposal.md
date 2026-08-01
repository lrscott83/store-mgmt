# Proposal: DELETE /api/v1/users/{id} — Endpoint Fixes

## Intent

`DeleteUserCommandHandler` has 5 confirmed defects: the auth guard reports permission problems as 400 "UserNotFound" instead of 403 (F1); the validator double-round-trips the DB via `GetByIdAsync` (F2); the contract contradicts spec R4 (code+test say 400 for a non-existent user, spec says 404) (F3); Swagger metadata is missing `400/401/403/404` and `[FromRoute]` (F4); a SuperAdmin can soft-delete their own account (F5); and the localizer key `UserNotFound` doesn't exist — only the typo `UserNotFoud`, forcing 42 `_localizer["UserNotFound"]` references across ~20 files to fall back to the literal key string (F6). This change hardens the handler (403 guard, self-delete guard, real 404), removes the validator's dead existence rule (DeleteStore precedent — the only way D1's 404 is reachable), fixes the resx key, completes Swagger docs, and adds E2E coverage that proves each fix RED→GREEN.

## Scope

### In Scope
- **D1**: handler null-user → **real HTTP 404** — `ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound)` — mirror `DeactivateStoreCommand.cs:41-42`; code moves TO spec R4 (`users-e2e/spec.md:73` already says 404)
- **D2**: handler auth guard `!IsSuperAdminOrOwnerAdmin` → **403 + `DontHavePermission`** — mirror `DeactivateStoreCommand.cs:37-38`; guard RETAINED (blocks feature-granted StoreUser; NOT redundant with `[HasPermission]`)
- **D3**: self-delete guard → **400 + new key `CannotDeleteSelf`** (both resx); placed after the 403 guard, before the DB call; `using Domain.Common.Extensions;` for `ToGuid()`
- **D4**: resx typo fix `UserNotFoud` → `UserNotFound` (both resx; values + position unchanged)
- **F2/F7**: validator — REMOVE `MustAsync(UserExists)` rule, `UserExists` method, `_userRepository` field, `using Domain.Interfaces.Repositories;`; keep `NotNull`+`NotEmpty` (mirror `DeactivateStoreCommandValidator.cs` exactly — verified: no repo dependency); handler's single `GetByIdAsync` owns existence AND cross-tenant → 404; kills the double round-trip completely
- **F4**: controller metadata — `[ProducesResponseType]` 400/401/403/404 after 200 + explicit `[FromRoute] Guid id` (mirror the uncommitted `UpdatedAsync` diff verbatim)
- **F8**: `<param name="id">User Id</param>` XML doc (mirror `GetUserAsync:43`)
- **D5**: E2E tests (E2E-only, house precedent) — rename `Delete_nonexistent_returns_400` → `_404` (assert `NotFound`); NEW `Delete_as_store_user_with_users_feature_returns_403` (RED today: 400); NEW self-delete test (SuperAdmin → 400 `CannotDeleteSelf`); keep soft-delete 200 + no-token 401
- **D6** (archive-time): `users-e2e` spec R4 — add self-delete row (SuperAdmin → 400); clarify the StoreUser 403 row (feature-granted → handler-level); non-existent row stays 404 (no change)
- Plan `docs/plans/endpoints-e2e-coverage.md` row 54 → Done/Applied (mirror delete-store row 47)

### Out of Scope
- `WebApiTest/Controllers/v1/UsersController.cs` — NO change (orphaned, not in SMCA.sln, compiles; precedent: only touched when broken)
- `ActivateUserCommand` + `ActivateUserCommandValidator` (same F1 anti-pattern + double query) — follow-up change candidate
- `DeleteUserRolesCommandValidator` (same existence pattern) — follow-up candidate
- Project-wide 400-vs-404 mismatch for the other ~20 `UserNotFound` handlers (F6 rename fixes their message text only; DELETE alone moves to 404 per R4)
- `I18n.Designer.cs` regeneration (bare csproj, no generator — stays stale, compile-safe; optional hand-rename)
- Unit tests (D5 — E2E-first parity with GET/update-user precedents)
- git commits / git operations (dirty working tree — do not touch)

## Approach

Mirror the archived `delete-store-endpoint-fixes` pattern for contract semantics (handler owns existence + cross-tenant → 404; validator becomes a pure `NotNull`+`NotEmpty` shape-check with no repo dependency) and the uncommitted `update-user-endpoint-fixes` diff for controller metadata. Handler guard order: 403 auth → 400 self-delete → `GetByIdAsync` (with `cancellationToken`) → null → 404 → soft-delete. `ErrorHandlerMiddleware` already maps `ApiException.StatusCode` → HTTP status — 403/404 flow through with no middleware change. `IUserRepository.ExistsAsync` exists but is NOT needed (validator does no query). Each fix is proven by E2E RED→GREEN; no unit tests.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Non-existent user contract | Real HTTP 404 (`UserNotFound` + NotFound) — code moves TO spec R4; mirror `DeactivateStoreCommand.cs:41-42` |
| D2 | Auth guard response | 403 + `DontHavePermission` (key exists in both resx); guard retained — not redundant with `[HasPermission]` filter |
| D3 | Self-delete | Guard: `request.Id == _httpContextService.UserExternalId.ToGuid()` → 400 `CannotDeleteSelf`; new key in BOTH resx; no frontend calls DELETE → nil impact |
| D4 | Localizer key | Rename `UserNotFoud` → `UserNotFound` (both resx, position unchanged, values unchanged); 42 refs stop printing the literal key; zero refs to the typo |
| — | Validator shape | REMOVE existence rule/method/field/using; keep `NotNull`+`NotEmpty` — verified `DeactivateStoreCommandValidator.cs` has exactly this (precedent mirror, not UpdateUser's `ExistsAsync`) |
| F4 | Controller metadata | Mirror uncommitted `UpdatedAsync` diff verbatim: 400/401/403/404 `[ProducesResponseType]` + `[FromRoute] Guid id` + `<param name="id">` |
| D5 | Tests | E2E-only (no unit tests — house precedent); 3 updated + 2 new in `UsersDeleteTests.cs` |
| MIRROR | WebApiTest | NO change (orphaned project, compiles, command type/ctor unchanged) |
| D6 | Spec alignment | Archive-time: add self-delete row; clarify StoreUser 403 row (handler-level); non-existent stays 404 |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/Application/Features/UserManagement/Users/Commands/DeleteUser/DeleteUserCommand.cs` | Modified | D1 null → 404; D2 guard → 403 `DontHavePermission`; D3 self-delete → 400 `CannotDeleteSelf`; `cancellationToken` on `GetByIdAsync`; `using Domain.Common.Extensions;` |
| `.../DeleteUser/DeleteUserCommandValidator.cs` | Modified | Remove `MustAsync(UserExists)`, `UserExists`, `_userRepository`, repo using; keep `NotNull`+`NotEmpty`; ctor drops `IUserRepository` |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs` | Modified | `[ProducesResponseType]` 400/401/403/404 + `[FromRoute] Guid id` (F4); `<param name="id">` XML doc (F8) |
| `backend/src/Resources/Localization/I18n.resx` | Modified | Add `CannotDeleteSelf` (first data entry, before `ClientNotFound`); rename `UserNotFoud`→`UserNotFound` (line 246) |
| `backend/src/Resources/Localization/I18n.en.resx` | Modified | Add `CannotDeleteSelf` (between `BaseFee` and `CarrierAddressIsMain`); rename `UserNotFoud`→`UserNotFound` (line 504) |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersDeleteTests.cs` | Modified | `Delete_nonexistent_returns_404` (assert `NotFound`); NEW 403 StoreUser-with-Users-feature test (`AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)`); NEW self-delete 400 test; keep 200 + 401 |
| `openspec/specs/users-e2e/spec.md` | Modified (archive) | R4: add self-delete row + handler-level 403 clarification delta (non-existent already 404) |
| `docs/plans/endpoints-e2e-coverage.md` | Modified | Row 54 → Done/Applied + SDD change name (dirty tree — merge carefully) |
| `backend/src/WebApiTest/Controllers/v1/UsersController.cs` | No change | Orphaned, compiles, no broken reference |
| `backend/src/Resources/Localization/I18n.Designer.cs` | No change (optional) | Stale `UserNotFoud` property; compile-safe to skip (precedent: never touched) |

## E2E Matrix (D5)

| Test | Actor setup | Expected | RED/GREEN |
|------|-------------|----------|-----------|
| Soft-delete active user → 200 | `SeedSuperAdminAsync` + `SeedUserWithRoleAsync` victim, AuthedClient | 200 | GREEN (kept) |
| Non-existent id → 404 | `SeedSuperAdminAsync`, DELETE random Guid | 404 `UserNotFound` | RED today: 400 (validator) — GREEN after F2+D1 |
| No token → 401 | unauthenticated client | 401 | GREEN (kept) |
| StoreUser WITH Users feature → 403 | `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Users)` — passes `[HasPermission(UsersAdmin)]` filter, hits handler guard | 403 `DontHavePermission` | RED today: 400 `UserNotFound` (handler) — GREEN after D2 |
| SuperAdmin deletes SELF → 400 | `SeedSuperAdminAsync`, DELETE own id | 400 `CannotDeleteSelf` | RED today: 200 (soft-deletes self) — GREEN after D3 |

Cleanup per test: `CleanupStoreGraphAsync` (403 test) / `CleanupUserAsync` (200/404/self). Run: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersDeleteTests"` (Postgres `smca_test`).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Validator rule removal changes the non-existent contract 400→404 (contract change) | Med | Spec R4 ALREADY says 404 — code moves TO spec; E2E test updated in the SAME change; no client depends on 400 |
| Dirty working tree (prior uncommitted endpoint fixes in `UsersController.cs`, `spec.md`, `UsersUpdateTests.cs`, `ErrorHandlerMiddleware.cs`, plan doc) | Med | This phase: NO git operations; apply edits incrementally without reverting; orchestrator sequences commits (GET precedent Deviation 3) |
| `CannotDeleteSelf` wording | Low | Proposal values ("No puedes eliminarte a ti mismo" / "You cannot delete yourself") — confirm at spec |
| Self-delete behavior change (SuperAdmin can no longer soft-delete own account) | Low | Verified nil frontend impact — no frontend calls DELETE |
| Exists-vs-handler race | None | No race possible — validator does no query; handler's single `GetByIdAsync` is the only check |
| `I18n.Designer.cs` stale after rename | Low | Compile-safe (zero refs to `UserNotFoud`); optional hand-rename documented in apply notes |

## Rollback Plan

Per-file revert, all small/additive: remove handler guards (403/self-delete/404) restoring the original `UserNotFound`+400; re-add validator `MustAsync(UserExists)` + repo ctor injection; drop controller metadata + `<param>`; delete `CannotDeleteSelf` keys and revert the resx rename (restore `UserNotFoud`); delete the 2 new E2E tests and revert the 404 assertion. No schema/migration/frontend impact.

## Dependencies

- Postgres `smca_test` running — E2E command: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersDeleteTests"`
- `DontHavePermission` + `UserNotFound` keys exist in both resx (post-D4); `CannotDeleteSelf` is NEW (added in this change)
- `IUserRepository.ExistsAsync` exists but is NOT used (validator does no query); no new interface methods
- `AuthzSeed.SeedStoreUserAsync(factory, int? grantedFeatureId)` (grants `RoleType.StoreUser` feature) + `FeatureType.Users` (72) + `DbTestHelpers.SeedSuperAdminAsync/AuthedClient/CleanupUserAsync` available for E2E seeds

## Success Criteria

- [ ] Handler: 403 auth guard (`DontHavePermission`), 400 self-delete guard (`CannotDeleteSelf`), 404 non-existent (`UserNotFound`) — all real HTTP statuses via `ApiException`
- [ ] Validator: pure `NotNull`+`NotEmpty`, no repo dependency, no DB query — single round-trip total (handler only)
- [ ] `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersDeleteTests"` GREEN (Postgres `smca_test`): 5 tests — 2 new (403, self-delete 400) were RED before fixes, GREEN after
- [ ] Regression: `UsersListTests|UsersUpdateTests` GREEN
- [ ] Both resx: `CannotDeleteSelf` present with correct values; `UserNotFoud` renamed → `UserNotFound` (no remaining `UserNotFoud` in source)
- [ ] Controller: Swagger documents 400/401/403/404; `[FromRoute] Guid id`; `<param name="id">` present
- [ ] Spec `users-e2e` R4 aligned at archive: self-delete row added, StoreUser 403 row clarified (non-existent row already 404 — untouched)
- [ ] Plan `docs/plans/endpoints-e2e-coverage.md` row 54 → Done/Applied with SDD change name
- [ ] No git operations performed; prior uncommitted changes intact
