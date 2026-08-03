# Tasks: Owners Create Endpoint Fixes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 130–190 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | single-pr (NO COMMITS) |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | All 7 files: validator, handler, controller, service comment, 3 E2E suites | PR 1 | `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~OwnersCreate"` | WebAppFixture TestServer runs real HTTP + in-memory DB (the command itself) | Revert 7 files; no migration/config changes |

## Phase 1: Validator

- [x] 1.1 `CreateOwnerCommandValidator.cs`: add `.MinimumLength(8).WithMessage(_localizer["PasswordMinLength", "{PropertyName}", 8])` to Password rule (mirror `RegisterCommandValidator.cs:25`)
- [x] 1.2 `CreateOwnerCommandValidator.cs`: add `.Must(p => p.Any(char.IsUpper)).WithMessage(_localizer["PasswordRequiresUppercase", "{PropertyName}"])` (mirror `RegisterCommandValidator.cs:26`)

## Phase 2: Handler

- [x] 2.1 `CreateOwnerCommand.cs`: record → `ICommand<OwnerDto>`; handler → `ICommandHandler<CreateOwnerCommand, OwnerDto>`; add `IMapper` ctor dep
- [x] 2.2 Auth gate: replace 400 `UserNotFound` with `ApiException(_localizer["Unauthorized"], HttpStatusCode.Forbidden)` (mirror `GetAllOwnersQuery.cs:38`)
- [x] 2.3 `CreateReSellerOwner`: `if (reSeller is null) throw new ApiException(..., BadRequest)` before `ReSellerOwner.Create`
- [x] 2.4 Wrap `SaveChangesAsync` in try-catch for `DbUpdateException` → `ApiException(..., Conflict)` on duplicate login
- [x] 2.5 After save: `return ResponseResult.Success(_mapper.Map<OwnerDto>(owner))` instead of bool
- [x] 2.6 `CreateOwnerService.cs`: comment on `Owner.Create(user.Id, false, ...)` explaining Guest=false default for admin-created owners

## Phase 3: Controller

- [x] 3.1 `OwnersController.cs` `CreateOwnerAsync`: `var result = await Sender.Send(command); return result.Succeeded ? CreatedAtAction(nameof(GetOwnerAsync), new { id = result.Data!.Id }, result) : Ok(result);` (mirror `StoresController.cs:87-90`)
- [x] 3.2 Add `[ProducesResponseType]`: 201 (typed `ResponseResult<OwnerDto>`), 400, 401, 403, 409, 500
- [x] 3.3 XML doc: `<summary>` "Create a new owner", `<param name="command">`, `<returns>` describing created-owner envelope

## Phase 4: E2E Tests

- [x] 4.1 `OwnersCreateTests.cs`: assert 201 Created; `ApiResponse<OwnerDto>` with `Data.Id` non-empty; add `Location` header check (R3.1, OC-CT3)
- [x] 4.2 `OwnersCreateValidationTests.cs`: duplicate login → 409 Conflict (R4.7)
- [x] 4.3 `OwnersCreateValidationTests.cs`: add unauthorized-actor test → 403, body NOT contains `UserNotFound` (OQ-1.1; mirror `OwnersListAuthTests.cs`)
- [x] 4.4 `OwnersCreateValidationTests.cs`: add password cases `"Abc1"` and `"abcdefgh"` → 400 `Code=="Password"` (OQ-4.1/4.2)
- [x] 4.5 `OwnersCreateGapTests.cs`: ReSeller create → 201 (R7.1)
- [x] 4.6 `OwnersCreateGapTests.cs`: add null-ReSeller-at-execution test → 400, no 500 (OQ-3.1)

## Phase 5: Build + Verify

- [x] 5.1 `dotnet build backend/src/SMCA.sln` → 0 errors
- [x] 5.2 `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~OwnersCreate"` → all green
