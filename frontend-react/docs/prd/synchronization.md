# PRD: Synchronization Module

## 1. Overview

The Synchronization module enables peer-to-peer data exchange between devices running "Vende De Todo". Because the app is fully offline-first, there is no central server syncing data — instead, a user exports all local data into an encrypted ZIP file and another device (or the same device after reinstall) imports it.

The module has two routes: export ("Send") and import ("Receive"). The export produces a password-encrypted ZIP containing JSON representations of all six data repositories. The import decrypts, validates, and merges the contents into local storage using upsert semantics.

**Critical constraint:** The export format and localStorage key names must remain fully backward-compatible with the Angular implementation. Devices running Angular and React versions must be able to exchange ZIP files without data loss or corruption.

---

## 2. User Stories

- As a **StoreUser**, I want to export all my store data to a file so I can transfer it to another device or create a backup.
- As a **StoreUser**, I want to share the export file directly via WhatsApp or another app without leaving the browser.
- As a **StoreUser**, I want to import a data file from another device so that both devices stay in sync.
- As a **StoreUser**, I want the import to be safe — if something fails, I want to see which files had errors and which succeeded.
- As an **OwnerAdmin**, I want all data exchanged between devices to be encrypted so unauthorized parties cannot read it if the file is intercepted.

---

## 3. Routes

| Path | Component | Required Feature | Guard |
|------|-----------|-----------------|-------|
| `/synchronization/export` | `SendDataComponent` | `Send` (40) | `AuthGuard` |
| `/synchronization/import` | `ReceiveDataComponent` | `Receive` (42) | `AuthGuard` |

Both routes are protected by `AuthGuard`. Feature IDs are checked against the user's `StoreModuleFeatures` for the active store. SuperAdmin and OwnerAdmin bypass feature checks.

---

## 4. Components

### 4.1 `SendDataComponent`

**Purpose:** Triggers a full data export, encrypts it, and delivers it to the user as a file download or via the Web Share API.

**Behavior:**
- Displays a password input field (user must enter their account password to confirm).
- On submit, calls `DataSerializerService.serializeEncryptedZip(password)`.
- Displays a loading indicator while the ZIP is being generated.
- On success, offers two delivery options:
  1. **Download** — triggers a browser file download.
  2. **Share** — uses the Web Share API (`navigator.share`) if available; falls back to a WhatsApp `wa.me` deep link with the file attached.
- On failure, displays an error message.

---

### 4.2 `ReceiveDataComponent`

**Purpose:** Accepts a ZIP file from the user, decrypts it, and merges its contents into local storage.

**Behavior:**
- Displays a file picker (accepts `.zip` only) and a password input.
- On submit, calls `DataSerializerService.deserializeEncryptedZip(file, password)`.
- Categories are processed before all other entities (referential integrity — products reference categories).
- For each data file, calls `DataSynchronizerService.synchronizeFiles(entity, records)`.
- Shows a per-file progress or result summary after processing.
- Displays a list of any errors encountered (by file name and error message).
- On full success, shows a confirmation message with counts of records inserted and updated.

---

## 5. Export Flow

Step-by-step process when the user initiates an export:

1. User enters their account password and taps "Export".
2. `SendDataComponent` calls `DataSerializerService.serializeEncryptedZip(password)`.
3. Service reads all six repositories from localStorage:
   - `lizoft.store-categories-{storeId}` → `categories.json`
   - `lizoft.store-products-{storeId}` → `products.json`
   - `lizoft.store-inventory-entries-{storeId}` → `inventory-entries.json`
   - `lizoft.store-orders-{storeId}` → `orders.json`
   - `lizoft.store-expenses-{storeId}` → `expenses.json`
   - `lizoft.store-sale-credits-{storeId}` → `sale-credits.json`
4. Each repository's data is serialized to a JSON array string (UTF-8).
5. A ZIP archive is created in memory using `@zip.js/zip.js` with AES encryption.
6. Encryption password = `userPassword + selectedStoreId` (string concatenation, no separator).
7. Each JSON string is added to the ZIP as a named file (e.g., `categories.json`).
8. The ZIP blob is given the filename: `datos{YYMMDD-HHmm}.zip` where the timestamp is the export moment in local time.
9. The blob is returned to `SendDataComponent` for delivery.

---

## 6. Import Flow

