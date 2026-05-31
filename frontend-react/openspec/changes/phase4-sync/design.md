# Design: phase4-sync — Synchronization (Export / Import)

**Change:** phase4-sync
**Phase:** Design
**Status:** Done (REVISED — Angular interop DROPPED)
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)

> Revision note: the prior design reverse-engineered an Angular WinZip AE-2 / AES-256
> scheme for cross-app parity. That is **OBSOLETE and discarded**. These files are read
> **only by this React app (React → React)**. The new approach is a single uniform JSON
> envelope, `fflate` for ZIP, and browser-native WebCrypto AES-GCM for encryption.

---

## Chosen approach (the answer first)

Build a greenfield `app/sync/` slice that mirrors the existing route-container + offline-service
pattern (`today-expenses.tsx`). Two plain module-scope service classes do all the work:

1. **`DataSerializerService`** — pure data + crypto. Reads all 6 entities into ONE envelope,
   `fflate`-zips the JSON, AES-GCM encrypts the zip bytes, and produces a `Blob`. In reverse:
   decrypts → unzips → parses → validates the envelope.
2. **`DataSynchronizerService`** — write side. Takes a validated envelope and upserts each entity
   by id into its repository (categories before products), returning per-entity counts.

Packaging decision: **zip-the-JSON, then AES-GCM-encrypt the zip bytes** (zip-then-encrypt).
Justification below. The download artifact is a single opaque binary blob with a self-describing
header `[ salt(16) ][ iv(12) ][ AES-GCM ciphertext+tag ]`.

```
app/sync/
├── routes/
│   ├── export.tsx          # container, featureLoader([EFeatures.Send=40]), owns storeId
│   └── import.tsx          # container, featureLoader([EFeatures.Receive=42]), owns storeId
├── components/
│   ├── export-form.tsx     # password input + export button + Blob download
│   └── import-form.tsx     # file picker + password + result summary / error states
└── lib/services/
    ├── data-serializer-service.ts     # envelope build/parse + fflate + WebCrypto
    └── data-synchronizer-service.ts   # upsert merge into repositories
```

---

## Layering & boundaries

| Layer | Responsibility | Talks to |
|-------|----------------|----------|
| Route container (`routes/*.tsx`) | Resolve `storeId` from `useAuthStore`, instantiate services, own async state, feature gate via `loader` | services + form component |
| Form component (`components/*.tsx`) | Presentational: inputs, button, progress, summary, errors. No storage access | callbacks only |
| `DataSerializerService` | Read 6 entities, build envelope, zip, encrypt / decrypt, unzip, parse, validate | offline services + `InventoryRepository` (read); WebCrypto + fflate |
| `DataSynchronizerService` | Upsert merge (write side) | `BaseRepository` instances + `ProductCategoryOfflineService.save` + `InventoryRepository` |

The serializer NEVER touches raw `localStorage`. The synchronizer is the ONLY writer, and it
writes only after decrypt + validate fully succeed (no partial writes on bad input).

---

## Crypto + ZIP specification (the load-bearing section)

### Why zip-then-encrypt (not encrypt-then-zip)

- **Simplest correct pipeline.** One plaintext byte stream (the zip) → one AES-GCM call → one blob.
  Encrypt-then-zip would require encrypting each member, then zipping ciphertext, then there is
  nothing left to compress (ciphertext is incompressible) — pure overhead, more moving parts.
- **One auth tag protects everything.** A single AES-GCM tag authenticates the entire archive;
  any corruption or wrong password fails the whole decrypt atomically, before we ever unzip.
- **Compression actually helps.** JSON is highly compressible; we compress first, encrypt the
  smaller result. Ciphertext does not compress, so the order matters.

### File / blob layout

```
┌──────────────┬────────────┬───────────────────────────────┐
│  salt (16B)  │  iv (12B)  │  AES-GCM ciphertext + tag (…)  │
└──────────────┴────────────┴───────────────────────────────┘
        ^ random per export      ^ GCM appends the 16B tag to the ciphertext
```

`salt` and `iv` are stored in the clear (standard practice — they are not secret). Storing them
in the header keeps future PBKDF2 re-tuning backward-decryptable.

