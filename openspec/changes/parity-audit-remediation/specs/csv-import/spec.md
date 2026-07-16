# Delta for CSV Import

## ADDED Requirements

### Requirement: EDataFileName Naming Parity
Angular's sync/export module names its data-file identifiers via an `EDataFileName` enum
(`data.file.model.ts:6-13`: `Products = "products.json"`, `Categories = "categories.json"`,
`InventoryEntries = "inventory-entries.json"`, `Orders = "orders.json"`,
`Expenses = "expenses.json"`, `SaleCredits = "sale-credits.json"`). React's
`data-serializer-service.ts` currently expresses the same 6 string values as a plain `ENTRY_NAMES`
const object with different member names (`categories`, `products`, `inventoryEntries`, `orders`,
`expenses`, `saleCredits` — lowerCamel vs Angular's `PascalCase` enum members). React MUST rename
this construct to mirror Angular's naming convention (`EDataFileName` identifier, `PascalCase`
members: `Products`, `Categories`, `InventoryEntries`, `Orders`, `Expenses`, `SaleCredits`) while
keeping the exact same string VALUES (`"products.json"`, etc. — these already match and MUST NOT
change). This is a naming-only alignment; no behavioral change to zip export/import content.

#### Scenario: Member names mirror Angular's enum
- GIVEN a reviewer inspects React's data-file-name construct
- WHEN comparing member names to Angular's `EDataFileName`
- THEN the members are `Products`, `Categories`, `InventoryEntries`, `Orders`, `Expenses`,
  `SaleCredits` (PascalCase), not the current lowerCamel `ENTRY_NAMES` keys

#### Scenario: String values are unchanged
- GIVEN the renamed construct
- WHEN each member's value is inspected
- THEN it still equals the same `"*.json"` string as before the rename (`"products.json"`,
  `"categories.json"`, `"inventory-entries.json"`, `"orders.json"`, `"expenses.json"`,
  `"sale-credits.json"`)

#### Scenario: Export/import ZIP content is unaffected
- GIVEN a store's data is exported to ZIP and re-imported
- WHEN the naming construct is renamed
- THEN the ZIP entry filenames and imported data are byte-identical to before the rename
