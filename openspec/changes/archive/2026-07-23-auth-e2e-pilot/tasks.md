# Tasks: Auth E2E Pilot — Implementation Checklist

**Status:** Draft
**Source planning docs:**
- [`docs/backend/01_2026-07-22-smca-auth-e2e-test-plan.md`](../../docs/backend/01_2026-07-22-smca-auth-e2e-test-plan.md)
- [`docs/backend/01_2026-07-22-smca-auth-e2e-implementation-plan.md`](../../docs/backend/01_2026-07-22-smca-auth-e2e-implementation-plan.md)

---

## Task 1: Harness Scaffold + Ping Smoke Test

**Files to create:**
- `backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`
- `backend/src/SMCA.WebApi.E2ETests/appsettings.Tests.json`
- `backend/src/SMCA.WebApi.E2ETests/Infrastructure/AppTestFactory.cs`
- `backend/src/SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs`
- `backend/src/SMCA.WebApi.E2ETests/Infrastructure/ApiResponse.cs`
- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthPingTests.cs`

**Files to modify:**
- `backend/src/SMCA.WebApi/Program.cs` — append `public partial class Program { }`
- `backend/src/SMCA.sln` — add the test project

**Interfaces produced:**
- `AppTestFactory : WebApplicationFactory<Program>` — config override for test DB
- `WebAppFixture` — collection fixture, applies migrations via `Database.MigrateAsync()`
- `ApiResponse<T>` / `ApiError` / `ApiResponse.Json` — test-side DTOs
- Collection name `"e2e"` — shared across auth test classes

- [x] **Step 1:** Create `SMCA.WebApi.E2ETests.csproj` with target `net8.0`, packages `Microsoft.AspNetCore.Mvc.Testing`, `xunit`, `FluentAssertions`, `coverlet.collector`, and project references to `SMCA.WebApi`, `Infrastructure`, `Application`, `Domain`
- [x] **Step 2:** Create `appsettings.Tests.json` with connection string pointing to `Database=smca_test`
- [x] **Step 3:** Modify `Program.cs` — append `public partial class Program { }` at end of file
- [x] **Step 4:** Create `AppTestFactory.cs` — `WebApplicationFactory<Program>` that loads `appsettings.Tests.json` and sets environment to `"Testing"`
- [x] **Step 5:** Create `WebAppFixture.cs` — `IAsyncLifetime` that builds factory and applies `Database.MigrateAsync()`; paired with `[CollectionDefinition("e2e")]`
- [x] **Step 6:** Create `ApiResponse.cs` — DTOs `ApiResponse<T>`, `ApiError`, and static `ApiResponse.Json` with `PropertyNameCaseInsensitive = true`
- [x] **Step 7:** Create `AuthPingTests.cs` — `[Collection("e2e")]`, test `Ping_returns_200_and_true` asserts HTTP 200 + body `"true"`
- [x] **Step 8:** Add project to solution: `dotnet sln backend/src/SMCA.sln add backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`
- [x] **Step 9:** Run the test — `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthPingTests` — **PASSED** ✅
- [ ] **Step 10:** Checkpoint — ask user to commit with message `test(webapi): add e2e harness + auth ping smoke test`

---

## Task 2: Login Contract Tests

**Files to create:**
- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginTests.cs`

**Interfaces consumed:**
- `WebAppFixture`, collection `"e2e"`, `ApiResponse<T>` / `ApiResponse.Json`

- [x] **Step 1:** Create `AuthLoginTests.cs` with two tests:
  - `Login_with_empty_credentials_returns_400_from_validation` — POST `{"Login":"","Password":""}` → HTTP 400, `succeeded: false`, `errors` not empty
  - `Login_with_unknown_user_returns_200_with_failure_body` — POST with random login and valid password → HTTP 200, `succeeded: false`, `actionCode: 400`
- [x] **Step 2:** Run the tests — `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthLoginTests` — **PASSED** ✅ (2 tests)
- [ ] **Step 3:** Checkpoint — ask user to commit with message `test(webapi): add login contract e2e tests`

---

## Task 3: Register Validation Test

**Files to create:**
- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterTests.cs`

**Interfaces consumed:**
- `WebAppFixture`, collection `"e2e"`, `ApiResponse<T>` / `ApiResponse.Json`

- [x] **Step 1:** Create `AuthRegisterTests.cs` with one test:
  - `Register_with_empty_body_returns_400_from_validation` — POST `{"Login":"","Password":"","FullName":"","CellPhone":"","Email":null,"StoreName":"","Code":null}` → HTTP 400, `succeeded: false`, `errors` not empty
- [x] **Step 2:** Run the test — `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthRegisterTests` — **PASSED** ✅ (1 test)
- [ ] **Step 3:** Checkpoint — ask user to commit with message `test(webapi): add register validation e2e test`

---

## Task 4: `/me` Authorization Tests + User Seeding

**Files to create:**
- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthMeTests.cs`

**Interfaces consumed:**
- `WebAppFixture.Factory` (for `Services` scope + `CreateClient`), `ApiResponse<T>` / `ApiResponse.Json`, `Domain.Entities.Users.User.Create(...)`, `Infrastructure.Persistence.Contexts.ApplicationDbContext` (`Set<User>()`), `Application.Abstractions.Authentication.IJwtProvider`, `Application.Dtos.Authentication.CurrentUserDto`

- [x] **Step 1:** Create `AuthMeTests.cs` with one test + helper methods:
  - `Me_with_valid_minted_token_returns_current_user` — seed active user via `User.Create()`, mint JWT via `IJwtProvider.GenerateToken()`, call GET with `Bearer` header → HTTP 200, `succeeded: true`, `data.Id` and `data.Login` match seeded values
  - Helper `SeedActiveUserAsync(login)` — creates `User` row via `ApplicationDbContext`
  - Helper `MintToken(userId, login)` — resolves `IJwtProvider` and calls `GenerateToken`
- [x] **Step 2:** Run the tests — `dotnet test backend/src/SMCA.WebApi.E2ETests --filter FullyQualifiedName~AuthMeTests` — **PASSED** ✅ (1 test)
- [x] **Step 3:** Run the whole suite — `dotnet test backend/src/SMCA.WebApi.E2ETests` — **PASSED** ✅ (5 tests from Tasks 1–4)
- [ ] **Step 4:** Checkpoint — ask user to commit with message `test(webapi): add /me authorization e2e tests with user seeding`

---

## Future (Deferred — Documented, Not Implemented)

These two require heavy domain seeding that does not add harness-validation value. Capture as follow-up once the pilot is green.

- **Login full success (HTTP 200 + real token):** `AuthenticationService.IsValidUserAsync` requires an "active store" — a super-admin role, or an active `Store` reachable via `StoreUser`/`Owner`. Needs `Role`/`UserRole`/`Store`/`Owner` seeding not yet mapped.
- **Register full success (owner + store creation):** `RegisterCommandHandler` calls `ICreateOwnerService` / `ICreateStoreService` and `IModuleRepository.GetAvailableModulesToStore()` — needs `Module` rows present plus assertion on persisted `User`/`Owner`/`Store`.
