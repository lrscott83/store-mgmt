# Apply Progress: delete-store-endpoint-fixes

**Mode**: Standard (no TDD — project `openspec/config.yaml` does not enable `rules.apply.tdd`)
**Status**: ✅ COMPLETE — all 14 tasks applied, verified against real code, build passes 0 errors

---

## Commits

| Commit | Message | Role |
|--------|---------|------|
| `42deff4b` | `fix(api): resolve bugs across stores, auth, users endpoints (SDD batch)` | Sole implementing commit — contains all 6 modified files for this change |

The change was implemented as part of a larger SDD batch commit covering stores, auth, and users endpoints. The DELETE `/api/v1/stores/{id}` fixes (this change) are the "DELETE /api/v1/stores/{id}: 8 fixes incl. NRE, null guard, ExistsAsync, ProducesResponseType, param rename, XML docs" bullet in the commit body.

## Tasks Applied

### Phase 1: Repository — Add Lightweight GetStoreByIdAsync

- [x] 1.1 **Add method to IStoreRepository** — `Task<Store?> GetStoreByIdAsync(Guid id);` added to `IStoreRepository` (line 12)
- [x] 1.2 **Implement in StoreRepository** — `GetStoreByIdAsync` implemented as `_stores.Where(s => s.Id == id).FirstOrDefaultAsync()` (line 63-66) — respects query filters, no includes

### Phase 2: Command Handler — DeactivateStoreCommand.cs

- [x] 2.1 **Fix auth status code and message** — `HttpStatusCode.BadRequest` → `HttpStatusCode.Forbidden`; `"UserNotFound"` → `"DontHavePermission"` (line 38)
- [x] 2.2 **Add null check after store load** — `if (store is null) throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound)` (lines 41-42)
- [x] 2.3 **Switch to lightweight load** — `_storeByIdService.GetStoreByIdIncludingModulesAsync(request.Id)` → `_storeRepository.GetStoreByIdAsync(request.Id)` (line 40); removed `IGetStoreByIdService` field and constructor parameter

### Phase 3: Validator — DeactivateStoreCommandValidator.cs

- [x] 3.1 **Remove StoreExists rule** — Deleted `MustAsync(StoreExists)` rule, the `StoreExists` method, and the `_storeByIdService` field/constructor parameter
- [x] 3.2 **Remove unused import** — Deleted `using Domain.Interfaces.Repositories;` (and the no-longer-needed `using Domain.Interfaces.Services.Stores;`)

### Phase 4: Controller — SMCA.WebApi StoresController.cs

- [x] 4.1 **Add ProducesResponseType attributes** — `DeleteAsync` now declares `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `Status401Unauthorized`, `Status403Forbidden`, `Status404NotFound` (lines 123-126) in addition to the existing 200
- [x] 4.2 **Fix XML comment** — `/// Delete tenant by id` → `/// Deactivate store by id` (line 119)

### Phase 5: Controller — WebApiTest StoresController.cs

- [x] 5.1 **Fix broken class reference** — `new DeleteStoreCommand(id)` → `new DeactivateStoreCommand(id)` (line 78) — fixes the compile-breaking reference to a non-existent command
- [x] 5.2 **Fix XML comment** — `/// Delete tenant by id` → `/// Deactivate store by id` (line 71)

### Phase 6: Build & Verify

- [x] 6.1 **Build solution** — `dotnet build backend/src/SMCA.sln` → **0 errors** (re-run 2026-07-31; 8 pre-existing NuGet vulnerability warnings, unrelated)
- [x] 6.2 **Run existing Store E2E tests** — 100/100 Store E2E tests pass (per verify-report; suite files under `SMCA.WebApi.E2ETests/Stores/` and `SMCA.WebApi.E2ETests/Auth/StoresAuthorizationTests.cs`). Batch commit reports full E2E suite at 237/237 passing.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs` | Modified | Added `Task<Store?> GetStoreByIdAsync(Guid id)` lightweight method |
| `backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs` | Modified | Implemented `GetStoreByIdAsync` — `_stores.Where(s => s.Id == id).FirstOrDefaultAsync()`, no includes |
| `backend/src/Application/Features/StoreManagement/Stores/Commands/DeactivateStore/DeactivateStoreCommand.cs` | Modified | Auth code → 403 `DontHavePermission`, null check → 404 `StoreNotFound`, lightweight load via repo, removed `IGetStoreByIdService` dependency |
| `backend/src/Application/Features/StoreManagement/Stores/Commands/DeactivateStore/DeactivateStoreCommandValidator.cs` | Modified | Removed `MustAsync(StoreExists)`, removed `StoreExists` method, removed unused usings; structural Id validation only |
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Modified | Added `[ProducesResponseType]` 400/401/403/404 to `DeleteAsync`, fixed XML comment |
| `backend/src/WebApiTest/Controllers/v1/StoresController.cs` | Modified | Fixed `DeleteStoreCommand` → `DeactivateStoreCommand`, fixed XML comment |

## Build / Test Evidence

| Metric | Result | Source |
|--------|--------|--------|
| Solution build (`SMCA.sln`) | ✅ 0 errors, 8 warnings | Re-run 2026-07-31 (`dotnet build backend/src/SMCA.sln`) |
| Store E2E tests | ✅ 100/100 passing | verify-report.md (2026-07-30) |
| Full E2E suite | ✅ 237/237 passing | Commit `42deff4b` message |
| WebApiTest compiles | ✅ (part of solution build) | Build re-run |

## Deviations from Design

None — implementation matches design.md exactly:

- Lightweight `GetStoreByIdAsync` chosen (design decision confirmed — no over-fetching)
- Validator existence check removed entirely (not replaced with `ExistsAsync`) — confirmed in real code
- Auth failure → 403 `Forbidden` with `"DontHavePermission"` — confirmed in real code
- Namespace rename (`DeleteStore` → `DeactivateStore`) intentionally skipped per design out-of-scope decision

## Notes

- The handler file still lives in the `Application.Features.StoreManagement.Stores.Commands.DeleteStore` namespace (record `DeactivateStoreCommand`, handler class `DeleteStoreCommandHandler`) — this was a documented out-of-scope decision in proposal/design, NOT an oversight.
- `DontHavePermission` resource key exists in both locale files (es: "No tienes permiso", en: "You don't have permission") per design rationale.
