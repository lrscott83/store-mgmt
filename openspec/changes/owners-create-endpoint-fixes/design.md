# Design: Owners Create Endpoint Fixes

## Technical Approach

Nine targeted fixes to `POST /api/v1/Owners` without restructuring the service/repo layer. Each fix mirrors an existing proven pattern in the codebase: 201+Location from `StoresController.CreateStoreAsync`, 403 auth gate from `GetAllOwnersQuery`/`GetOwnerByIdQuery`, password complexity from `RegisterCommandValidator`, and null-guard ApiException from `ActivateUserCommandHandler`. The handler changes from `ICommand<bool>` to `ICommand<OwnerDto>`, leveraging existing `OwnerProfile` AutoMapper mapping after SaveChanges.

## Architecture Decisions

| Decision | Option A | Option B | Chosen | Rationale |
|----------|----------|----------|--------|-----------|
| 201+Location | Controller unwraps `ResponseResult<OwnerDto>` and calls `CreatedAtAction` | Return 200 with Location header | **A** | Mirrors `StoresController.CreateStoreAsync` (line 86-90); self-documenting REST |
| OwnerDto from handler | Handler maps `Owner → OwnerDto` via AutoMapper after SaveChanges | Service returns `OwnerDto` directly | **A** | Service signature unchanged; `OwnerProfile` already maps `Owner → OwnerDto`; handler is the integration layer |
| 409 duplicate login | Catch `DbUpdateException` in handler, check inner exception for unique index | Pre-query `IsUniqueLoginAsync` in handler (doubles validator work) | **A** | Validator already checks uniqueness; race window is the only gap; catch is simpler and covers the real failure |
| Password complexity | `.MinimumLength(8)` + `.Must(Any(char.IsUpper))` | Regex `[A-Z]` match | **A** | Exact pattern from `RegisterCommandValidator.cs:25-26`; same I18n keys already exist |

## Data Flow

```
POST /api/v1/Owners
  │
  ▼
FluentValidation (password: ≥8 + uppercase)
  │
  ▼
Handler auth gate: SuperAdmin||ReSeller? ──No──▶ 403 Forbidden
  │ Yes
  ▼
CreateOwnerService → Tenant + User + Owner + UserRole
  │
  ▼
ReSellerId? ──Yes──▶ null check → ReSellerOwner ──Null──▶ ApiException 400
  │
  ▼
SaveChangesAsync ──DbUpdateException──▶ 409 Conflict
  │ Success
  ▼
AutoMapper: Owner → OwnerDto
  │
  ▼
ResponseResult<OwnerDto> → Controller: CreatedAtAction(GetOwnerAsync, {id}, result)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `OwnersController.cs` | Modify | 201+Location, `[ProducesResponseType]` for 201/400/401/403/409/500, XML doc |
| `CreateOwnerCommand.cs` | Modify | Record: `ICommand<OwnerDto>`; handler: `IMapper` dep, 403 gate, NRE guard, 409 catch, Guest=false comment |
| `CreateOwnerCommandValidator.cs` | Modify | Password: `.MinimumLength(8)` + `.Must(Any(char.IsUpper))` |
| `CreateOwnerService.cs` | Modify | Guest=false rationale comment only |
| `OwnersCreateTests.cs` | Modify | 200→201, `ApiResponse<bool>`→`ApiResponse<OwnerDto>` |
| `OwnersCreateValidationTests.cs` | Modify | Duplicate login 400→409, auth rejection 400→403 |
| `OwnersCreateGapTests.cs` | Modify | 200→201 assertion |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | 201+Location, 403 auth gate, 409 conflict, OwnerDto in response | Update existing test assertions; add `Location` header check in `OwnersCreateTests` |
| E2E | Password < 8 chars returns 400 | New test in `OwnersCreateValidationTests` |
| Unit | Password complexity rules | Mirror `RegisterCommandValidatorPasswordTests` patterns |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

**BREAKING**: 200→201 and `Data:bool`→`Data:OwnerDto`. Frontend must handle 201 status and deserialize `OwnerDto` instead of `bool`. Rollback: revert commit. No DB migration, no config changes.

## Open Questions

None — all patterns are proven in the codebase.
