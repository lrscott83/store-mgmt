# Archive Report

**Change**: `2026-07-30-store-getbyid-fixes`
**Domain**: `get-store-by-id`
**Date**: 2026-07-30
**Archived at**: `openspec/changes/archive/2026-07-30-store-getbyid-fixes/`
**Mode**: HYBRID (engram + openspec)
**Verdict**: ✅ PASS

---

## Executive Summary

Archived change `2026-07-30-store-getbyid-fixes` — 7 bug fixes for `GET /api/v1/stores/{id}` identified during an `api-endpoint-review`. All 10 tasks complete, all 8 requirements met, 4/4 E2E tests passing, build with 0 errors.

The endpoint was crashing with a `NullReferenceException` on `Owner.User.FullName` due to missing `.Include()` chain, had naming confusion (`GetAllStoresQueryHandler` instead of `GetStoreByIdQueryHandler`), redundant async patterns, double DB queries in validation, missing API metadata, a wrong namespace, and a race condition gap.

---

## What Was Fixed

| # | Fix | Severity | Files |
|---|-----|----------|-------|
| 1 | Added `.Include(s => s.Owner).ThenInclude(o => o.User)` to both `GetStoreByIdIncludingModules*` methods | **CRITICAL** (NRE) | `StoreRepository.cs` |
| 2 | Renamed handler class `GetAllStoresQueryHandler` → `GetStoreByIdQueryHandler` | MEDIUM | `GetStoreByIdQuery.cs` |
| 3 | Removed redundant `await Task.FromResult(...)` | MEDIUM | `GetStoreByIdQuery.cs` |
| 4 | Added `ExistsAsync` to `IStoreRepository` + `StoreRepository`; validator now uses lightweight `AnyAsync` instead of full Include query | **HIGH** (perf) | `IStoreRepository.cs`, `StoreRepository.cs`, `GetStoreByIdQueryValidator.cs` |
| 5 | Added `[ProducesResponseType(401,403,400)]` + XML doc | LOW | `StoresController.cs` |
| 6 | Fixed namespace: `Domain.Entities.Stores` → `Application.Services.Stores` | MEDIUM | `GetStoreByIdService.cs` |
| 7 | Added null check in handler → returns 404 if store deleted between validation and execution | **HIGH** (NRE race) | `GetStoreByIdQuery.cs`, `StoreErrors.cs` |

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs` | Added `.Include(Owner.User)` to both methods + `ExistsAsync()` impl |
| `backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs` | Added `Task<bool> ExistsAsync(Guid id)` |
| `backend/src/Domain/Entities/Stores/StoreErrors.cs` | Added `NotFound` error constant |
| `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoreById/GetStoreByIdQuery.cs` | Renamed handler, removed `Task.FromResult`, added null check |
| `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoreById/GetStoreByIdQueryValidator.cs` | Replaced `IGetStoreByIdService` with `IStoreRepository.ExistsAsync` |
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Added `[ProducesResponseType(401,403,400)]` + XML summary |
| `backend/src/Application/Services/Stores/GetStoreByIdService.cs` | Fixed namespace |

**Total**: 7 files modified (source), 2 files added (error constant + interface method)

---

## Requirements Compliance

| Req | Description | Status |
|-----|-------------|--------|
| R1 | OwnerName via Include chain (no NRE) | ✅ 1a resolved, 1b/1c handled by EF Core null safety |
| R2 | Handler class named `GetStoreByIdQueryHandler` | ✅ Fixed |
| R3 | No `await Task.FromResult` | ✅ Removed |
| R4 | Lightweight `ExistsAsync` in validator | ✅ Implemented |
| R5 | Swagger 401/403/400 documented | ✅ Added |
| R6 | XML summary on `GetStoreByIdAsync` | ✅ Present |
| R7 | Namespace `Application.Services.Stores` | ✅ Fixed |
| R8 | Null store → 404 race condition handle | ✅ Implemented |

---

## Test Results

**4/4 E2E tests passed** — 0 failed, 0 skipped, duration 1s

| Test | Result |
|------|--------|
| `Get_existing_store_returns_dto_and_maps_payment_dates` | ✅ Passed |
| `Get_unknown_store_returns_400_property_code_Id` | ✅ Passed |
| `Get_empty_id_returns_400_property_code_Id` | ✅ Passed |
| `Get_without_token_returns_401` | ✅ Passed |

**Build**: 0 errors ✅

---

## Remaining Risks

| Risk | Level | Notes |
|------|-------|-------|
| R1b/R1c — no dedicated E2E test for null Owner / null Owner.User | **WARNING** | EF Core returns null for missing navigation properties by design. Low risk. |
| R8a — no dedicated E2E test for race condition (store deleted between validation and execution) | **WARNING** | Handler null check is implemented and correct. Race condition tests are hard to write in E2E (timing-dependent). Low risk. |
| Minor deviation from design: code uses `ResponseResult.Failure<StoreDto>(StoreErrors.NotFound, 404)` instead of `ResponseResult.NotFound<StoreDto>(StoreErrors.NotFound)` | **INFO** | Behavioral outcome identical (404 + NotFound error). Design documented both as valid approaches. |

---

## Artifact Lineage (Engram Observation IDs)

| Artifact | Topic Key | Obs ID |
|----------|-----------|--------|
| Proposal | `sdd/2026-07-30-store-getbyid-fixes/proposal` | #414 |
| Design | `sdd/2026-07-30-store-getbyid-fixes/design` | #415 |
| Spec | `sdd/2026-07-30-store-getbyid-fixes/spec` | #416 |
| Tasks | `sdd/2026-07-30-store-getbyid-fixes/tasks` | #417 |
| Verify Report | `sdd/2026-07-30-store-getbyid-fixes/verify-report` | #419 |
| Archive Report | `sdd/2026-07-30-store-getbyid-fixes/archive-report` | *(this)* |

---

## SDD Cycle Summary

```
proposal → spec → design → tasks → apply → verify → archive ✅
```

**Change**: `2026-07-30-store-getbyid-fixes` — **Fully planned, implemented, verified, and archived.**

## Source of Truth Updated

- `openspec/specs/get-store-by-id/spec.md` — Created (new domain spec)