### WebCrypto parameters (exact)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| KDF | `PBKDF2` | Native WebCrypto, resists brute force on low-entropy passwords |
| KDF hash | `SHA-256` | Native, standard |
| KDF iterations | `210_000` | OWASP 2023 floor for PBKDF2-SHA-256; sub-second on a mid-range phone; bump alongside a header version if ever retuned |
| Salt length | `16` bytes, `crypto.getRandomValues` | Per-export random salt defeats rainbow tables / precomputation |
| Cipher | `AES-GCM` | Authenticated encryption — auth tag detects wrong password / tampering for free |
| Key length | `256` bits | Derived AES key |
| IV length | `12` bytes, `crypto.getRandomValues` | GCM-recommended 96-bit nonce; fresh per export |
| Tag | 128-bit, appended to ciphertext by WebCrypto | Default; verified on decrypt |

### Key derivation

```ts
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
```

### Encrypt (export side)

```ts
async function encryptBytes(plaintext: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  ); // ciphertext + 16B tag
  const out = new Uint8Array(16 + 12 + cipher.length);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(cipher, 28);
  return out;
}
```

### Decrypt (import side) — wrong password handling

```ts
async function decryptBytes(blobBytes: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = blobBytes.subarray(0, 16);
  const iv = blobBytes.subarray(16, 28);
  const cipher = blobBytes.subarray(28);
  const key = await deriveKey(password, salt);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher),
    );
  } catch {
    // GCM auth-tag mismatch => wrong password OR corrupt/tampered file
    throw new SyncDecryptError('SYNC.IMPORT.ERROR_WRONG_PASSWORD');
  }
}
```

`crypto.subtle.decrypt` **throws** on auth-tag failure. We map that single failure to ONE i18n
error and abort the whole import **before** the synchronizer is ever called — so a wrong password
can never partially corrupt local data.

### ZIP (fflate, exact usage)

Use synchronous `zipSync` / `unzipSync` — store-sized payloads fit comfortably in memory and the
sync API keeps the pipeline linear and easy to test. (If profiling later shows a ceiling, swap to
the async `zip` / `unzip` callbacks behind the same service method — no envelope change needed.)

The ZIP contains a **single member file** named `sync-data.json` holding the full `SyncEnvelope`.
This is simpler than per-entity files and keeps one AES-GCM tag covering the whole payload.

> Note: the 6-named-file layout (categories.json, products.json, etc.) was dropped along with
> Angular interop. The single-envelope approach was chosen for pipeline simplicity.

```ts
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

// Build zip: ONE member containing the full SyncEnvelope
const envelope: SyncEnvelope = {
  version: 1,
  exportedAt: new Date().toISOString(),
  storeId,
  entities: { categories, products, inventoryEntries, orders, expenses, saleCredits },
};
const zipped: Uint8Array = zipSync({
  'sync-data.json': strToU8(JSON.stringify(envelope)),
});

// Parse on import
const files = unzipSync(zipBytes);                   // Record<string, Uint8Array>
const envelope = JSON.parse(strFromU8(files['sync-data.json'])) as SyncEnvelope;
```

### Output

The encrypted bytes become a `Blob` for download:

```ts
const blob = new Blob([encryptedBytes], { type: 'application/octet-stream' });
const filename = `datos${formatYYMMDDHHmm(new Date())}.zip`; // app-internal opaque format
```

Container triggers download via an object URL (`navigator.share` with the file when available,
plain `<a download>` fallback).

---

## Uniform serialization envelope

ONE envelope shape for ALL 6 entities — no per-entity flat-array vs Map-entries split (that split
existed only for Angular parity, which is gone).

```ts
interface SyncEnvelope {
  version: 1;
  exportedAt: string;        // ISO timestamp
  storeId: string;
  entities: {
    categories:       ProductCategory[];
    products:         Product[];
    inventoryEntries: InventoryEntry[];   // full loss-free records, NOT InventoryEntryView
    orders:           Order[];
    expenses:         Expense[];
    saleCredits:      SaleCredit[];
  };
}
```

Every `entities.*` value is a plain entity array. JSON `Date` fields serialize as ISO strings and
are revived by each repository's existing `reviveDates` logic on write-back read.

### How each entity is read (export side)

| Entity | Read accessor | Returns | Notes |
|--------|---------------|---------|-------|
| `categories` | `new ProductCategoryOfflineService(storeId).getAll()` | `ProductCategory[]` | |
| `products` | `new ProductOfflineService(storeId).getAll()` | `Product[]` | |
| `inventoryEntries` | **`new InventoryRepository(storeId).getAll(storeId)`** → flatten `Map<productId, InventoryEntry[]>` to `InventoryEntry[]` | `InventoryEntry[]` | `InventoryOfflineService.getAll()` returns lossy `InventoryEntryView[]` — DO NOT use it. Each `InventoryEntry` already carries `productId`, so flattening is loss-free and re-groupable on import. |
| `orders` | `new OrderOfflineService(storeId).getAll()` | `Order[]` | |
| `expenses` | `new ExpenseOfflineService(storeId).getAll()` | `Expense[]` | |
| `saleCredits` | `new SaleCreditOfflineService(storeId).getAll()` | `SaleCredit[]` | |

