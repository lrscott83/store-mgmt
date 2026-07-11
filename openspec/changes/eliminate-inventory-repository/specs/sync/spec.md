# Delta for sync

Governs the export-path portion of proposal `eliminate-inventory-repository`. The sync EXPORT
read side (`sync/routes/export.tsx` + `DataSerializerService`) stops constructing
`new InventoryRepository(storeId)` (no Angular correlate) and instead reads inventory via a new
raw-string passthrough method on `InventoryOfflineService`, mirroring Angular's
`data-serializer.service.ts` exactly. This is a storage/read re-home only — no orchestration
change. The sync IMPORT write side already routes through `InventoryOfflineService` and is
unaffected.

## ADDED Requirements

### Requirement: getInventoryEntriesJson Raw Passthrough on InventoryOfflineService
`InventoryOfflineService` MUST expose `getInventoryEntriesJson(storeId)`, a 1:1 port of Angular's
`inventory-offline.service.ts` lines 494-496: `localStorage.getItem(this.getStorageKey()) || "{}"`.
It MUST return the raw on-disk string as-is (no parse, no Map rebuild, no re-serialization), with
a literal `"{}"` fallback (not `"[]"`) when the key is missing — matching Angular's exact quirk.

#### Scenario: Returns raw stored string unmodified
- GIVEN inventory data exists in `localStorage` for a store
- WHEN `getInventoryEntriesJson(storeId)` is called
- THEN it MUST return the exact raw string stored at the inventory key, without parsing or re-serializing it

#### Scenario: Missing key falls back to literal "{}"
- GIVEN no inventory data exists yet for a store
- WHEN `getInventoryEntriesJson(storeId)` is called
- THEN it MUST return the literal string `"{}"`, not `"[]"` or `undefined`

#### Scenario: Corrupt stored data passes through unchanged (no silent data loss)
- GIVEN the on-disk inventory value is malformed/corrupt JSON
- WHEN `getInventoryEntriesJson(storeId)` is called
- THEN it MUST return the corrupt string as-is (matching Angular's export behavior), and MUST NOT silently swallow it into an empty result

### Requirement: Sync Export/Import Read Side Uses InventoryOfflineService, Not a Repository
`sync/routes/export.tsx` and `sync/routes/import.tsx` MUST NOT construct
`new InventoryRepository(...)` for the serializer's inventory read side. They MUST construct
`InventoryOfflineService` and pass it to `DataSerializerService`, which MUST read inventory via
`getInventoryEntriesJson()` rather than via a repository `getAll()` + Map-rebuild +
re-`JSON.stringify()` sequence.

#### Scenario: No InventoryRepository import in sync routes
- GIVEN a reviewer inspects `sync/routes/export.tsx` and `sync/routes/import.tsx`
- WHEN checking their imports and constructor calls for the inventory read side
- THEN neither MUST import or instantiate `InventoryRepository`

#### Scenario: DataSerializerService reads inventory via the offline service
- GIVEN `DataSerializerService` is constructed for an export
- WHEN it serializes the inventory section of the export payload
- THEN it MUST do so by calling `getInventoryEntriesJson()` on an `InventoryOfflineService` instance, not by rebuilding a Map from a repository read

#### Scenario: Export no longer silently loses corrupt inventory data
- GIVEN the on-disk inventory value is malformed/corrupt JSON
- WHEN an export is performed
- THEN the exported inventory section MUST contain the raw corrupt string (parity with Angular), not a silently-emptied result (fixing the pre-change repository-based behavior that swallowed parse errors)
