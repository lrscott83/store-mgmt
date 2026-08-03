# Proposal: Owners Create Endpoint Fixes

## Intent

Fix 8 bugs in `POST /api/v1/Owners` (score: 5/10): NRE in ReSeller association, wrong HTTP statuses (200→201, 400→403, 400→409), missing Swagger metadata, weak password validation, misleading XML docs, and undocumented Guest-hardcoded-false decision.

## Scope

### In Scope
- **CRITICAL**: Null guard in `CreateReSellerOwner` — throw `ApiException` when `GetByIdAsync` returns null
- **BREAKING**: 200→201 Created + `ResponseResult<OwnerDto>` with Location header
- **BREAKING**: Auth gate 400 "UserNotFound" → 403 Forbidden (mirrors GetAllOwners/GetOwnerById)
- **BREAKING**: Duplicate login 400 → 409 Conflict via `DbUpdateException` catch
- `[ProducesResponseType]`: 400, 401, 403, 409, 500
- Password complexity: min 8 chars + uppercase (mirror `RegisterCommandValidator.cs:25-26`)
- Guest=false decision: add code comment explaining why admin-created owners default to false
- XML doc: "Add user" → "Create a new owner", proper `<param>`, `<returns>`

### Out of Scope
- Other controller XML docs (only `CreateOwnerAsync`)
- `CreateOwnerService` / repo pattern restructuring
- ToString() password masking
- Commits, pushes, PRs

## Capabilities

### Modified Capabilities
- `owners`: R3 (200→201, `Data:bool`→`Data:OwnerDto`), R4 (duplicate login 400→409)
- `api-controller`: CreateOwnerAsync ProducesResponseType + XML doc + 201+Location
- `validation`: CreateOwnerCommandValidator — password min-length + uppercase rules
- `command-handler`: CreateOwnerCommandHandler — NRE guard, 403 auth, 409 dup, OwnerDto return

## Approach

| Fix | Pattern Source |
|-----|---------------|
| Auth gate 403 | `GetAllOwnersQuery` / `GetOwnerByIdQuery` |
| 201 Created + Location | `AuthController.Register` (proven pattern) |
| 409 Conflict via DbUpdateException | User-decision Option A |
| Password rules | `RegisterCommandValidator.cs:22-26` (keys exist in both I18n.resx files) |
| Null guard + ApiException | `ActivateUserCommandHandler` CH-A3 pattern |

`CreateOwnerService.CreateOwnerAsync` already returns `Task<Owner>` — no sig change needed. `OwnerProfile.AutoMapper` already maps `Owner → OwnerDto`. Handler adds `IMapper` dep.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Controllers/v1/OwnersController.cs` | Modified | 201+Location, ProducesResponseType, XML doc |
| `CreateOwner/CreateOwnerCommand.cs` | Modified | Record→`ICommand<OwnerDto>`, handler: 403 gate, null guard, DbUpdateException catch, AutoMapper projection |
| `CreateOwner/CreateOwnerCommandValidator.cs` | Modified | Password `.MinimumLength(8)` + `.Must(Any(char.IsUpper))` |
| `Services/Owners/CreateOwnerService.cs` | Modified | Guest=false rationale comment only (no logic change) |
| `E2ETests/Owners/OwnersCreateTests.cs` | Modified | 200→201, `ApiResponse<bool>`→`ApiResponse<OwnerDto>` |
| `E2ETests/Owners/OwnersCreateValidationTests.cs` | Modified | Duplicate login 400→409, auth rejection 400→403 |
| `E2ETests/Owners/OwnersCreateGapTests.cs` | Modified | 200→201 assertion |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| BREAKING: 200→201 + bool→OwnerDto breaks frontend | High | Document in frontend plan; coordinate with UI team |
| BREAKING: 400→409 breaks frontend error handling | Medium | Frontend already handles 409 from other endpoints |
| AutoMapper projection on fresh Owner (no Stores) returns empty StoreModules | Low | Expected for new owner — matches current GET behavior |

## Rollback Plan

Revert commit. All changes contained to 7 files. No DB migration, no config changes.

## Dependencies

- `IMapper` (AutoMapper) — already registered in DI, `OwnerProfile` already maps `Owner→OwnerDto`
- I18n keys `PasswordMinLength` + `PasswordRequiresUppercase` — already exist in both `.resx` files

## Success Criteria

- [ ] Owner creation returns 201 Created with `OwnerDto` in envelope + Location header
- [ ] Non-SuperAdmin/non-ReSeller gets 403 (not 400 "UserNotFound")
- [ ] Duplicate login returns 409 Conflict (not 400 validation error)
- [ ] Null ReSellerId throws `ApiException` with clear message (not NRE/500)
- [ ] Weak password (< 8 chars, no uppercase) returns 400 validation error
- [ ] Swagger shows 201, 400, 401, 403, 409, 500
- [ ] XML doc reads "Create a new owner" with proper `<param>` and `<returns>`
- [ ] `Guest=false` has rationale comment in `CreateOwnerService`
- [ ] All existing E2E tests pass after assertion updates