---

## Import merge algorithm

```
read file as ArrayBuffer/Uint8Array
  └─ decryptBytes(bytes, password)        # AES-GCM; throws -> ONE i18n error, ABORT, no writes
       └─ unzipSync(zip)
            └─ reassemble + validate SyncEnvelope (version === 1, entities object present)
                 └─ DataSynchronizerService.merge(envelope)  # ordered upserts
```

Upsert order (referential integrity — products reference categories):

1. **categories** → products → inventoryEntries → orders → expenses → saleCredits

Per-entity write paths (the synchronizer is the only writer):

| Entity | Write path | Why |
|--------|-----------|-----|
| categories | `new ProductCategoryOfflineService(storeId).save(cat)` → plain `repo.upsert` by id | Bypasses the human-facing name-uniqueness guard; `save()` is a pure upsert |
| products | `new BaseRepository<Product>('products', ['createdDate','updatedDate']).upsert(storeId, p)` | Offline service exposes no generic `upsert(entity)`; instantiate the same-config repo directly |
| inventoryEntries | group incoming `InventoryEntry[]` by `productId`, then for each product merge by entry id into existing `InventoryRepository.getByProductId`, then `InventoryRepository.save(storeId, productId, merged)` | Loss-free; preserves entries for products not in the file |
| orders | `new BaseRepository<Order>('orders', ['date','createdDate','updatedDate']).upsert(storeId, o)` | same as products |
| expenses | `new BaseRepository<Expense>('expenses', ['date','createdDate','updatedDate']).upsert(storeId, e)` | same |
| saleCredits | `new BaseRepository<SaleCredit>('saleCredits', ['date','paidDate','createdDate','updatedDate']).upsert(storeId, c)` | same |

Merge semantics:

- **Upsert by `id`, never replace-all.** Non-destructive: local rows absent from the file survive.
- **Idempotent.** Re-importing the same file overwrites rows with identical data → stable state.
- For each entity the synchronizer counts `inserted` (id not present before) vs `updated`
  (id already present) by checking the existing map before writing, and returns:

```ts
interface MergeResult {
  categories:       { inserted: number; updated: number };
  products:         { inserted: number; updated: number };
  inventoryEntries: { inserted: number; updated: number };
  orders:           { inserted: number; updated: number };
  expenses:         { inserted: number; updated: number };
  saleCredits:      { inserted: number; updated: number };
}
```

---

## Component / route design

### `routes/export.tsx`

- `export const loader = featureLoader([EFeatures.Send]);` (Send = 40)
- `storeId` from `useAuthStore((s) => s.user?.selectedStoreId ?? '')`.
- `handleExport(password)`: instantiate `DataSerializerService`, `await svc.exportBlob(password)`,
  trigger download (object URL + `navigator.share` fallback), show success/error.
- Renders `<ExportForm onExport={handleExport} error={error} busy={busy} />`.

### `components/export-form.tsx`

- Presentational. Password input (`type="password"`), export button (disabled while `busy`),
  error slot. All copy via `intl.formatMessage`. No storage access.

### `routes/import.tsx`

- `export const loader = featureLoader([EFeatures.Receive]);` (Receive = 42)
- `storeId` from auth store; instantiates `DataSerializerService` + `DataSynchronizerService`.
- `handleImport(file, password)`: read file bytes → `serializer.parse(bytes, password)` (decrypt +
  unzip + validate; throws on wrong password) → `synchronizer.merge(envelope)` → set summary.
  On `SyncDecryptError` show the single wrong-password/corrupt i18n message; nothing is written.
- Renders `<ImportForm onImport={handleImport} result={result} error={error} busy={busy} />`.

### `components/import-form.tsx`

- Presentational. File picker (`<input type="file">`), password input, import button, busy state,
  result summary (per-entity inserted/updated), error slot. Copy via `intl`.

---

## File inventory

### New (greenfield)

