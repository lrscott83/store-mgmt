# Design: Stores E2E Tests

## Architecture
- Extend existing SMCA.WebApi.E2ETests project (not new project)
- In-process WebApplicationFactory<Program> against real Postgres (smca_test)
- xUnit collection fixture pattern ("e2e"), IAsyncLifetime for migration

## Key Decisions

### Auth model
- JWT carries only userId+login (per JwtProvider)
- ClaimsTransformerService recomputes permissions from DB per request
- SuperAdmin seed is cheapest passing seed for all 6 endpoints
- OwnerAdmin/StoresAdmin seed for method-level 403 tests

### Data seeding
- All fixtures under DataUtils.DefaultTenant.Id (avoids query-filter trap)
- Seeding via entity factories directly (bypasses create-command business rules)
- Unique random Name/login per test (avoids unique-index collision)
- Cross-tenant test: seed Tenant+Store under non-default tenant

### Cleanup
- finally blocks with IgnoreQueryFilters() in FK order
- StoreSeed.CleanupStoreFixtureAsync for store+owner tests
- DbTestHelpers.CleanupUserAsync for superadmin/user cleanup
- CleanupTenantStoreAsync for cross-tenant test
- Never cleanup DefaultTenant itself

### Test structure
- One xUnit class per endpoint in Stores/ folder
- Helper methods (Body, Assert400) to reduce boilerplate
- ApiResponse<T> deserialization with PropertyNameCaseInsensitive

## Entity Factories Verified
- User.Create(login, password, fullName, cellPhone, email, tenantId)
- UserRole.Create(userId, roleId, tenantId)
- Owner.Create(userId, guest, tenantId, description)
- Store.Create(name, ownerId, approved, tenantId, paymentStartDate, address, description)
- StoreModule.Create(storeId, moduleId, price, ...)
- Tenant.Create(name, description, createdDate)

## Contract Facts (critical)
- Permission failure → HTTP 403 (ForbidResult), no token → 401
- Validator failures → HTTP 400, errors[].code = property name ("Id", "Name", etc.)
- No Store.NotFound error code exists
- Update/Approve/Disapprove never return Failure → Success(saveChanges>0)
- PUT route {id} is authoritative, body Id discarded