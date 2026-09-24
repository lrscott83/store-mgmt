# store-getbyid-nullability

- Status: completed
- Date: 2026-09-24
- Branch: qa
- Route: delegated direct (mapping delegated to one general worker; fixes applied inline — 8 mechanical signature edits + 1 small guard mirroring an existing pattern)
- Authorization: user approved Option A ("dale con A") — fix the false non-null
  annotations on the store GetById family, and make consistent whatever the React
  frontend consumes from those endpoints. Production backend change explicitly
  authorized for this scope.

## Objective and problem

`IGetStoreByIdService.GetStoreByIdIncludingModulesAsync` and
`IStoreRepository.GetStoreByIdIncludingModulesAsync` (+ the IgnoreQueryFilters
variants) declared `Task<Store>` (non-null), but the implementations use
`FirstOrDefaultAsync()` and CAN return null. Evidence:

- Compiler already said so: CS8603 x3 in `StoreRepository.cs` (lines 120, 130, 140).
- Every consumer null-checks anyway (`SetStoreActivationCommand.cs:58`,
  `ActivateStoreCommandValidator.cs:26`).
- Tests mocking the not-found path with `ReturnsAsync((Store?)null)` paid CS8620:
  the `Setup` side carries `Task<Store>` from the interface while the value
  argument infers `Store?` (store family: `SetStoreActivationCommandHandlerTests.cs:111`,
  `BillingServiceTests.cs:135`; 6+ more CS8620 in other interfaces — out of scope).

Option A (chosen): make the interfaces honest (`Task<Store?>`), fix call sites,
and align `frontend-react` if the API contract surfaces null/404 handling.

## Scope

- Backend (authorized): `IStoreRepository` (3 methods), `IGetStoreByIdService`,
  implementations (`StoreRepository`, `GetStoreByIdService`), call-site fixes the
  compiler flags after the change.
- Frontend: verify how `frontend-react` consumes the affected endpoints; add
  null/404-consistent handling ONLY in `frontend-react/` (NEVER `frontend/` —
  Angular legacy untouchable). **Result: FRONTEND_GAP: no** — the wire contract
  of every endpoint stays byte-identical (400/404/HTTP-200-failure-body shapes
  unchanged), the TS types are hand-written (not generated from OpenAPI), and every
  consumer already handles both failure shapes (`BaseResponseModel<T>` union
  narrows `data` to null on `succeeded:false`; HTTP rejections are caught). No
  frontend file needed changes. Optional UX polish (not required): not-found
  message/redirect in `edit-store.tsx` / `store-plan.tsx` instead of generic
  `STORES.ERROR` — out of scope, noted for follow-up.
- Verification gate: `dotnet test` Application.Tests (503) + Domain.UnitTests (27)
  stay green; backend E2E suite NOT run/touched per repo rule; frontend
  typecheck/lint N/A (frontend untouched).
- Out of scope (follow-up candidates): ReSeller-family and IUserRepository-family
  CS8620, `GetStoreLastUsagesQuery.cs:70` CS8620.

## Findings

- Root cause is a false nullability contract: interfaces promised `Task<Store>`
  while implementations returned `FirstOrDefaultAsync()` (nullable). The warning
  cluster (CS8603 x3 in the repository, CS8620 x2 in store tests) was one lie.
- `ActivateStoreCommand` was the only UNSAFE consumer: it dereferenced
  `store.IsActive` with no null check (latent NullReferenceException; the command
  is not wired to any controller today). Guard added mirroring
  `SetStoreActivationCommand` (ApiException StoreNotFound + 404).
- `GetStoreByIdIgnoreQueryFiltersAsync` (IStoreRepository:11) is the same family
  (identical FirstOrDefaultAsync shape, ZERO callers) — included for consistency;
  it carried one of the three CS8603.
- Frontend: types are hand-written in `frontend-react/packages/domain` and the
  store HTTP service (`store-http-service.ts`) — no OpenAPI codegen anywhere.
  All consumers of the affected GETs/comands check `succeeded` or catch HTTP
  rejections; no null-deref risk after the backend annotation change.

## Changes

1. `backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs` — 3 methods -> `Task<Store?>`
2. `backend/src/Domain/Interfaces/Services/Stores/IGetStoreByIdService.cs` — method -> `Task<Store?>`
3. `backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs` — 3 implementations -> `Task<Store?>`
4. `backend/src/Application/Services/Stores/GetStoreByIdService.cs` — implementation -> `Task<Store?>`
5. `backend/src/Application/Features/StoreManagement/Stores/Commands/ActivateStore/ActivateStoreCommand.cs` — `if (store is null) throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound);` before `store.IsActive = true;`

## Verification (observed)

- `dotnet build backend/src/SMCA.sln --no-incremental`: **0 errors**; warning
  diff vs pre-change baseline in the Application.Tests chain: **0 new, 5 removed**
  (CS8620 SetStoreActivation:111, CS8620 BillingServiceTests:135, CS8603
  StoreRepository:120/130/140). Remaining CS8620 (6 unique files: ReSeller,
  IUserRepository, GetStoreLastUsagesQuery) are pre-existing/out of scope.
- `dotnet test backend/src/Application.Tests/Application.Tests.csproj --no-build`: **503 passed, 0 failed**
- `dotnet test backend/src/Domain.UnitTests/Domain.UnitTests.csproj --no-build`: **27 passed, 0 failed**
- Frontend: not touched (no gap); typecheck/lint N/A for this change.

## Checklist

- [x] Map: every backend call site of the 3 methods + null-handling status (delegated)
- [x] Map: API endpoints built on these queries + frontend-react consumption/typing
- [x] `IStoreRepository`: 3 methods -> `Task<Store?>` (incl. `GetStoreByIdIgnoreQueryFiltersAsync`)
- [x] `IGetStoreByIdService`: method -> `Task<Store?>`
- [x] Implementations: `StoreRepository` (3) + `GetStoreByIdService` -> `Task<Store?>`
- [x] Call sites: `ActivateStoreCommand` guard added; no new CS86xx anywhere
- [x] Frontend-react: FRONTEND_GAP no — verified, no changes needed
- [x] `dotnet build --no-incremental`: 0 errors, 5 warnings removed, 0 new
- [x] `dotnet test` Application.Tests + Domain.UnitTests green (503 + 27)
- [x] Frontend typecheck/lint: N/A (frontend untouched)
- [x] Conventional commit

## Verification commands

```bash
dotnet build backend/src/SMCA.sln --no-incremental
dotnet test backend/src/Application.Tests/Application.Tests.csproj
dotnet test backend/src/Domain.UnitTests/Domain.UnitTests.csproj
```