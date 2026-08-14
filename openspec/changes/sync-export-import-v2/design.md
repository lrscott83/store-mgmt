# Design: Sync Export/Import Encryption v2 — Auth- and Store-Independent Key Derivation

## Technical Approach

Upgrade `DataSerializerService` to a v2 envelope: unencrypted `meta.json` (formatVersion 2, fresh 16-byte salt, iterations 100000, storeId, exportedAt) written FIRST, then the 6 Angular-named data entries each encrypted by passing a WebCrypto PBKDF2-HMAC-SHA-256 32-byte key (password ALONE) as the zip.js per-entry `rawPassword` (index.d.ts:883/1463). Import detects v2 by `meta.json` presence, validates the store claim BEFORE any write (new `WrongStoreError`), and falls back to v1 (`password + storeId`) when meta is absent — preserving v1 `WrongPasswordError` semantics. zip.js's inner SHA-1 @ 1000-iter KDF still runs over the rawPassword: it is buried, not replaced (V2-04). E2E proves the fresh-device round-trip with zero-login `plantRoster` (V2-08).

**Verified zip.js mechanics** (lib/core/zip-reader.js + index.d.ts): `getEntries()` reads only the central directory — password-free for ANY zip; `ERR_ENCRYPTED`/`ERR_INVALID_PASSWORD` are thrown from `getData`, and per-entry options override reader-level (`getOptionValue(zipEntry, options, …)` at :500-504). Therefore a MIXED zip needs **no reader-level password**: `new ZipReader(reader)` (no options), `meta.json` via `getData()` plaintext, the 6 data entries via `getData(writer, { rawPassword: key })`. `ERR_INVALID_PASSWORD` message is `"Invalid password"` (dist/zip.js:1215) — the existing `err.message === 'Invalid password'` mapping (serializer:224) works unchanged on the v2 path.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Reader-level password vs per-entry rawPassword on v2 | Reader-level would demand a password before meta.json can be read (chicken-and-egg) | Per-entry `{ rawPassword }` on getData; reader constructed with NO password |
| Writer-level password vs per-entry | Writer-level cannot be cleared per-entry (fallback rule) → meta.json would encrypt | `new ZipWriter(writer)` with no options; `add(name, reader, { rawPassword: key })` on the 6 entries; meta.json added with no options |
| WrongStoreError timing | Before vs after KDF | Check `meta.storeId` immediately after reading meta.json, BEFORE deriving the key — fails fast, still before any write |
| Malformed meta.json | Fall back to v1 vs corrupt | `CorruptFileError` (V2-12) — meta.json presence signals v2 intent; malformed envelope = corrupt |
| Pre-hash password (offline-crypto pattern) | Pre-hash adds a step with no external KAT to match | No pre-hash: PBKDF2 over raw password UTF-8 bytes, per V2-03 "password ALONE" |
| WrongStoreError UI | New dialog component vs distinct message in existing pattern | Same blocking-error Swal shape, distinct `SYNC.ERROR_WRONG_STORE` text (V2-10); wrong-password keeps generic message (Angular parity) |

## Data Flow

```
EXPORT: repos get*Json() ──► plaintext JSON ──► ZipWriter(no pwd)
             │                              ├─ add('meta.json', meta)      ← plaintext, FIRST
             │                              └─ add(name, json, {rawPassword:key}) ×6  ← key=PBKDF2(pwd,salt,100000)
             └─ salt = crypto.getRandomValues(16) ──► meta = {formatVersion:2, salt:b64, iterations, storeId, exportedAt}
IMPORT: ZipReader(no pwd) ── getEntries() (central dir only)
        ├─ meta.json present? ──► read plaintext ── meta.storeId !== this.storeId ──► throw WrongStoreError (BEFORE KDF/write)
        │                         └─ key = deriveV2Key(pwd, salt, meta.iterations) ── getData({rawPassword:key}) ×6
        └─ absent ──► getData({ password: pwd + storeId }) ×6  (v1 fallback, 'Invalid password' → WrongPasswordError)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web-store-pos/app/sync/lib/services/data-serializer-service.ts` | Modify | `WrongStoreError`, `deriveV2Key`, v2 export/import, v1 fallback, constants |
| `apps/web-store-pos/app/sync/components/import-form.tsx` | Modify | catch block: `WrongStoreError` → `SYNC.ERROR_WRONG_STORE` |
| `apps/web-store-pos/app/shared/lib/i18n/es.ts` | Modify | `SYNC.ERROR_WRONG_STORE` (only locale file — glob confirmed) |
| `apps/web-store-pos/app/sync/lib/services/__tests__/data-serializer-service.test.ts` | Modify | T2 7-entry shape, T3 KDF pin, T4 WrongStoreError, v1-fallback + empty-store + iterations-honored cases |
| `apps/web-store-pos/app/sync/routes/__tests__/import-no-write.test.ts` | Modify | WrongStoreError no-write case (V2-09) |
| `apps/web-store-pos/app/sync/components/__tests__/import-form.test.tsx` | Modify | WrongStoreError → dedicated message (V2-10) |
| `e2e/sync-export-import-v2.spec.ts` | Create | Two-device round-trip, zero-login (V2-08) |
| `apps/web-store-pos/app/sync/routes/export.tsx`, `import.tsx` | No change | storeId already wired; serializer throws propagate to ImportForm catch |

