# At-Rest Encryption — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt all six local business entities at rest in the web-store-pos PWA so `localStorage` never holds plaintext business data, decrypting/encrypting through the existing synchronous read/write seams with a per-store Data Encryption Key (DEK) held only in memory and unwrapped from the user's password at login.

**Architecture:** A synchronous AES-GCM entity codec (`@noble/ciphers`) wraps every stored string with an `enc:v1:` envelope; the twelve persistence seams stay synchronous by transforming only the stored string, never the parsed object (Map/date revival is untouched). The DEK lives in an in-memory singleton (`data-key-store`), never persisted; it is produced by `unwrapDek` (async `crypto.subtle`) at online/offline login from the roster's per-user `wrappedDek`/`wrapSalt`/`wrapIv`. The login screen doubles as the unlock gate: a valid session with no DEK is routed back to login. A one-time migration pass upgrades legacy plaintext keys in place.

**Tech Stack:** React, TypeScript, Zustand, Vitest+jsdom, @noble/ciphers (sync AES-GCM), Web Crypto (crypto.subtle) for the one-time DEK unwrap, @zip.js/zip.js (existing).

## Global Constraints

- **Depends on the offline-auth frontend plan being implemented first** — this plan EXTENDS `roster-types.ts`, `roster-store.ts`, `offline-crypto.ts`, and the `loginOffline` action from `2026-07-25-offline-auth-frontend-plan.md`.
- **KEK derivation (MUST match backend byte-for-byte):** `kek = PBKDF2( input = utf8( Base64(SHA256(utf8(password))) ), salt = base64Decode(wrapSalt), iterations = 210000, hash = SHA-256, dkLen = 32 )`. Reuse the offline-auth `sha256Base64` + `pbkdf2Base64` helpers.
- **Wrapped DEK on-the-wire:** `wrappedDek` = Base64(AES-GCM-ciphertext ‖ 16-byte tag); the GCM tag is CONCATENATED to the ciphertext. `crypto.subtle` AES-GCM expects the tag appended, so pass the whole buffer.
- **Entity envelope:** stored string = `'enc:v1:'` + Base64( iv(12) ‖ ciphertext ‖ tag(16) ), synchronous AES-GCM via `@noble/ciphers` `gcm`, fresh 12-byte iv per write.
- **Pinned names (identical everywhere):** `setDek` / `getDek` / `clearDek`; `encryptEntity` / `decryptEntity` / `isEncrypted`; `unwrapDek`; `migrateEntitiesToEncrypted`; errors `MissingDataKeyError`, `DekUnwrapError`.
- **Roster fields consumed (camelCase JSON):** `wrappedDek: string`, `wrapSalt: string`, `wrapIv: string`, added to `OfflineRosterUser`; encryption requires `formatVersion >= 2`.
- **Do NOT make the twelve seams async.** Entity encrypt/decrypt is synchronous (noble). Only `unwrapDek` is async (`crypto.subtle`), and it runs only in the async login flow.
- **`localStorage` stays ALWAYS ciphertext** for the six business keys once a DEK exists: encrypt on every write, decrypt on every read.
- **Preserve every existing fallback** (`|| '{}'`, `|| '[]'`, `!== '{}'`, nullable, truthy guards): decrypt FIRST, THEN apply the existing fallback.
- **Raw `getXJson` getters return DECRYPTED plaintext JSON** so the sync export keeps producing plaintext-inside-an-encrypted-zip.
- **Strict TDD:** failing test → run (FAIL) → minimal impl → run (PASS) → commit. Do NOT run `npm run build`. Do NOT run git.
- **Error-class convention:** `readonly name` + `Object.setPrototypeOf(this, X.prototype)`. Unwrap failure reuses wrong-password UX (mapped to `AUTH.INVALID_CREDENTIALS`).

---

## File Structure

| File | Created/Modified | Responsibility |
|---|---|---|
| `package.json` | Modified | Add `@noble/ciphers` dependency (sync AES-GCM). |
| `app/shared/lib/offline/data-key-store.ts` | Created | In-memory DEK singleton: `setDek` / `getDek` / `clearDek`. Never persisted. |
| `app/shared/lib/storage/entity-crypto.ts` | Created | `encryptEntity` / `decryptEntity` / `isEncrypted` + `MissingDataKeyError`; the `enc:v1:` envelope codec. |
| `app/shared/lib/offline/offline-crypto.ts` | Modified | Add async `unwrapDek(password, { wrappedDek, wrapSalt, wrapIv })` + `DekUnwrapError`. |
| `app/shared/lib/offline/roster-types.ts` | Modified | Add `wrappedDek` / `wrapSalt` / `wrapIv` to `OfflineRosterUser`. |
| `app/shared/lib/offline/entity-migration.ts` | Created | `migrateEntitiesToEncrypted(storeId)` — one-time, idempotent plaintext→ciphertext pass over the six keys. |
| `app/sales/lib/repositories/product-repository.ts` | Modified | Encrypt in `setProductsLocalStorage`; decrypt in `getProductsFromLocalStorage` + `getProductsJson`. |
| `app/sales/lib/repositories/product-category-repository.ts` | Modified | Encrypt in `setProductCategoriesLocalStorage`; decrypt in `getProductCategoriesFromLocalStorage` + `getCategoriesJson`. |
| `app/inventory/lib/services/inventory-offline-service.ts` | Modified | Encrypt in `setInventoriesLocalStorage`; decrypt in `getInventoriesFromLocalStorage` + `getInventoryEntriesJson`. |
| `app/sales/lib/services/order-offline-service.ts` | Modified | Encrypt in `setOrdersLocalStorage`; decrypt in `getOrdersFromLocalStorage` + `getOrdersJson`. |
| `app/expenses/lib/services/expense-offline-service.ts` | Modified | Encrypt in `setExpensesLocalStorage`; decrypt in `getExpensesFromLocalStorage`. |
| `app/sales/lib/services/sale-credit-offline-service.ts` | Modified | Encrypt in `setSaleCreditsLocalStorage`; decrypt in `getSaleCreditsFromLocalStorage`. |
| `app/shared/lib/stores/auth-store.ts` | Modified | Unwrap+setDek+migrate in `login`; `clearDek()` in `logout`. |
| `app/shared/lib/offline/offline-auth-service.ts` *(or `loginOffline`)* | Modified | Unwrap+setDek+migrate in the offline login path. |
| `app/auth/routes/loaders.ts` | Modified | Unlock gate: valid session + `getDek()===null` (encryption provisioned) → redirect to `/login` without logout; `guestOnlyLoader` renders login while DEK absent. |
| `app/auth/routes/login.tsx` | Modified | Map `DekUnwrapError` to the wrong-password message on both branches. |

---

### Task 1: Add `@noble/ciphers` dependency

**Files:**
- Modify: `package.json`

**Interfaces:** none (dependency only). Provides the synchronous `gcm` AES-GCM primitive used by `entity-crypto`.

- [ ] **Step 1: Add the dependency**

In `package.json`, under `"dependencies"` (keep alphabetical order — insert directly after the `@zip.js/zip.js` line):

```json
    "@noble/ciphers": "^1.3.0",
    "@zip.js/zip.js": "^2.8.26",
```

- [ ] **Step 2: Install** (the user runs this — do NOT run it yourself; note it for the executor)

```bash
# from the monorepo root, run by the user:
pnpm install
```

Verify the package resolves before writing Task 3 code: `node -e "require.resolve('@noble/ciphers/aes')"` from `frontend-react/apps/web-store-pos` should print a path.

- [ ] **Step 3: Commit**

```bash
git add package.json ../../pnpm-lock.yaml
git commit -m "build(web-store-pos): add @noble/ciphers for synchronous AES-GCM"
```

---

### Task 2: In-memory DEK store

**Files:**
- Create: `app/shared/lib/offline/data-key-store.ts`
- Test: `app/shared/lib/offline/__tests__/data-key-store.test.ts`

**Interfaces:**
- Produces:
  - `setDek(bytes: Uint8Array): void`
  - `getDek(): Uint8Array | null`
  - `clearDek(): void`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setDek, getDek, clearDek } from '../data-key-store';