| Path | Purpose |
|------|---------|
| `app/sync/routes/export.tsx` | Export container + `featureLoader([EFeatures.Send])` |
| `app/sync/routes/import.tsx` | Import container + `featureLoader([EFeatures.Receive])` |
| `app/sync/components/export-form.tsx` | Password input + export button + download trigger |
| `app/sync/components/import-form.tsx` | File picker + password + result summary |
| `app/sync/lib/services/data-serializer-service.ts` | Envelope build/parse + fflate + WebCrypto |
| `app/sync/lib/services/data-synchronizer-service.ts` | Ordered upsert merge → counts |
| `app/sync/lib/services/__tests__/data-serializer-service.test.ts` | Serializer + crypto + zip tests |
| `app/sync/lib/services/__tests__/data-synchronizer-service.test.ts` | Merge / idempotency tests |

### Modified

| Path | Change |
|------|--------|
| `app/routes.ts` | Register `route('sync/export', 'sync/routes/export.tsx')` and `route('sync/import', 'sync/routes/import.tsx')` inside the authenticated `app-layout` block |
| `app/shared/lib/i18n/es.ts` | Add `SYNC.*` keys (titles, password label, export/import buttons, result summary, single `SYNC.IMPORT.ERROR_WRONG_PASSWORD`, generic error) |
| `apps/web-store-pos/package.json` | Add `fflate` (~8KB). WebCrypto is browser-native (0 KB) |

---

## Test strategy (vitest, Strict TDD — all React-only)

Write the failing test first, then the minimal implementation, per entry. No Angular fixtures, no
cross-app interop tests.

| # | Test | Asserts |
|---|------|---------|
| T1 | **Serializer envelope round-trip** | Build envelope from seeded repos → `entities.*` arrays match what each accessor returned; inventory flattened from `Map` then re-grouped equals original map |
| T2 | **Zip round-trip** | `zipSync` then `unzipSync` of the 6 members yields byte-identical JSON; envelope reassembled equals source |
| T3 | **Encryption round-trip** | `encryptBytes(p, pwd)` then `decryptBytes(out, pwd)` returns the SAME bytes |
| T4 | **Wrong-password rejection** | `decryptBytes(out, 'wrong')` throws `SyncDecryptError`; assert NO repository write occurred (spy/inspect localStorage unchanged) |
| T5 | **Full export→import round-trip** | `exportBlob(pwd)` → `parse(bytes, pwd)` → `merge` reproduces the original dataset across all 6 entities |
| T6 | **Inventory no-loss round-trip** | Seed `InventoryEntry[]` with all fields (available, order, costPrice, dates) via `InventoryRepository`; export + import; assert every field survives (proves `InventoryEntryView` lossy path is avoided) |
| T7 | **Merge upsert by id** | Existing row with id X + imported row id X (changed data) → updated, not duplicated; new id Y → inserted; local id Z absent from file → untouched |
| T8 | **Categories-before-products ordering** | Spy write order asserts categories upserted before products |
| T9 | **Import-twice idempotency** | Import the same blob twice → final state identical; second `MergeResult` shows `inserted: 0` for every entity |
| T10 | **Envelope validation** | Missing/!==1 `version` or missing `entities` → validation error, no writes |

WebCrypto + `crypto.getRandomValues` are available in the vitest jsdom/node environment (Node 18+
exposes `globalThis.crypto.subtle`); no mock needed. fflate runs natively.

---

## Risks & mitigations (Angular risks removed)

| # | Risk | Sev | Mitigation |
|---|------|-----|------------|
| 1 | PBKDF2 iteration count vs mobile latency | MED | 210k SHA-256 iterations — sub-second on mid-range phones; salt+iv in header so the constant can be raised later behind a header version without breaking old files |
| 2 | Wrong password / corrupt file | MED | AES-GCM auth-tag failure → single i18n error; abort BEFORE any synchronizer write (T4 guards it) |
| 3 | Large-store memory pressure (full in-memory zip + encrypt) | MED | `zipSync` + WebCrypto on `Uint8Array`; async path (`fflate.zip`/`unzip`) reserved behind the same method if profiling shows a ceiling. Acceptable for typical store sizes |
| 4 | Inventory accessor field loss | MED | Read AND write inventory only via `InventoryRepository` (never the lossy `InventoryOfflineService.getAll()`); T6 guards it |
| 5 | Offline services expose no generic `upsert(entity)` | LOW | Synchronizer instantiates the same-config `BaseRepository<T>` directly for products/orders/expenses/saleCredits; categories via `ProductCategoryOfflineService.save` (pure upsert). Entity keys + dateFields documented above |
| 6 | Date revival on import | LOW | ISO strings revived by each repo's existing `reviveDates`/`reviveEntry` on next read; T6/T5 confirm Date fields round-trip |

---

## Next recommended

`sdd-tasks` (once spec is also ready).