## Interfaces / Contracts

```ts
// data-serializer-service.ts (new exports)
export class WrongStoreError extends Error {          // mirrors WrongPasswordError:33-42
  readonly name = 'WrongStoreError';
  constructor(message = 'This backup belongs to a different store') { super(message); Object.setPrototypeOf(this, WrongStoreError.prototype); }
}
export const V2_META_FILENAME = 'meta.json';
export const V2_FORMAT_VERSION = 2;
export const V2_ITERATIONS = 100_000;
export const V2_SALT_BYTES = 16;
export interface V2Meta { formatVersion: number; salt: string; iterations: number; storeId: string; exportedAt: string; }
export async function deriveV2Key(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256);
  return new Uint8Array(bits);   // 32 bytes, mirrors offline-crypto.ts:51-74 pattern
}
// private helpers in-module: base64FromBytes / bytesFromBase64 (offline-crypto.ts:22-37 pattern);
// derivePassword() kept ONLY for the v1 fallback.
```

**Test-side helper** (test file): `readRawEntriesV2(payload, password)` → opens reader passwordless, reads meta.json plaintext, derives key, returns `{ entries, meta, key }`; `getEntryText(entry, options?: EntryGetDataOptions)` passes `{ rawPassword: key }`. v1-fallback fixtures build a legacy zip directly: `new ZipWriter(writer, { password: PASSWORD + STORE_ID })` with 6 entries, no meta. Iterations-honored fixture builds a v2 zip with `deriveV2Key(pwd, salt, 50000)` + meta declaring 50000 (V2-03).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (serializer) | T2: 7 entries; 6 data encrypted, meta.json `encrypted === false` + readable passwordless; meta fields (V2-01/02/04) | passwordless `getEntries()` (encrypted flag lives in central dir) |
| Unit (serializer) | T3: `deriveV2Key` returns 32 bytes; iterations honored from meta (50000 fixture decrypts); wrong password yields different key (V2-03/06) | exported helper + raw zip assertions |
| Unit (serializer) | T4: correct pwd + other store → `WrongStoreError` (name asserted), NOT WrongPasswordError (V2-05) | cross-store import |
| Unit (serializer) | v1 fallback: legacy zip imports with pwd+storeId; wrong pwd → WrongPasswordError (V2-07, SYNC-01/02) | legacy ZipWriter fixture |
| Unit (serializer) | Empty-store v2 round-trip; corrupt/non-zip → CorruptFileError unchanged (V2-11/12) | existing T5/T6 patterns |
| Integration | WrongStoreError → synchronizer.sync NOT called (V2-09) | `import-no-write.test.ts` |
| Component | WrongStoreError → blocking error with `SYNC.ERROR_WRONG_STORE`, wrong-password still generic (V2-10) | `import-form.test.tsx` |
| E2E | Two-device round-trip: export (device A) → import (fresh context B, same storeId, password only) → toast + product visible; zero logins (V2-08) | new spec, `plantRoster` only |

**Test-impact → spec map**: `data-serializer-service.test.ts` → V2-01,02,03,04,05,06,07,11,12 + SYNC-01,02; `import-no-write.test.ts` → V2-09; `import-form.test.tsx` → V2-10; `sync-export-import-v2.spec.ts` → V2-08.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No data migration. v1 fallback is the compatibility path: existing Angular/React v1 archives and Angular→React interop keep working (V2-07, SYNC-01). React v2 exports are a documented superset NOT importable by the Angular v1 reader — no dual-export UI. Rollback: revert serializer + UI, delete the new spec.

## Implementation Sequence (for sdd-tasks)

1. Serializer core: `WrongStoreError` + `deriveV2Key` + constants → v2 `export()` → v2 `import()` + v1 fallback (RED test first per strict_tdd).
2. Redesign `data-serializer-service.test.ts` (T2/T3/T4 + v1-fallback + empty-store + iterations-honored).
3. UI/i18n: `es.ts` key + `import-form.tsx` catch branch (no route changes).
4. `import-no-write.test.ts` + `import-form.test.tsx` additions.
5. New E2E spec: plantRoster device A → `seedCategoryAndProduct` (UI, zero-login) → `/sync/export` → `waitForEvent('download')` → `download.path()` → device B `browser.newContext({ serviceWorkers: 'block' })` → same storeId roster → `/sync/import` → `setInputFiles(path)` → password → success toast → `/sales/products` product visible; `page.on('request')` filter for `/v1/auth/login` asserts zero logins on both devices.
6. Verify: `pnpm typecheck`; `pnpm vitest run` (app dir) for the touched suites; `pnpm exec playwright test e2e/sync-export-import-v2.spec.ts` (single file — Playwright accepts a path; `test:e2e` adds `--grep-invert @rate-limit`).

## Open Questions

- None blocking. (E2E download capture has no suite precedent — `a.click()` on objectURL; mitigation: `download.path()` is guaranteed once the download event fires; fallback `download.saveAs()` to a temp path if path() is null.)