describe('data-key-store', () => {
  beforeEach(() => clearDek());

  it('returns null before any key is set', () => {
    expect(getDek()).toBeNull();
  });

  it('stores and returns the DEK bytes', () => {
    const dek = new Uint8Array(32).fill(9);
    setDek(dek);
    expect(getDek()).toBe(dek);
  });

  it('clears the DEK', () => {
    setDek(new Uint8Array(32).fill(1));
    clearDek();
    expect(getDek()).toBeNull();
  });

  it('never touches localStorage', () => {
    setDek(new Uint8Array(32).fill(2));
    expect(localStorage.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/offline/__tests__/data-key-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/shared/lib/offline/data-key-store.ts

/**
 * In-memory-only Data Encryption Key (DEK) store. The raw DEK bytes live for the
 * lifetime of the tab and are NEVER written to localStorage/sessionStorage. Cleared
 * on logout and idle-lock so a cold boot always re-derives the key from the password.
 *
 * @author Lizardo Romero (lrscott83@gmail.com)
 */
let dek: Uint8Array | null = null;

export function setDek(bytes: Uint8Array): void {
  dek = bytes;
}

export function getDek(): Uint8Array | null {
  return dek;
}

export function clearDek(): void {
  dek = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/offline/__tests__/data-key-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/shared/lib/offline/data-key-store.ts app/shared/lib/offline/__tests__/data-key-store.test.ts
git commit -m "feat(web-store-pos): add in-memory DEK store"
```

---

### Task 3: Entity-crypto codec (`enc:v1:` envelope)

**Files:**
- Create: `app/shared/lib/storage/entity-crypto.ts`
- Test: `app/shared/lib/storage/__tests__/entity-crypto.test.ts`

**Interfaces:**
- Consumes: `getDek` (Task 2), `@noble/ciphers` `gcm`.
- Produces:
  - `encryptEntity(plaintext: string): string`
  - `decryptEntity(stored: string): string`
  - `isEncrypted(stored: string): boolean`
  - `class MissingDataKeyError extends Error`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { encryptEntity, decryptEntity, isEncrypted, MissingDataKeyError } from '../entity-crypto';
import { setDek, clearDek } from '~/shared/lib/offline/data-key-store';

const DEK = new Uint8Array(32).fill(7);

describe('entity-crypto', () => {
  beforeEach(() => {
    clearDek();
    setDek(DEK);
  });

  it('round-trips plaintext through the enc:v1: envelope', () => {
    const plaintext = JSON.stringify([['p1', { id: 'p1', name: 'Café' }]]);
    const stored = encryptEntity(plaintext);
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(stored).not.toContain('p1'); // ciphertext, not plaintext
    expect(decryptEntity(stored)).toBe(plaintext);
  });

  it('produces a fresh iv per write (ciphertext differs)', () => {
    const a = encryptEntity('same');
    const b = encryptEntity('same');
    expect(a).not.toBe(b);
    expect(decryptEntity(a)).toBe('same');
    expect(decryptEntity(b)).toBe('same');
  });

  it('isEncrypted only matches the marker', () => {
    expect(isEncrypted(encryptEntity('x'))).toBe(true);
    expect(isEncrypted('[]')).toBe(false);
    expect(isEncrypted('{}')).toBe(false);
    expect(isEncrypted('')).toBe(false);
  });

  it('passes through unmarked legacy plaintext unchanged', () => {
    expect(decryptEntity('[]')).toBe('[]');
    expect(decryptEntity('{"a":1}')).toBe('{"a":1}');
  });

  it('throws on a tampered ciphertext', () => {
    const stored = encryptEntity('secret-data');
    // flip a byte in the base64 body (after the marker)
    const body = stored.slice('enc:v1:'.length);
    const tampered = 'enc:v1:' + (body[10] === 'A' ? 'B' : 'A') + body.slice(1);
    expect(() => decryptEntity(tampered)).toThrow();
  });

  it('throws MissingDataKeyError when no DEK is set (encrypt)', () => {
    clearDek();
    expect(() => encryptEntity('x')).toThrow(MissingDataKeyError);
  });

  it('throws MissingDataKeyError when no DEK is set (decrypt of marked value)', () => {
    const stored = encryptEntity('x');
    clearDek();
    expect(() => decryptEntity(stored)).toThrow(MissingDataKeyError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/storage/__tests__/entity-crypto.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/shared/lib/storage/entity-crypto.ts
import { gcm } from '@noble/ciphers/aes';
import { getDek } from '~/shared/lib/offline/data-key-store';

/**
 * Synchronous per-entity AES-GCM codec. The stored envelope is
 * `enc:v1:` + Base64( iv(12) ‖ ciphertext ‖ tag(16) ). Kept synchronous (noble,
 * not crypto.subtle) so the twelve persistence seams stay synchronous.
 *
 * @author Lizardo Romero (lrscott83@gmail.com)
 */
const ENC_MARKER = 'enc:v1:';
const IV_LENGTH = 12;

export class MissingDataKeyError extends Error {
  readonly name = 'MissingDataKeyError';
  constructor(message = 'No data encryption key in memory') {
    super(message);
    Object.setPrototypeOf(this, MissingDataKeyError.prototype);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isEncrypted(stored: string): boolean {
  return typeof stored === 'string' && stored.startsWith(ENC_MARKER);
}

export function encryptEntity(plaintext: string): string {
  const dek = getDek();
  if (!dek) throw new MissingDataKeyError();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cipherWithTag = gcm(dek, iv).encrypt(new TextEncoder().encode(plaintext));
  const envelope = new Uint8Array(iv.length + cipherWithTag.length);
  envelope.set(iv, 0);
  envelope.set(cipherWithTag, iv.length);
  return ENC_MARKER + bytesToBase64(envelope);
}

export function decryptEntity(stored: string): string {
  if (!isEncrypted(stored)) return stored; // legacy plaintext — passthrough (migration §5.6)
  const dek = getDek();
  if (!dek) throw new MissingDataKeyError();
  const envelope = base64ToBytes(stored.slice(ENC_MARKER.length));
  const iv = envelope.slice(0, IV_LENGTH);
  const cipherWithTag = envelope.slice(IV_LENGTH);
  const plaintext = gcm(dek, iv).decrypt(cipherWithTag); // throws on tag mismatch
  return new TextDecoder().decode(plaintext);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/storage/__tests__/entity-crypto.test.ts`
Expected: PASS (7 tests). If the noble import path fails, confirm `@noble/ciphers` installed (Task 1) — the AES-GCM export is `@noble/ciphers/aes`.

- [ ] **Step 5: Commit**

```bash
git add app/shared/lib/storage/entity-crypto.ts app/shared/lib/storage/__tests__/entity-crypto.test.ts
git commit -m "feat(web-store-pos): add synchronous entity-crypto AES-GCM codec"
```

---

### Task 4: `unwrapDek` + roster-types extension

**Files:**
- Modify: `app/shared/lib/offline/roster-types.ts`
- Modify: `app/shared/lib/offline/offline-crypto.ts`
- Test: `app/shared/lib/offline/__tests__/unwrap-dek.test.ts`

**Interfaces:**
- Consumes: existing `sha256Base64`, `pbkdf2Base64`, and the private `base64ToBytes` helper in `offline-crypto.ts`.
- Produces:
  - `unwrapDek(password: string, wrap: { wrappedDek: string; wrapSalt: string; wrapIv: string }): Promise<Uint8Array>`
  - `class DekUnwrapError extends Error`
  - `OfflineRosterUser` gains `wrappedDek: string; wrapSalt: string; wrapIv: string`.

- [ ] **Step 1: Extend the roster type first** (no separate test — exercised via Step 2)

In `app/shared/lib/offline/roster-types.ts`, add the three fields to `OfflineRosterUser` right after `verifier`:

```ts
export interface OfflineRosterUser {
  id: string;
  login: string;
  fullName: string;
  isActive: boolean;
  roles: StoreModuleFeatures[];
  featureIds: number[];
  storeModuleIds: number[];
  isSuperAdmin: boolean;
  isOwnerAdmin: boolean;
  isReSeller: boolean;
  selectedStoreId: string;
  verifier: OfflineVerifier;
  // formatVersion >= 2 (at-rest encryption): the store DEK wrapped under this
  // user's KEK. All Base64. Absent on formatVersion 1 bundles.
  wrappedDek: string;
  wrapSalt: string;
  wrapIv: string;
}
```

- [ ] **Step 2: Write the failing test** (self-contained known-answer: wrap in the test with the SAME backend formula, then unwrap)

```ts
import { describe, it, expect } from 'vitest';
import { unwrapDek, DekUnwrapError } from '../offline-crypto';
import { sha256Base64, pbkdf2Base64 } from '../offline-crypto';

const WRAP_SALT = 'EjRWeBI0VngSNFZ4EjRWeA=='; // 16 bytes
const WRAP_IV = 'q83vASNFZ4mrze8B'; // 12 bytes

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Mirrors the backend StoreKeyWrapService: kek = PBKDF2(Base64(SHA256(pwd)), salt, 210000),
// wrappedDek = AES-GCM(dek) with tag appended.
async function wrapDekLikeBackend(password: string, dek: Uint8Array): Promise<string> {
  const kekBits = base64ToBytes(await pbkdf2Base64(await sha256Base64(password), WRAP_SALT, 210000));
  const kek = await crypto.subtle.importKey('raw', kekBits, 'AES-GCM', false, ['encrypt']);
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: base64ToBytes(WRAP_IV) },
    kek,
    dek as unknown as BufferSource,
  );
  return bytesToBase64(new Uint8Array(wrapped)); // ciphertext ‖ tag
}

describe('unwrapDek', () => {
  it('unwraps the DEK with the correct password (byte-for-byte backend parity)', async () => {
    const dek = new Uint8Array(32).map((_, i) => (i * 7) & 0xff);
    const wrappedDek = await wrapDekLikeBackend('secret', dek);
    const out = await unwrapDek('secret', { wrappedDek, wrapSalt: WRAP_SALT, wrapIv: WRAP_IV });
    expect(Array.from(out)).toEqual(Array.from(dek));
  });

  it('throws DekUnwrapError with a wrong password', async () => {
    const dek = new Uint8Array(32).fill(3);
    const wrappedDek = await wrapDekLikeBackend('secret', dek);
    await expect(
      unwrapDek('wrong', { wrappedDek, wrapSalt: WRAP_SALT, wrapIv: WRAP_IV }),
    ).rejects.toBeInstanceOf(DekUnwrapError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/offline/__tests__/unwrap-dek.test.ts`
Expected: FAIL — `unwrapDek`/`DekUnwrapError` not exported.

- [ ] **Step 4: Implement** (append to `app/shared/lib/offline/offline-crypto.ts`; reuse the file's existing private `base64ToBytes` and the exported `sha256Base64`/`pbkdf2Base64`)

```ts
export class DekUnwrapError extends Error {
  readonly name = 'DekUnwrapError';
  constructor(message = 'Failed to unwrap the data key (wrong password or corrupt roster)') {
    super(message);
    Object.setPrototypeOf(this, DekUnwrapError.prototype);
  }
}

/**
 * Reconstructs the store DEK from the roster's per-user wrap material. KEK derivation
 * matches the backend StoreKeyWrapService byte-for-byte:
 *   kek = PBKDF2( utf8(Base64(SHA256(utf8(password)))), base64Decode(wrapSalt), 210000, SHA-256, 32 )
 * The wrappedDek carries the 16-byte GCM tag CONCATENATED to the ciphertext, which is
 * exactly what crypto.subtle AES-GCM expects, so the whole buffer is passed to decrypt().
 */
export async function unwrapDek(
  password: string,
  wrap: { wrappedDek: string; wrapSalt: string; wrapIv: string },
): Promise<Uint8Array> {
  try {
    const kekBits = base64ToBytes(await pbkdf2Base64(await sha256Base64(password), wrap.wrapSalt, 210000));
    const kek = await crypto.subtle.importKey('raw', kekBits, 'AES-GCM', false, ['decrypt']);
    const dek = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(wrap.wrapIv) },
      kek,
      base64ToBytes(wrap.wrappedDek),
    );
    return new Uint8Array(dek);
  } catch {
    // AES-GCM auth failure => wrong password or corrupt roster. Surface as an
    // auth failure (login.tsx maps this to the wrong-password message).
    throw new DekUnwrapError();
  }
}
```

> `pbkdf2Base64` and `sha256Base64` must be `export`ed from `offline-crypto.ts` (they already are in the offline-auth plan). `base64ToBytes` is the file-private helper from that plan — reuse it in-file (do NOT re-declare). If it is not present, add the same 5-line helper used by `entity-crypto`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/offline/__tests__/unwrap-dek.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/shared/lib/offline/offline-crypto.ts app/shared/lib/offline/roster-types.ts \
        app/shared/lib/offline/__tests__/unwrap-dek.test.ts
git commit -m "feat(web-store-pos): add unwrapDek and roster wrap-DEK fields"
```

---

### Task 5: Products seam

**Files:**
- Modify: `app/sales/lib/repositories/product-repository.ts`
- Test: `app/sales/lib/repositories/__tests__/product-repository.crypto.test.ts`

**Interfaces:**
- Consumes: `encryptEntity` / `decryptEntity` (Task 3), `setDek` / `clearDek` (Task 2).
- Seams: write `setProductsLocalStorage` (:390), reads `getProductsFromLocalStorage` (:411) + `getProductsJson` (:385).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ProductRepository } from '../product-repository';
import { ProductCategoryRepository } from '../product-category-repository';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { setDek, clearDek } from '~/shared/lib/offline/data-key-store';
import { encryptEntity, MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';

const STORE = 's1';
const KEY = StorageKeys.entityKey('products', STORE);

function newRepo() {
  return new ProductRepository(STORE, new ProductCategoryRepository(STORE));
}

describe('product-repository at-rest encryption', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(new Uint8Array(32).fill(5));
  });

  it('writes ciphertext and reads back the same Map', () => {
    const repo = newRepo();
    const map = new Map<string, unknown>([['p1', { id: 'p1', name: 'Café', price: 10 }]]);
    repo.setInitProducts(map as never);

    const raw = localStorage.getItem(KEY)!;
    expect(raw.startsWith('enc:v1:')).toBe(true);
    expect(raw).not.toContain('Café');

    const back = new Map(JSON.parse(newRepo().getProductsJson()!));
    expect(back.get('p1')).toEqual(map.get('p1'));
  });

  it('getProductsJson returns decrypted plaintext JSON', () => {
    const seeded = JSON.stringify([['p1', { id: 'p1', name: 'Té' }]]);
    localStorage.setItem(KEY, encryptEntity(seeded));
    expect(newRepo().getProductsJson()).toBe(seeded);
  });

  it('throws MissingDataKeyError reading marked data without a DEK', () => {
    localStorage.setItem(KEY, encryptEntity('[]'));
    clearDek();
    expect(() => newRepo().getProductsJson()).toThrow(MissingDataKeyError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/sales/lib/repositories/__tests__/product-repository.crypto.test.ts`
Expected: FAIL — raw value is plaintext (no `enc:v1:` marker).

- [ ] **Step 3: Implement** (add the import and touch three methods; leave everything else 1:1)

Add near the top imports:

```ts
import { encryptEntity, decryptEntity } from '~/shared/lib/storage/entity-crypto';
```

`getProductsJson` (:385) — decrypt, preserve the `string | null` shape:

```ts
  getProductsJson(): string | null {
    const raw = localStorage.getItem(this.getStorageKey());
    return raw === null ? null : decryptEntity(raw);
  }
```

`setProductsLocalStorage` (:390) — encrypt before `setItem`:

```ts
  private setProductsLocalStorage(products: Map<string, Product>): void {
    const productMapJson = JSON.stringify(Array.from(products.entries()));
    localStorage.setItem(this.getStorageKey(), encryptEntity(productMapJson));
  }
```

`getProductsFromLocalStorage` (:411) — decrypt first, THEN the existing `!== '{}'` guard:

```ts
  private getProductsFromLocalStorage(): Map<string, Product> {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      const productMapJson = stored === null ? null : decryptEntity(stored);
      if (productMapJson && productMapJson !== '{}') {
        return new Map(JSON.parse(productMapJson));
      }
    } catch {
      // ignore — fall through to auto-init
    }
    const products = new Map<string, Product>();
    this.setProductsLocalStorage(products);
    return products;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/sales/lib/repositories/__tests__/product-repository.crypto.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/sales/lib/repositories/product-repository.ts \
        app/sales/lib/repositories/__tests__/product-repository.crypto.test.ts
git commit -m "feat(web-store-pos): encrypt products at rest"
```

---

### Task 6: Categories seam

**Files:**
- Modify: `app/sales/lib/repositories/product-category-repository.ts`
- Test: `app/sales/lib/repositories/__tests__/product-category-repository.crypto.test.ts`

**Interfaces:**
- Consumes: `encryptEntity` / `decryptEntity`, `setDek` / `clearDek`.
- Seams: write `setProductCategoriesLocalStorage` (:219), reads `getProductCategoriesFromLocalStorage` (:229) + `getCategoriesJson` (:203).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ProductCategoryRepository } from '../product-category-repository';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { setDek, clearDek } from '~/shared/lib/offline/data-key-store';
import { encryptEntity, MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';

const STORE = 's1';
const KEY = StorageKeys.entityKey('product-categories', STORE);

describe('product-category-repository at-rest encryption', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(new Uint8Array(32).fill(6));
  });

  it('writes ciphertext and reads back the same Map', () => {
    const repo = new ProductCategoryRepository(STORE);
    const map = new Map<string, unknown>([['c1', { id: 'c1', name: 'Bebidas' }]]);
    repo.setInitCategories(map as never);

    const raw = localStorage.getItem(KEY)!;
    expect(raw.startsWith('enc:v1:')).toBe(true);
    expect(raw).not.toContain('Bebidas');

    const back = new Map(JSON.parse(new ProductCategoryRepository(STORE).getCategoriesJson()!));
    expect(back.get('c1')).toEqual(map.get('c1'));
  });

  it('getCategoriesJson returns decrypted plaintext JSON', () => {
    const seeded = JSON.stringify([['c1', { id: 'c1', name: 'Snacks' }]]);
    localStorage.setItem(KEY, encryptEntity(seeded));
    expect(new ProductCategoryRepository(STORE).getCategoriesJson()).toBe(seeded);
  });

  it('throws MissingDataKeyError reading marked data without a DEK', () => {
    localStorage.setItem(KEY, encryptEntity('[]'));
    clearDek();
    expect(() => new ProductCategoryRepository(STORE).getCategoriesJson()).toThrow(MissingDataKeyError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/sales/lib/repositories/__tests__/product-category-repository.crypto.test.ts`
Expected: FAIL — raw value is plaintext.

- [ ] **Step 3: Implement**

Add import:

```ts
import { encryptEntity, decryptEntity } from '~/shared/lib/storage/entity-crypto';
```

`getCategoriesJson` (:203):

```ts
  getCategoriesJson(): string | null {
    const raw = localStorage.getItem(this.getStorageKey());
    return raw === null ? null : decryptEntity(raw);
  }
```

`setProductCategoriesLocalStorage` (:219):

```ts
  private setProductCategoriesLocalStorage(categories: Map<string, ProductCategory>): void {
    const categoryMapJson = JSON.stringify(Array.from(categories.entries()));
    localStorage.setItem(this.getStorageKey(), encryptEntity(categoryMapJson));
  }
```

`getProductCategoriesFromLocalStorage` (:229):

```ts
  private getProductCategoriesFromLocalStorage(): Map<string, ProductCategory> {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      const categoryMapJson = stored === null ? null : decryptEntity(stored);
      if (categoryMapJson && categoryMapJson !== '{}') {
        return new Map(JSON.parse(categoryMapJson));
      }
    } catch {
      // ignore — fall through to auto-init
    }
    const categories = new Map<string, ProductCategory>();
    this.setProductCategoriesLocalStorage(categories);
    return categories;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/sales/lib/repositories/__tests__/product-category-repository.crypto.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/sales/lib/repositories/product-category-repository.ts \
        app/sales/lib/repositories/__tests__/product-category-repository.crypto.test.ts
git commit -m "feat(web-store-pos): encrypt product categories at rest"
```

---

### Task 7: Inventory seam

**Files:**
- Modify: `app/inventory/lib/services/inventory-offline-service.ts`
- Test: `app/inventory/lib/services/__tests__/inventory-offline-service.crypto.test.ts`

**Interfaces:**
- Consumes: `encryptEntity` / `decryptEntity`, `setDek` / `clearDek`, `ProductRepository` + `ProductCategoryRepository` (constructor deps).
- Seams: write `setInventoriesLocalStorage` (:897), reads `getInventoriesFromLocalStorage` (:937) + `getInventoryEntriesJson` (:925). NOTE the inventory `getXJson` fallback is `|| '{}'` (literal `"{}"`, NOT `"[]"`).

- [ ] **Step 1: Write the failing test** (write seam is exercised via the auto-init-on-empty path in `getStorageInventoriesMap`)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryOfflineService } from '../inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { setDek, clearDek } from '~/shared/lib/offline/data-key-store';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';

const STORE = 's1';
const KEY = StorageKeys.entityKey('inventory-entries', STORE);

function newSvc() {
  return new InventoryOfflineService(STORE, new ProductRepository(STORE, new ProductCategoryRepository(STORE)));
}

describe('inventory-offline-service at-rest encryption', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(new Uint8Array(32).fill(4));
  });

  it('auto-init writes ciphertext; getInventoryEntriesJson decrypts to "{}"', () => {
    const svc = newSvc();
    svc.getStorageInventoriesMap(); // empty -> auto-init writes encrypted empty Map
    expect(localStorage.getItem(KEY)!.startsWith('enc:v1:')).toBe(true);
    // empty Map serialized as [] then decrypted, but the getter fallback is || '{}':
    // a written empty Map is '[]' (truthy) so the getter returns '[]', not the '{}' fallback.
    expect(svc.getInventoryEntriesJson()).toBe('[]');
  });

  it('decrypts on read and revives entry.date', () => {
    const seeded = JSON.stringify([
      ['prod-1', [{ id: 'e1', productId: 'prod-1', available: 3, isActive: true, date: new Date(0).toISOString() }]],
    ]);
    localStorage.setItem(KEY, encryptEntity(seeded));
    const map = newSvc().getStorageInventoriesMap();
    const entry = map.get('prod-1')![0]!;
    expect(entry.available).toBe(3);
    expect((entry as unknown as { date: Date }).date instanceof Date).toBe(true);
  });

  it('getInventoryEntriesJson returns "{}" when the key is missing (fallback preserved)', () => {
    expect(newSvc().getInventoryEntriesJson()).toBe('{}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/inventory/lib/services/__tests__/inventory-offline-service.crypto.test.ts`
Expected: FAIL — auto-init value is plaintext.

- [ ] **Step 3: Implement**

Add import:

```ts
import { encryptEntity, decryptEntity } from '~/shared/lib/storage/entity-crypto';
```

`setInventoriesLocalStorage` (:897):

```ts
  private setInventoriesLocalStorage(inventories: Map<string, InventoryEntry[]>): void {
    localStorage.setItem(
      this.getStorageKey(),
      encryptEntity(JSON.stringify(Array.from(inventories.entries()))),
    );
  }
```

`getInventoryEntriesJson` (:925) — decrypt first, THEN the `|| '{}'` fallback:

```ts
  getInventoryEntriesJson(): string {
    const raw = localStorage.getItem(this.getStorageKey());
    const plain = raw === null ? null : decryptEntity(raw);
    return plain || '{}';
  }
```

`getInventoriesFromLocalStorage` (:937) — decrypt first, THEN the existing `!== '{}'` guard and date revival:

```ts
  private getInventoriesFromLocalStorage(): Map<string, InventoryEntry[]> {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      const inventoriesJson = stored === null ? null : decryptEntity(stored);
      if (inventoriesJson && inventoriesJson !== '{}') {
        const inventoryMap: Map<string, InventoryEntry[]> = new Map(JSON.parse(inventoriesJson));
        inventoryMap.forEach((entries) => {
          entries.forEach((entry) => {
            (entry as unknown as { date: Date }).date = new Date(entry.date);
          });
        });
        return inventoryMap;
      }
    } catch {
      // ignore — fall through to auto-init
    }
    const inventories = new Map<string, InventoryEntry[]>();
    this.setInventoriesLocalStorage(inventories);
    return inventories;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/inventory/lib/services/__tests__/inventory-offline-service.crypto.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/inventory/lib/services/inventory-offline-service.ts \
        app/inventory/lib/services/__tests__/inventory-offline-service.crypto.test.ts
git commit -m "feat(web-store-pos): encrypt inventory entries at rest"
```

---

### Task 8: Orders seam

**Files:**
- Modify: `app/sales/lib/services/order-offline-service.ts`
- Test: `app/sales/lib/services/__tests__/order-offline-service.crypto.test.ts`

**Interfaces:**
- Consumes: `encryptEntity` / `decryptEntity`, `setDek` / `clearDek`.
- Seams: write `setOrdersLocalStorage` (:568), reads `getOrdersFromLocalStorage` (:591) + `getOrdersJson` (:563, `|| '[]'`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { OrderOfflineService } from '../order-offline-service';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { setDek, clearDek } from '~/shared/lib/offline/data-key-store';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';

const STORE = 's1';
const KEY = StorageKeys.entityKey('orders', STORE);

describe('order-offline-service at-rest encryption', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(new Uint8Array(32).fill(8));
  });

  it('auto-init writes ciphertext; getOrdersJson decrypts to "[]"', () => {
    const svc = new OrderOfflineService(STORE);
    svc.getStorageOrders(); // empty -> auto-init writes encrypted []
    expect(localStorage.getItem(KEY)!.startsWith('enc:v1:')).toBe(true);
    expect(svc.getOrdersJson()).toBe('[]');
  });

  it('decrypts on read and revives order.date', () => {
    const seeded = JSON.stringify([{ id: 'o1', total: 5, date: new Date(0).toISOString() }]);
    localStorage.setItem(KEY, encryptEntity(seeded));
    const orders = new OrderOfflineService(STORE).getStorageOrders();
    expect(orders[0]!.id).toBe('o1');
    expect(orders[0]!.date instanceof Date).toBe(true);
  });

  it('getOrdersJson returns "[]" when the key is missing (fallback preserved)', () => {
    expect(new OrderOfflineService(STORE).getOrdersJson()).toBe('[]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/sales/lib/services/__tests__/order-offline-service.crypto.test.ts`
Expected: FAIL — auto-init value is plaintext.

- [ ] **Step 3: Implement**

Add import:

```ts
import { encryptEntity, decryptEntity } from '~/shared/lib/storage/entity-crypto';
```

`getOrdersJson` (:563) — decrypt first, THEN `|| '[]'`:

```ts
  getOrdersJson(): string {
    const raw = localStorage.getItem(this.getStorageKey());
    const plain = raw === null ? null : decryptEntity(raw);
    return plain || '[]';
  }
```

`setOrdersLocalStorage` (:568):

```ts
  private setOrdersLocalStorage(orders: Order[]): void {
    localStorage.setItem(this.getStorageKey(), encryptEntity(JSON.stringify(orders)));
  }
```

`getOrdersFromLocalStorage` (:591) — decrypt first, THEN the existing truthy guard + revive/backfill map:

```ts
  private getOrdersFromLocalStorage(): Order[] {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      const ordersJson = stored === null ? null : decryptEntity(stored);
      if (ordersJson) {
        const orders = JSON.parse(ordersJson) as Order[];
        return orders.map((order) => this.reviveAndBackfillOrder(order));
      }
    } catch {
      // ignore — fall through to auto-init
    }
    this.setOrdersLocalStorage([]);
    return [];
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/sales/lib/services/__tests__/order-offline-service.crypto.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/sales/lib/services/order-offline-service.ts \
        app/sales/lib/services/__tests__/order-offline-service.crypto.test.ts
git commit -m "feat(web-store-pos): encrypt orders at rest"
```

---

### Task 9: Expenses seam

**Files:**
- Modify: `app/expenses/lib/services/expense-offline-service.ts`
- Test: `app/expenses/lib/services/__tests__/expense-offline-service.crypto.test.ts`

**Interfaces:**
- Consumes: `encryptEntity` / `decryptEntity`, `setDek` / `clearDek`.
- Seams: write `setExpensesLocalStorage` (:252), read `getExpensesFromLocalStorage` (:274). No `getXJson` getter for expenses.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ExpenseOfflineService } from '../expense-offline-service';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { setDek, clearDek } from '~/shared/lib/offline/data-key-store';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';

const STORE = 's1';
const KEY = StorageKeys.entityKey('expenses', STORE);

describe('expense-offline-service at-rest encryption', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(new Uint8Array(32).fill(11));
  });

  it('auto-init writes ciphertext', () => {
    const svc = new ExpenseOfflineService(STORE);
    expect(svc.getStorageExpenses()).toEqual([]); // empty -> auto-init writes encrypted []
    expect(localStorage.getItem(KEY)!.startsWith('enc:v1:')).toBe(true);
  });

  it('decrypts on read and revives date/createdDate/updatedDate', () => {
    const iso = new Date(0).toISOString();
    const seeded = JSON.stringify([{ id: 'x1', total: 9, date: iso, createdDate: iso, updatedDate: iso }]);
    localStorage.setItem(KEY, encryptEntity(seeded));
    const expenses = new ExpenseOfflineService(STORE).getStorageExpenses();
    expect(expenses[0]!.id).toBe('x1');
    expect((expenses[0] as unknown as { date: Date }).date instanceof Date).toBe(true);
    expect((expenses[0] as unknown as { createdDate: Date }).createdDate instanceof Date).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/expenses/lib/services/__tests__/expense-offline-service.crypto.test.ts`
Expected: FAIL — auto-init value is plaintext.

- [ ] **Step 3: Implement**

Add import:

```ts
import { encryptEntity, decryptEntity } from '~/shared/lib/storage/entity-crypto';
```

`setExpensesLocalStorage` (:252):

```ts
  private setExpensesLocalStorage(expenses: Expense[]): void {
    localStorage.setItem(this.getStorageKey(), encryptEntity(JSON.stringify(expenses)));
  }
```

`getExpensesFromLocalStorage` (:274) — decrypt first, THEN the existing truthy guard + revive map:

```ts
  private getExpensesFromLocalStorage(): Expense[] {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      const expensesJson = stored === null ? null : decryptEntity(stored);
      if (expensesJson) {
        const expenses = JSON.parse(expensesJson) as Expense[];
        return expenses.map((e) => this.reviveExpenseDates(e));
      }
    } catch {
      // ignore — fall through to auto-init
    }
    this.setExpensesLocalStorage([]);
    return [];
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/expenses/lib/services/__tests__/expense-offline-service.crypto.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/expenses/lib/services/expense-offline-service.ts \
        app/expenses/lib/services/__tests__/expense-offline-service.crypto.test.ts
git commit -m "feat(web-store-pos): encrypt expenses at rest"
```

---

### Task 10: Sale-credits seam

**Files:**
- Modify: `app/sales/lib/services/sale-credit-offline-service.ts`
- Test: `app/sales/lib/services/__tests__/sale-credit-offline-service.crypto.test.ts`

**Interfaces:**
- Consumes: `encryptEntity` / `decryptEntity`, `setDek` / `clearDek`.
- Seams: write `setSaleCreditsLocalStorage` (:377), read `getSaleCreditsFromLocalStorage` (:400). No `getXJson` getter for sale-credits. Storage entity key is `saleCredits` (camelCase — verified at `getCurrentStorageKey`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SaleCreditOfflineService } from '../sale-credit-offline-service';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { setDek, clearDek } from '~/shared/lib/offline/data-key-store';
import { encryptEntity } from '~/shared/lib/storage/entity-crypto';

const STORE = 's1';
const KEY = StorageKeys.entityKey('saleCredits', STORE);

describe('sale-credit-offline-service at-rest encryption', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(new Uint8Array(32).fill(12));
  });

  it('auto-init writes ciphertext', () => {
    const svc = new SaleCreditOfflineService(STORE);
    expect(svc.getStorageSaleCredits()).toEqual([]); // empty -> auto-init writes encrypted []
    expect(localStorage.getItem(KEY)!.startsWith('enc:v1:')).toBe(true);
  });

  it('decrypts on read and revives date/paidDate/createdDate/updatedDate', () => {
    const iso = new Date(0).toISOString();
    const seeded = JSON.stringify([
      { id: 'sc1', paid: 4, isActive: true, date: iso, paidDate: iso, createdDate: iso, updatedDate: iso },
    ]);
    localStorage.setItem(KEY, encryptEntity(seeded));
    const credits = new SaleCreditOfflineService(STORE).getStorageSaleCredits();
    expect(credits[0]!.id).toBe('sc1');
    expect((credits[0] as unknown as { date: Date }).date instanceof Date).toBe(true);
    expect((credits[0] as unknown as { paidDate: Date }).paidDate instanceof Date).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/sales/lib/services/__tests__/sale-credit-offline-service.crypto.test.ts`
Expected: FAIL — auto-init value is plaintext.

- [ ] **Step 3: Implement**

Add import:

```ts
import { encryptEntity, decryptEntity } from '~/shared/lib/storage/entity-crypto';
```

`setSaleCreditsLocalStorage` (:377):

```ts
  private setSaleCreditsLocalStorage(saleCredits: SaleCredit[]): void {
    localStorage.setItem(this.getStorageKey(), encryptEntity(JSON.stringify(saleCredits)));
  }
```

`getSaleCreditsFromLocalStorage` (:400) — decrypt first, THEN the existing truthy guard + revive map:

```ts
  private getSaleCreditsFromLocalStorage(): SaleCredit[] {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      const saleCreditsJson = stored === null ? null : decryptEntity(stored);
      if (saleCreditsJson) {
        const saleCredits = JSON.parse(saleCreditsJson) as SaleCredit[];
        return saleCredits.map((c) => this.reviveSaleCreditDates(c));
      }
    } catch {
      // ignore — fall through to auto-init
    }
    this.setSaleCreditsLocalStorage([]);
    return [];
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/sales/lib/services/__tests__/sale-credit-offline-service.crypto.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/sales/lib/services/sale-credit-offline-service.ts \
        app/sales/lib/services/__tests__/sale-credit-offline-service.crypto.test.ts
git commit -m "feat(web-store-pos): encrypt sale credits at rest"
```

---

### Task 11: One-time migration pass

**Files:**
- Create: `app/shared/lib/offline/entity-migration.ts`
- Test: `app/shared/lib/offline/__tests__/entity-migration.test.ts`

**Interfaces:**
- Consumes: `StorageKeys.entityKey` (existing), `encryptEntity` / `isEncrypted` (Task 3), `getDek` (Task 2).
- Produces: `migrateEntitiesToEncrypted(storeId: string): void` — rewrites any unmarked (legacy plaintext) value at the six entity keys through the encrypting write; idempotent via `isEncrypted`; no-ops if no DEK.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { migrateEntitiesToEncrypted } from '../entity-migration';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { setDek, clearDek } from '../data-key-store';
import { decryptEntity, isEncrypted } from '~/shared/lib/storage/entity-crypto';

const STORE = 's1';
const ENTITIES = ['products', 'product-categories', 'inventory-entries', 'orders', 'expenses', 'saleCredits'];

describe('entity-migration', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(new Uint8Array(32).fill(3));
  });

  it('encrypts every legacy-plaintext key in place, preserving content', () => {
    for (const e of ENTITIES) localStorage.setItem(StorageKeys.entityKey(e, STORE), `["legacy-${e}"]`);

    migrateEntitiesToEncrypted(STORE);

    for (const e of ENTITIES) {
      const raw = localStorage.getItem(StorageKeys.entityKey(e, STORE))!;
      expect(isEncrypted(raw)).toBe(true);
      expect(decryptEntity(raw)).toBe(`["legacy-${e}"]`);
    }
  });

  it('is idempotent — already-encrypted values are left untouched', () => {
    localStorage.setItem(StorageKeys.entityKey('orders', STORE), '["a"]');
    migrateEntitiesToEncrypted(STORE);
    const afterFirst = localStorage.getItem(StorageKeys.entityKey('orders', STORE));
    migrateEntitiesToEncrypted(STORE);
    expect(localStorage.getItem(StorageKeys.entityKey('orders', STORE))).toBe(afterFirst);
  });

  it('skips missing keys and no-ops without a DEK', () => {
    clearDek();
    localStorage.setItem(StorageKeys.entityKey('orders', STORE), '["a"]');
    migrateEntitiesToEncrypted(STORE);
    expect(localStorage.getItem(StorageKeys.entityKey('orders', STORE))).toBe('["a"]'); // untouched
    expect(localStorage.getItem(StorageKeys.entityKey('products', STORE))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/offline/__tests__/entity-migration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/shared/lib/offline/entity-migration.ts
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { encryptEntity, isEncrypted } from '~/shared/lib/storage/entity-crypto';
import { getDek } from './data-key-store';

/**
 * One-time, idempotent migration of legacy plaintext business data to the encrypted
 * envelope. Triggered right after the DEK is first set on unlock. Already-encrypted
 * values are skipped (isEncrypted), so running twice is harmless. No-ops without a DEK.
 *
 * @author Lizardo Romero (lrscott83@gmail.com)
 */
const ENCRYPTED_ENTITIES = [
  'products',
  'product-categories',
  'inventory-entries',
  'orders',
  'expenses',
  'saleCredits',
] as const;

export function migrateEntitiesToEncrypted(storeId: string): void {
  if (!getDek()) return;
  for (const entity of ENCRYPTED_ENTITIES) {
    const key = StorageKeys.entityKey(entity, storeId);
    const raw = localStorage.getItem(key);
    if (raw === null || isEncrypted(raw)) continue;
    localStorage.setItem(key, encryptEntity(raw));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/offline/__tests__/entity-migration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/shared/lib/offline/entity-migration.ts \
        app/shared/lib/offline/__tests__/entity-migration.test.ts
git commit -m "feat(web-store-pos): add one-time plaintext-to-ciphertext migration"
```

---

### Task 12: Unlock gate + wire unwrap into login paths + clear-on-logout/idle

**Files:**
- Modify: `app/shared/lib/stores/auth-store.ts`
- Modify: `app/shared/lib/offline/offline-auth-service.ts` *(the `loginOffline` action or `authenticateOffline` caller from the offline-auth plan)*
- Modify: `app/auth/routes/loaders.ts`
- Modify: `app/auth/routes/login.tsx`
- Test: `app/shared/lib/stores/__tests__/auth-store.dek.test.ts`
- Test: `app/auth/routes/__tests__/loaders.unlock.test.ts`

**Interfaces:**
- Consumes: `unwrapDek` (Task 4), `setDek` / `getDek` / `clearDek` (Task 2), `migrateEntitiesToEncrypted` (Task 11), `findRosterUser` (offline-auth Task 3).
- Produces: DEK set on both login paths; DEK cleared on logout/idle; unlock gate in loaders.

- [ ] **Step 1: Write the failing test — online login sets the DEK and migrates**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../auth-store';
import { getDek, clearDek } from '~/shared/lib/offline/data-key-store';
import { importRoster } from '~/shared/lib/offline/roster-store';
import { sha256Base64, pbkdf2Base64 } from '~/shared/lib/offline/offline-crypto';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { decryptEntity, isEncrypted } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const WRAP_SALT = 'EjRWeBI0VngSNFZ4EjRWeA==';
const WRAP_IV = 'q83vASNFZ4mrze8B';

function bytesToBase64(b: Uint8Array): string { let s=''; for (let i=0;i<b.length;i++) s+=String.fromCharCode(b[i]!); return btoa(s); }
function base64ToBytes(b64: string): Uint8Array { const bin=atob(b64); const o=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) o[i]=bin.charCodeAt(i); return o; }

async function wrapDekLikeBackend(password: string, dek: Uint8Array): Promise<string> {
  const kekBits = base64ToBytes(await pbkdf2Base64(await sha256Base64(password), WRAP_SALT, 210000));
  const kek = await crypto.subtle.importKey('raw', kekBits, 'AES-GCM', false, ['encrypt']);
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: base64ToBytes(WRAP_IV) }, kek, dek as unknown as BufferSource);
  return bytesToBase64(new Uint8Array(wrapped));
}

describe('auth-store online login DEK unwrap', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  it('unwraps the DEK, sets it, and migrates legacy plaintext', async () => {
    const dek = new Uint8Array(32).map((_, i) => (i + 1) & 0xff);
    const wrappedDek = await wrapDekLikeBackend('secret', dek);
    const bundle: OfflineRosterBundle = {
      bundleId: 'b1', issuedAt: 1, expiresAt: Date.now() + 1_000_000, formatVersion: 2, storeId: 's1',
      users: [{ id: 'u1', login: 'ana', fullName: 'Ana', isActive: true, roles: [], featureIds: [], storeModuleIds: [],
        isSuperAdmin: false, isOwnerAdmin: true, isReSeller: false, selectedStoreId: 's1',
        verifier: { hash: 'h', salt: 's', iterations: 210000 }, wrappedDek, wrapSalt: WRAP_SALT, wrapIv: WRAP_IV }],
    };
    importRoster(bundle);
    // legacy plaintext orders exist before unlock
    localStorage.setItem(StorageKeys.entityKey('orders', 's1'), '["legacy"]');

    // Mock the HTTP login to succeed and getMe to return the roster user identity.
    vi.doMock('~/shared/lib/http/auth-http-service', () => ({
      authHttpService: {
        login: async () => ({ succeeded: true, data: { authToken: 't1' }, errors: [] }),
        getMe: async () => ({ id: 'u1', login: 'ana', selectedStoreId: 's1', isOwnerAdmin: true }),
      },
    }));

    await useAuthStore.getState().login('ana', 'secret');

    expect(getDek()).not.toBeNull();
    const migrated = localStorage.getItem(StorageKeys.entityKey('orders', 's1'))!;
    expect(isEncrypted(migrated)).toBe(true);
    expect(decryptEntity(migrated)).toBe('["legacy"]');
    vi.doUnmock('~/shared/lib/http/auth-http-service');
  });
});
```

> The exact `vi.doMock` shape for `auth-http-service` must match how `auth-store` dynamically imports it (`await import('../http/auth-http-service')`). Confirm `getMe` returns a `login` and `selectedStoreId` so `findRosterUser(user.login)` and the migrate call resolve. If the existing `auth-store.test.ts` already establishes a mock pattern for these, mirror it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/stores/__tests__/auth-store.dek.test.ts`
Expected: FAIL — `login` does not set a DEK.

- [ ] **Step 3: Implement the auth-store wiring**

Add a static import at the top (side-effect-free module):

```ts
import { clearDek } from '../../offline/data-key-store';
```

In `login`, after `const user = await get().getUserByToken();` and the `if (!user) …` guard, before `set({ isLoading: false })`, insert the unwrap+migrate block:

```ts
      // At-rest encryption: reconstruct the store DEK from this user's roster wrap
      // material (formatVersion >= 2). No entry / no wrap fields => encryption not
      // provisioned for this store; skip silently (legacy plaintext mode).
      const { findRosterUser } = await import('../../offline/roster-store');
      const rosterEntry = findRosterUser(user.login);
      if (rosterEntry && rosterEntry.wrappedDek) {
        const { unwrapDek } = await import('../../offline/offline-crypto');
        const { setDek } = await import('../../offline/data-key-store');
        const { migrateEntitiesToEncrypted } = await import('../../offline/entity-migration');
        const dek = await unwrapDek(password, {
          wrappedDek: rosterEntry.wrappedDek,
          wrapSalt: rosterEntry.wrapSalt,
          wrapIv: rosterEntry.wrapIv,
        });
        setDek(dek);
        migrateEntitiesToEncrypted(user.selectedStoreId);
      }
```

> A `DekUnwrapError` thrown here propagates through the existing `catch (err)` in `login` (which rethrows), so `login.tsx` surfaces it as an auth failure (Step 6).

In `logout`, add `clearDek()` as the first line:

```ts
  logout: () => {
    clearDek(); // at-rest encryption: drop the in-memory DEK so a cold boot re-unlocks
    localStorage.removeItem(StorageKeys.AUTH_MODEL);
    set({ user: null, isAuthenticated: false, error: null });
    const pathname = window.location.pathname;
    if (pathname !== '/login' && pathname !== '/') {
      authRedirect?.('/login');
    }
  },
```

> The offline-auth idle timer already calls `useAuthStore.getState().logout()` on idle (offline-auth plan Task 9), so `clearDek()` here covers BOTH logout and idle-lock — no separate idle wiring needed.

- [ ] **Step 4: Wire the offline login path** (in `loginOffline` from the offline-auth plan, or in `authenticateOffline`)

In the `loginOffline` action (`auth-store.ts`, added by offline-auth Task 5), after `authenticateOffline` resolves and before `get().setUser(user, user.authToken)`:

```ts
    const user = await authenticateOffline(login, password);
    const { findRosterUser } = await import('../../offline/roster-store');
    const rosterEntry = findRosterUser(login);
    if (rosterEntry && rosterEntry.wrappedDek) {
      const { unwrapDek } = await import('../../offline/offline-crypto');
      const { setDek } = await import('../../offline/data-key-store');
      const { migrateEntitiesToEncrypted } = await import('../../offline/entity-migration');
      const dek = await unwrapDek(password, {
        wrappedDek: rosterEntry.wrappedDek,
        wrapSalt: rosterEntry.wrapSalt,
        wrapIv: rosterEntry.wrapIv,
      });
      setDek(dek);
      migrateEntitiesToEncrypted(user.selectedStoreId);
    }
    get().setUser(user, user.authToken);
```

> Offline `authenticateOffline` already verified the password against the roster verifier, so the unwrap should always succeed here; a `DekUnwrapError` means a corrupt roster and correctly propagates to the `login.tsx` offline catch.

- [ ] **Step 5: Write the failing test — unlock gate**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { authLoader, guestOnlyLoader } from '../loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { setDek, clearDek } from '~/shared/lib/offline/data-key-store';
import { importRoster } from '~/shared/lib/offline/roster-store';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

function provisionEncryptedRoster() {
  const bundle: OfflineRosterBundle = {
    bundleId: 'b1', issuedAt: 1, expiresAt: Date.now() + 1_000_000, formatVersion: 2, storeId: 's1',
    users: [{ id: 'u1', login: 'ana', fullName: 'Ana', isActive: true, roles: [], featureIds: [], storeModuleIds: [],
      isSuperAdmin: false, isOwnerAdmin: true, isReSeller: false, selectedStoreId: 's1',
      verifier: { hash: 'h', salt: 's', iterations: 210000 }, wrappedDek: 'w', wrapSalt: 's', wrapIv: 'i' }],
  };
  importRoster(bundle);
}

const USER = { id: 'u1', login: 'ana', selectedStoreId: 's1', isOwnerAdmin: true } as never;

describe('unlock gate', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    useAuthStore.setState({ user: USER, isAuthenticated: true, isLoading: false, error: null });
    localStorage.setItem(StorageKeys.AUTH_MODEL, JSON.stringify({ authToken: 't', expiresIn: Date.now() + 1e9 }));
  });

  it('authLoader redirects a valid session with no DEK to /login WITHOUT logout', async () => {
    provisionEncryptedRoster();
    const res = await authLoader();
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get('Location')).toBe('/login');
    // session + roster intact (no logout):
    expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).not.toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('authLoader passes once the DEK is present', async () => {
    provisionEncryptedRoster();
    setDek(new Uint8Array(32).fill(1));
    expect(await authLoader()).toBeNull();
  });

  it('authLoader passes when encryption is NOT provisioned (no wrapped DEK)', async () => {
    // no roster -> no unlock requirement (legacy plaintext mode)
    expect(await authLoader()).toBeNull();
  });

  it('guestOnlyLoader renders /login while the DEK is absent (no bounce to home)', async () => {
    provisionEncryptedRoster();
    expect(await guestOnlyLoader()).toBeNull();
  });

  it('guestOnlyLoader redirects to home once the DEK is present', async () => {
    provisionEncryptedRoster();
    setDek(new Uint8Array(32).fill(1));
    const res = await guestOnlyLoader();
    expect((res as Response).status).toBe(302);
  });
});
```

- [ ] **Step 6: Implement the loaders gate**

Add imports at the top of `app/auth/routes/loaders.ts`:

```ts
import { getDek } from '~/shared/lib/offline/data-key-store';
import { findRosterUser } from '~/shared/lib/offline/roster-store';
import type { UserModel } from '@store-mgmt/domain';
```

Add a shared helper (below `denyAccess`):

```ts
// At-rest encryption unlock gate: a valid session whose store has an encrypted
// roster (formatVersion >= 2 with a wrapped DEK for this user) but no DEK in memory
// must re-authenticate on the login screen so unwrapDek can restore the key. We do
// NOT logout here — session + roster stay intact so the re-login can complete offline.
function needsUnlock(user: UserModel): boolean {
  if (getDek() !== null) return false;
  const entry = findRosterUser(user.login);
  return !!(entry && entry.wrappedDek);
}
```

In `authLoader`, add the gate after the auth check:

```ts
export async function authLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) {
    return denyAccess();
  }
  if (needsUnlock(user)) {
    return redirect('/login'); // no logout — preserve session + roster
  }
  return null;
}
```

Apply the same gate to `featureGate` (covers `featureLoader`, `adminFeatureLoader`, `resellerFeatureLoader`) right after its auth check:

```ts
function featureGate(requiredFeatureIds: number[], storeIdParam?: string) {
  return async ({ params }: LoaderFunctionArgs): Promise<Response | null> => {
    const { user, isAuthenticated } = getAuthState();
    if (!user || !isAuthenticated) {
      return denyAccess();
    }
    if (needsUnlock(user)) {
      return redirect('/login');
    }
    const storeId = storeIdParam ?? (params['storeId'] as string | undefined);
    if (!isUserAuthorized(user, requiredFeatureIds, storeId)) {
      return denyAccess();
    }
    return null;
  };
}
```

Also gate `featureLoader`'s owner/super-admin bypass so it cannot skip the unlock:

```ts
export function featureLoader(requiredFeatureIds: number[], storeIdParam?: string) {
  return async (args: LoaderFunctionArgs): Promise<Response | null> => {
    const { user, isAuthenticated } = getAuthState();
    if (!user || !isAuthenticated) {
      return denyAccess();
    }
    if (needsUnlock(user)) {
      return redirect('/login');
    }
    if (user.isSuperAdmin || user.isOwnerAdmin) {
      return null;
    }
    return featureGate(requiredFeatureIds, storeIdParam)(args);
  };
}
```

Change `guestOnlyLoader` so it only bounces an authenticated user away from `/login` when the DEK is present:

```ts
export async function guestOnlyLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (isAuthenticated && user && getDek() !== null) {
    preloadHeavyChunks();
    return redirect(await resolveUserHomePath(user));
  }
  return null;
}
```

> `adminLoader` / `superAdminLoader` / `resellerLoader` guard admin/reseller screens, which do NOT touch the six encrypted entity services, so they are intentionally left ungated to keep the diff minimal. If a future admin screen reads encrypted data, add `needsUnlock` there too.

- [ ] **Step 7: Map `DekUnwrapError` in `login.tsx`**

The online branch already rethrows through `login`; add a `DekUnwrapError` check in the existing `catch (err)` so it shows the wrong-password message. Add the import and, at the top of the catch body (after `setIsSubmitting(false)`):

```ts
import { DekUnwrapError } from '~/shared/lib/offline/offline-crypto';
```

```ts
    } catch (err: unknown) {
      setIsSubmitting(false);
      if (err instanceof DekUnwrapError) {
        setErrors({ form: intl.formatMessage({ id: 'AUTH.INVALID_CREDENTIALS' }) });
        return;
      }
      // ...existing loginRejectionDescription / status handling unchanged...
```

For the OFFLINE branch (added by offline-auth plan Task 6), extend its `offlineErrorMessageId(err)` helper so `DekUnwrapError` maps to `'AUTH.INVALID_CREDENTIALS'` (same as `OfflineInvalidPasswordError`).

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run app/shared/lib/stores/__tests__/auth-store.dek.test.ts app/auth/routes/__tests__/loaders.unlock.test.ts`
Expected: PASS. Then confirm no regression in the existing auth/login suites:
`npx vitest run app/shared/lib/stores/__tests__/auth-store.test.ts app/auth/routes/__tests__/login.test.tsx`

- [ ] **Step 9: Commit**

```bash
git add app/shared/lib/stores/auth-store.ts app/shared/lib/offline/offline-auth-service.ts \
        app/auth/routes/loaders.ts app/auth/routes/login.tsx \
        app/shared/lib/stores/__tests__/auth-store.dek.test.ts \
        app/auth/routes/__tests__/loaders.unlock.test.ts
git commit -m "feat(web-store-pos): unlock gate and DEK unwrap on login paths"
```

---

### Task 13: Full-suite green

- [ ] **Step 1: Run the whole frontend test suite**

Run: `npx vitest run` (from `frontend-react/apps/web-store-pos`)
Expected: PASS, including the six seam suites, entity-crypto, unwrap-dek, migration, DEK/unlock-gate, and all pre-existing suites (auth-store, loaders cold-boot, data-serializer, login, offline-auth). No regressions.

- [ ] **Step 2: Manual smoke (documented, not automated)**

Record in the PR description:
1. Provision an encryption roster (`formatVersion: 2`) and log in online → `getDek()` is set; six entity keys become `enc:v1:` ciphertext.
2. Kill/reload the app (DEK gone) → routed to `/login`; re-enter the same password → data readable again (online or offline).
3. `localStorage` dump while locked → all six business keys are `enc:v1:` ciphertext.
4. Sync export → produces plaintext-inside-encrypted-zip (unchanged file format), sync import → re-encrypts at rest.
5. Wrong password on the unlock screen → same error surface as a wrong-password login.
6. Idle 1h → redirected to `/login`, DEK cleared; re-login restores it.

- [ ] **Step 3: Commit the smoke checklist**

```bash
git add docs/plans/2026-07-25-at-rest-encryption-frontend-plan.md
git commit -m "docs(web-store-pos): record at-rest encryption smoke checklist"
```

---

## Self-Review

- **Spec coverage (design §5–§8):** sync-crypto constraint → entity-crypto is noble/synchronous, seams stay sync (T3, T5–T10); in-memory DEK store (T2); DEK unwrap on login (T4) wired into online + offline paths (T12); login-screen unlock gate (T12 loaders); entity codec + twelve seams (T3, T5–T10 — six write + six read, `getXJson` decrypt included where present: products/categories/inventory/orders; expenses/sale-credits have no `getXJson`, matching the design table); migration (T11); error handling `MissingDataKeyError` + `DekUnwrapError` reusing wrong-password UX (T3, T4, T12); dependency (T1). Covered.
- **Type/name consistency (verified identical across tasks):** `setDek`/`getDek`/`clearDek` (T2 → T3, T11, T12); `encryptEntity`/`decryptEntity`/`isEncrypted` (T3 → T5–T11); `unwrapDek(password, { wrappedDek, wrapSalt, wrapIv })` (T4 → T12); `migrateEntitiesToEncrypted(storeId)` (T11 → T12); `MissingDataKeyError` (T3), `DekUnwrapError` (T4 → T12 login.tsx). Aligned.
- **Envelope/KEK invariants:** `enc:v1:` + Base64(iv‖ct‖tag), fresh 12-byte iv (T3); KEK = PBKDF2(Base64(SHA256(pwd)), wrapSalt, 210000, SHA-256, 32), tag-appended AES-GCM matching backend (T4). Aligned with the pinned contract.
- **Fallback preservation:** every seam decrypts BEFORE applying the original guard — `!== '{}'` (products/categories/inventory), `|| '{}'` (inventory `getXJson`), `|| '[]'` (orders `getXJson`), truthy guards (orders/expenses/sale-credits reads), `string | null` (`getProductsJson`/`getCategoriesJson`). Verified against the read excerpts.
- **Storage keys verified against code:** `products`, `product-categories`, `inventory-entries`, `orders`, `expenses`, `saleCredits` (camelCase) — the migration list matches each `getCurrentStorageKey`.
- **Placeholder scan:** no TODO/TBD; every code step has real TypeScript + real vitest. UI mapping (T12 Step 7) reuses existing message ids and the existing catch structure rather than inventing UX.
- **Inconsistency resolved during authoring:** the design §5.4 says gate on `getDek() === null` unconditionally, which would DEADLOCK a legitimate session on a store that has no encrypted roster (unwrap can never produce a DEK, so the gate would loop forever). Resolved by gating on `needsUnlock` = `getDek() === null` AND an encrypted roster entry (`wrappedDek` present) exists — faithful to the intent (encryption requires a `formatVersion >= 2` roster per §7) while avoiding the deadlock for non-provisioned stores. Documented in T12 and the Global Constraints.
```
