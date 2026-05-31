# Proposal: phase4-sync — Synchronization (Export / Import)

**Change:** phase4-sync
**Phase:** Propose
**Status:** Done (REVISED — scope changed)
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)
**Approach:** Uniform React-native JSON serializer + `fflate` ZIP + WebCrypto AES-GCM

---

## Intent

The React PWA ("Vende De Todo") must let a store owner move their full dataset between devices via a single password-protected file. Phases 1–3 delivered the offline-first data layer (categories, products, inventory, orders, expenses, sale credits) but the **Synchronization** module is scaffolded only at the nav/enum level — it has **zero implementation files**.

**Why now:** Sync is the last unblocked Phase 4 capability and the only path to back up or transfer a store to a new device. Without it a user who loses their device loses all history.

**Scope change vs prior proposal:** Angular interop is DROPPED. These export files are read **only** by the React app (React→React). This removes the Angular ZIP contract, the per-entity flat-array-vs-Map-entries translation table, and the `@zip.js/zip.js` dependency. Serialization is now uniform and far simpler.

**Success looks like:**
- `/sync/export` produces a password-protected file the same React app can re-import on another device.
- `/sync/import` decrypts, validates, and upserts every entity into local storage, preserving referential integrity.
- Re-importing the same file is idempotent (upsert by id). Wrong password fails cleanly without corrupting data.

---

## Scope

### In scope

**Routes (2 new, both registered in `routes.ts`):**
| Route | Feature gate | Page |
|---|---|---|
| `/sync/export` | `EFeatures.Send` (40) | export container |
| `/sync/import` | `EFeatures.Receive` (42) | import container |

**New files (greenfield `app/sync/`):**
- `app/sync/routes/export.tsx` — container, `featureLoader([EFeatures.Send])`, owns `storeId`, renders `<ExportForm />`.
- `app/sync/routes/import.tsx` — container, `featureLoader([EFeatures.Receive])`, owns `storeId` + synchronizer, renders `<ImportForm />`.
- `app/sync/lib/services/data-serializer-service.ts` — read all 6 entities, build the uniform JSON envelope, `fflate` zip/unzip, WebCrypto AES-GCM encrypt/decrypt.
- `app/sync/lib/services/data-synchronizer-service.ts` — upsert merge into existing offline services / `InventoryRepository`; returns inserted/updated counts per entity.
- `app/sync/components/export-form.tsx` — password input, export button, download/share.
- `app/sync/components/import-form.tsx` — file picker, password input, progress / result summary, error states.

**Modified files:**
- `app/routes.ts` — register the two sync routes.
- `app/shared/lib/i18n/es.ts` — add `SYNC.*` keys (titles, labels, buttons, result + error messages).
- `apps/web-store-pos/package.json` — add `fflate` (~8KB). WebCrypto is browser-native (zero KB).

**Entity set in the export (all 6):** Categories, Products, InventoryEntries, Orders, Expenses, SaleCredits. One uniform JSON file per entity inside the ZIP.

### Explicitly out of scope
- **Angular interop** — no cross-app contract, no Angular-exported fixture, no Angular-readable format. React↔React only.
- **Management** and **Profile** modules — separate future changes.
- **`EFeatures.Download` (41)** — dormant enum slot, no route, no menu. Leave untouched.
- **Server-side / cloud sync** — device-to-device file transport only.
- **Versioned migration framework** — envelope carries a `version` field, but multi-version migration logic is deferred.

---

## Approach — uniform serializer + fflate + WebCrypto AES-GCM

No translation layer. Every entity is read through its existing accessor and JSON-serialized into ONE consistent envelope shape. The serializer never touches raw `localStorage`.

### Envelope (per entity file inside the ZIP)
```
{ "version": 1, "entity": "<name>", "exportedAt": "<ISO>", "data": <entity payload> }
```
- Categories, Products, Orders, Expenses, SaleCredits → read via their offline service (`getAll()` / equivalent); `data` is the entity array.
- InventoryEntries → read via **`InventoryRepository` DIRECTLY** (`InventoryOfflineService.getAll()` returns a lossy `InventoryEntryView[]`); `data` is the repository's full records.

ZIP member files: `categories.json`, `products.json`, `inventory-entries.json`, `orders.json`, `expenses.json`, `sale-credits.json`. Unknown members ignored on import.

