# Archive Report: delete-store-endpoint-fixes

**Date**: 2026-07-30
**Status**: ARCHIVED
**Verdict**: ✅ PASS

---

## Executive Summary

8 bugs fixed in the `DELETE /api/v1/stores/{id}` endpoint across 6 files. Build: 0 errors. Store E2E tests: 100/100 passing.

## Bugs Fixed (8)

1. **NRE on null store** — Handler now null-checks after loading store, throws 404 with "StoreNotFound"
2. **WebApiTest broken** — `DeleteStoreCommand` (non-existent) → `DeactivateStoreCommand`
3. **Over-fetching** — Replaced heavy include query with lightweight `GetStoreByIdAsync`
4. **Double DB query** — Removed `MustAsync(StoreExists)` from validator (handler handles 404)
5. **Wrong auth status code** — 400 BadRequest → 403 Forbidden
6. **Misleading error message** — "UserNotFound" → "DontHavePermission"
7. **Missing OpenAPI metadata** — Added `[ProducesResponseType]` for 400/401/403/404
8. **Wrong XML comment** — "Delete tenant by id" → "Deactivate store by id"

## Infrastructure Added

- `IStoreRepository.GetStoreByIdAsync(Guid id)` — lightweight, respects query filters
- `StoreRepository.GetStoreByIdAsync(Guid id)` — implementation

## File Changes

| File | Action |
|------|--------|
| `Domain/Interfaces/Repositories/IStoreRepository.cs` | Modified |
| `Infrastructure/Persistence/Repositories/StoreRepository.cs` | Modified |
| `Application/.../DeactivateStoreCommand.cs` | Modified |
| `Application/.../DeactivateStoreCommandValidator.cs` | Modified |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | Modified |
| `WebApiTest/Controllers/v1/StoresController.cs` | Modified |

## SDD Cycle Complete

```
proposal → specs → design → tasks → apply → verify → archive
    ✅       ✅       ✅       ✅      ✅       ✅        ✅
```