Step-by-step process when the user imports a file:

1. User selects a `.zip` file and enters the decryption password.
2. `ReceiveDataComponent` calls `DataSerializerService.deserializeEncryptedZip(file, password)`.
3. Service decrypts the ZIP using `@zip.js/zip.js` with the provided password.
4. Each file inside the ZIP is extracted and parsed as a JSON array.
5. Processing order: `categories.json` first, then all remaining files.
6. For each entity type, `DataSynchronizerService.synchronizeFiles(entity, records)` is called.
7. Errors at any step are collected and do not abort the remaining files.
8. After all files are processed, results and errors are returned to `ReceiveDataComponent` for display.

---

## 7. Data Format Specification

Each JSON file in the ZIP contains a JSON array of objects. The shape of each object must match the localStorage record format exactly — no transformation is applied during export or import beyond JSON serialization.

| File | Entity | Key Rules |
|------|--------|-----------|
| `categories.json` | Category | Upsert by `id`; sorted by `order` field after merge |
| `products.json` | Product | Upsert by `id`; sorted by `order` field after merge |
| `inventory-entries.json` | InventoryEntry | Grouped by `productId`; upsert by entry `id` within group |
| `orders.json` | Order | Upsert by `id` |
| `expenses.json` | Expense | Upsert by `id` |
| `sale-credits.json` | SaleCredit | Upsert by `id` |

**Upsert semantics:** If a record with the same `id` already exists in localStorage, it is replaced with the incoming record. If no record with that `id` exists, the incoming record is inserted.

**Sorted entities:** Categories and Products are re-sorted by their `order` field after the merge completes, before writing back to localStorage.

---

## 8. Encryption Details

- Library: `@zip.js/zip.js`
- Method: AES encryption built into the zip.js encrypted zip writer.
- Password derivation: `password = userPassword + selectedStoreId` (plain string concatenation).
- The password is never stored; it must be entered by the user at both export and import time.
- The same password logic applies to both Angular and React implementations to ensure cross-version compatibility.

---

## 9. Backward Compatibility

The React implementation MUST maintain full compatibility with the Angular export format:

- ZIP file structure (file names inside the ZIP) must not change.
- JSON field names and types for each entity must match the Angular serialization exactly.
- localStorage key names (`lizoft.store-*`) must not change.
- Encryption password derivation formula must remain identical.
- A device running Angular must be able to import a ZIP exported from the React app, and vice versa.

Any future schema change must be handled via a versioned migration path — never by breaking the existing format.

---

## 10. Services

### `DataSerializerService`

Responsible for reading all localStorage repositories, building the ZIP, and decrypting/extracting on import.

```typescript
interface DataSerializerService {
  serializeEncryptedZip(password: string): Promise<Blob>;
  deserializeEncryptedZip(file: File, password: string): Promise<SyncFileMap>;
}

interface SyncFileMap {
  categories: Category[];
  products: Product[];
  inventoryEntries: InventoryEntry[];
  orders: Order[];
  expenses: Expense[];
  saleCredits: SaleCredit[];
}
```

---

### `DataSynchronizerService`

Responsible for merging deserialized records into their respective localStorage repositories.

```typescript
interface DataSynchronizerService {
  synchronizeFiles(map: SyncFileMap): SyncResult;
}

interface SyncResult {
  inserted: Record<string, number>;   // entity -> count of new records
  updated: Record<string, number>;    // entity -> count of updated records
  errors: SyncError[];
}

interface SyncError {
  entity: string;
  message: string;
}
```

---

## 11. Offline Behavior

- The entire export and import process runs client-side in the browser — no network requests are made.
- The Web Share API call in `SendDataComponent` is the only step that requires a network-capable channel (e.g., WhatsApp), but the ZIP generation itself is purely local.
- Import works fully offline — the source file comes from the local filesystem.

---

## 12. Permissions

| Feature | Feature ID | Who has access |
|---------|-----------|----------------|
| Send (Export) | 40 | StoreUser (if granted), OwnerAdmin, SuperAdmin |
| Receive (Import) | 42 | StoreUser (if granted), OwnerAdmin, SuperAdmin |

- SuperAdmin and OwnerAdmin always have access regardless of `featureIds`.
- ReSeller role does not have access to synchronization.
- If a user lacks the required feature, the route redirects to the default unauthorized page.
