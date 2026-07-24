# Design: Authorization E2E Tests

## Architecture
- Extend existing SMCA.WebApi.E2ETests project (Plan 04 harness)
- In-process WebApplicationFactory<Program> against real Postgres (smca_test)
- xUnit collection fixture pattern ("e2e")

## Key Decisions

### Test layout
- AuthMePermissionsTests in Auth/ folder (report window)
- StoresAuthorizationTests in Auth/ folder (enforcement window)
- StoreScopingTests and UsagesSmokeTests in Auth/ folder

### Seeding
- AuthzSeed helper class for OwnerAdmin, StoreUser, and tenant-mismatch fixtures
- Stores feature 73 (FeatureType.Stores), Management module 7 (ModuleType.Management)
- All fixtures under DataUtils.DefaultTenant.Id
- CleanupStoreGraphAsync removes in FK order: StoreRoleFeature → StoreUser → StoreModule → Store → Owner → UserRole → User

### Contract facts
- Enforcement denial = HTTP 403 (ForbidResult, empty body) — NOT 200-wrapped
- /me failures = HTTP 200, succeeded=false, actionCode=404, User.NotFound/Inactive
- SuperAdmin bypasses the filter entirely
- approve/disapprove = SuperAdmin-only (method-level [HasPermission(SuperAdmin)])
- OwnerAdmin recognition requires UserRole.TenantId == User.TenantId