### Crypto & packaging
| Concern | Choice |
|---|---|
| ZIP | `fflate` `zipSync` / `unzipSync` (or async variants) |
| Encryption | WebCrypto `AES-GCM` over the zipped bytes |
| Key derivation | `PBKDF2` (SHA-256) from the user password + random per-file salt |
| File layout | `[ salt(16) ][ iv(12) ][ AES-GCM ciphertext+tag ]` |
| Filename | `datos{YYMMDD-HHmm}.zip` (encrypted bytes, app-internal format) |

### Export flow (`/sync/export`)
1. Container resolves `storeId`, instantiates the serializer.
2. User enters a password.
3. Serializer reads each of the 6 entities, wraps each in the envelope, JSON-stringifies.
4. `fflate` zips the 6 files into one byte array.
5. Derive AES key via PBKDF2(password, salt); AES-GCM encrypt the zipped bytes.
6. Prepend salt + iv; deliver as a downloadable file (`navigator.share` when available, plain download fallback).

### Import flow (`/sync/import`)
1. User picks a file and enters the password.
2. Read salt + iv; derive key via PBKDF2; AES-GCM decrypt. Auth-tag failure ⇒ "wrong password or corrupt file" — abort, no writes.
3. `fflate` unzips; parse each known member envelope; validate `version`/`entity`.
4. Synchronizer upserts records into the matching accessor (`InventoryRepository` direct for inventory).
5. **Order: categories first, then products, then the rest** (referential integrity).
6. Return inserted/updated counts per entity; form renders the summary.

### Merge semantics
- **Upsert by id**, never replace-all. Non-destructive; keeps local rows absent from the file.
- Idempotent re-import. Imported categories use plain `upsert()` by id (bypass the human-facing name-uniqueness guard).

---

## Key decisions

| Decision | Rationale |
|---|---|
| **Drop Angular interop / uniform serialization** | Files are read only by the React app. The per-entity flat-array-vs-Map-entries split existed solely for Angular ZIP parity; removing it eliminates the entire translation layer and its tests. One envelope shape for all 6 entities is simpler, safer, and fully React-controlled. |
| **`fflate` for ZIP, not `@zip.js/zip.js`** | `fflate` is the smallest available (~8KB), tree-shakeable, fast, zero-dep. We no longer need `@zip.js`'s Angular-compatible encryption, so its larger footprint buys nothing. |
| **WebCrypto AES-GCM, not library-native encryption** | Browser-native ⇒ zero added KB and audited primitives. AES-GCM is authenticated: the auth tag detects wrong password / tampering for free. ZIP-library encryption (WinZip AE-2, `@zip.js`) only mattered for Angular parity, which is gone. |
| **PBKDF2 key derivation + random salt** | Passwords are low-entropy; PBKDF2 (SHA-256, high iteration count) resists brute force. Random per-file salt prevents precomputation/rainbow tables. WebCrypto exposes both natively. |
| **InventoryEntries via `InventoryRepository` directly** | `InventoryOfflineService.getAll()` returns a lossy `InventoryEntryView[]`; the repository is the only loss-free source/sink. |
| **Merge = upsert by id, non-destructive** | Preserves local data, makes re-import idempotent, avoids destructive imports. |
| **Categories before products on import** | Products reference categories; categories must exist first. |
| **Mirror the route-container + offline-service pattern** | Matches `today-expenses.tsx`; container owns `storeId` and service wiring, component owns the form. |
| **Keep `EFeatures.Download` (41) dormant** | Reserved slot; no route, no menu. Out of scope. |

---

## Risks & mitigations

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| 1 | **Key-derivation parameter choice** (iterations vs. mobile CPU latency) | MED | PBKDF2-SHA-256 with a documented iteration count tuned for sub-second derivation on a mid-range phone; store salt+iv in the file header so future tuning stays decryptable. |
| 2 | **Wrong password / corrupt file handling** | MED | AES-GCM auth-tag failure surfaces as a single clear i18n error; abort before ANY repository write so a bad import can never partially corrupt local data. |
| 3 | **Large-store memory pressure** (zip + encrypt fully in memory) | MED | Use `fflate` + WebCrypto on `Uint8Array` buffers, run async with a progress indicator; acceptable for typical store sizes. Streaming deferred unless profiling shows a real ceiling. |
| 4 | **Inventory read/write path** — wrong accessor loses fields | MED | Read and write inventory exclusively via `InventoryRepository`; covered by a round-trip unit test asserting no field loss. |
| 5 | **Idempotent re-import** | LOW | Upsert by id + dedicated re-import test (import twice, assert counts/state stable). |

---

## Next recommended

`sdd-spec` and `sdd-design` (can run in parallel).
