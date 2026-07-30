# Design: fix-store-seed-payment-start-date

## Technical Approach

Minimal 3-file change aligning E2E test seed with production behavior by
removing the explicit `paymentStartDate` argument from `StoreSeed` calls,
making the DTO nullable, and updating the single failing assertion.

The domain's `Store.Create()` already defaults `paymentStartDate` to `null`.
We just stop overriding it in the seed.

## Architecture Decisions

### DD1: Null as default

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep explicit `paymentStartDate` in seed | Tests misaligned with production | ❌ |
| Drop the arg → defaults to `null` | Matches `CreateStoreService` for free stores | ✅ |

The `paymentStartDate` param in `Store.Create(...)` already has `= null`
default. Removing the explicit arg makes the seed behave exactly like
production for free stores.

### DD2: StoreDto.PaymentStartDate → `DateOnly?`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep `DateOnly` | Free stores return sentinel `0001-01-01` to clients | ❌ |
| Change to `DateOnly?` | Correct domain representation; breaking change for consumers expecting non-null | ✅ |

**Rationale**: `null` is semantically correct — free stores have no payment
start date. Anyone consuming `paymentStartDate` expecting a non-null value
must handle `null`, but that's the *correct* contract.

**Risk**: Verify no frontend code depends on `paymentStartDate` being always
present. Low likelihood — no known consumers.

### DD3: No data migration

The backfill migration `20260728194358` already converts sentinel
`0001-01-01` → `null`. Database is correct. No additional migration needed.

## Data Flow

```
Before (broken):
  StoreSeed.SeedStoreAsync()
    → Store.Create(..., DateOnly.FromDateTime(DateTime.UtcNow))
      → Domain: PaymentStartDate = today  ← WRONG for free store
        → StoreDto: PaymentStartDate = today  ← WRONG sentinel
          → Test asserts PaymentStartDate == today  ← fragile

After (fixed):
  StoreSeed.SeedStoreAsync()
    → Store.Create(...)  [no paymentStartDate arg]
      → Domain: PaymentStartDate = null  ← matches production
        → StoreDto: PaymentStartDate = null  ← correct API contract
          → Test asserts PaymentStartDate == null  ← correct
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Application/Dtos/StoreManagement/StoreDto.cs` | Modify | `DateOnly PaymentStartDate` → `DateOnly?` |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/StoreSeed.cs` | Modify | Drop `DateOnly.FromDateTime(DateTime.UtcNow)` from 3 `Store.Create()` calls |
| `backend/src/SMCA.WebApi.E2ETests/Stores/StoreGetByIdTests.cs` | Modify | Assertion line 32: `.Be(today)` → `.Be(null)` |

### StoreSeed.cs — Changes (3 calls)

| Method | Line | Current | After |
|--------|------|---------|-------|
| `SeedStoreAsync` | ~53 | `Store.Create(name, owner.OwnerId, approved, DataUtils.DefaultTenant.Id, DateOnly.FromDateTime(DateTime.UtcNow))` | `Store.Create(name, owner.OwnerId, approved, DataUtils.DefaultTenant.Id)` |
| `SeedStoresAdminUserAsync` | ~73 | `Store.Create($"SA-Store-...", owner.Id, false, tenantId, DateOnly.FromDateTime(DateTime.UtcNow))` | `Store.Create($"SA-Store-...", owner.Id, false, tenantId)` |
| `SeedStoreInNewTenantAsync` | ~92 | `Store.Create($"T2-Store-...", owner.Id, false, tenant.Id, DateOnly.FromDateTime(DateTime.UtcNow))` | `Store.Create($"T2-Store-...", owner.Id, false, tenant.Id)` |

## Interfaces / Contracts

### StoreDto (before → after)

```csharp
// Before
public DateOnly PaymentStartDate { get; set; }

// After  
public DateOnly? PaymentStartDate { get; set; }
```

JSON serialization: free stores → `"paymentStartDate": null` (was `"0001-01-01"`).

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| E2E | `StoreGetByIdTests.Get_existing_store_returns_dto_and_maps_payment_dates` | Assert `PaymentStartDate` is `null` for seeded free store |
| E2E | All billing E2E (31 tests via `BillingSeed`) | No change expected — they seed with explicit dates |
| E2E | ~18 store CRUD call sites via `StoreSeed` | Pass-through — none assert on `PaymentStartDate` |
| Unit | Solution-wide | Ensure `DateOnly?` compiles with AutoMapper config |

## Migration / Rollout

No data migration. Revert 3 files if rollback needed.

## Open Questions

- [ ] **Verify no frontend code depends on non-null `paymentStartDate`** — if any
      TypeScript/React component reads this field expecting a string, it will
      need a null guard. This is a design-time verification task.

