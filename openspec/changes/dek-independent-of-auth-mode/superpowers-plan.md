# Encryption Independent of the Authentication Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the at-rest encryption key independent of how the user authenticates, so stored data is never silently destroyed and is always recoverable from the server.

**Architecture:** The store key is derived by the backend (HKDF over a master secret plus the store id) and today reaches the device only inside the administrator-gated offline roster. Three frontend changes break that coupling: the app stops inventing a key when it cannot find one, stops writing over data it could not read, and announces every decryption failure by signing the user out onto the login screen — which is where both recovery routes already live. A fourth change, gated on a backend contract another team owns, lets an ordinary online login carry the key.

**Tech Stack:** React 19 + React Router 7 (SPA mode), TypeScript, Zustand, Vitest + Testing Library, Playwright, `@noble/ciphers` (AES-GCM), localStorage + IndexedDB.

**Spec:** `openspec/changes/dek-independent-of-auth-mode/superpowers-design.md`

## Global Constraints

- **E2E tests are untouchable.** Never modify, delete, rename, skip or weaken an existing E2E test or an existing file under `frontend-react/e2e/support/`. Adding new spec files and new support files is allowed. This is non-negotiable and applies to every task and every subagent.
- **No backend production code in Stage 1.** The backend contract is another team's work item. Touching backend production source requires explicit user approval first.
- **Branch:** `feat/dek-independent-of-auth-mode`, created from `main` at `bac165d9`.
- **Do not run** `dotnet` or Playwright in the agent environment. Unit gates only: `npx turbo run test --force`, `npx turbo run typecheck --force`, `npx turbo run lint --force`, all from `frontend-react/`. The user runs Playwright.
- **Turbo cache:** every gate cited as evidence must use `--force`.
- **UI copy is Spanish**, added to `app/shared/lib/i18n/es.ts`. Code, identifiers and comments are English.
- **Commit style:** conventional commits. Never add AI attribution or `Co-Authored-By`.
- **Storage key format:** `lizoft.store-${entity}-${storeId}` via `StorageKeys.entityKey`.
- **Encryption envelope prefix:** `enc:v1:` (`ENTITY_ENVELOPE_PREFIX`).

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `app/shared/lib/storage/read-entity-or-throw.ts` | The three-state read at the storage boundary, plus the `EntityUnreadableError` type. One place, six consumers. |
| `app/shared/lib/storage/__tests__/read-entity-or-throw.test.ts` | Tests for the above. |
| `app/shared/lib/storage/decryption-failure-policy.ts` | Classifies an error as a decryption failure and runs the app-wide response (message + sign out). |
| `app/shared/lib/storage/__tests__/decryption-failure-policy.test.ts` | Tests for the above. |
| `e2e/roster-recovery.spec.ts` | New E2E: roster swap recovery, bytes untouched on failure, failure signs out, login refuses. |
| `e2e/support/entity-storage.ts` | New E2E support: read raw stored entity bytes, seed a corrupt envelope. |

**Modified**

| File | Change |
|---|---|
| `app/sales/lib/repositories/product-category-repository.ts:237-249` | Read via the helper; the swallow-and-overwrite goes. |
| `app/sales/lib/repositories/product-repository.ts:421-432` | Same. |
| `app/sales/lib/services/order-offline-service.ts:601-612` | Same. |
| `app/inventory/lib/services/inventory-offline-service.ts:950-961` | Same. |
| `app/sales/lib/services/sale-credit-offline-service.ts:395-406` | Same. |
| `app/expenses/lib/services/expense-offline-service.ts:280-291` | Same. |
| `app/shared/lib/offline/dek-provisioning.ts:161-166` | The mint is replaced by `DekUnwrapError`. |
| `app/shared/lib/offline/dek-provisioning.ts:191-212` | Reconciliation adopts the server key instead of only logging. |
| `app/sales/routes/products.tsx` | The eight `runGuardedAgainstMissingDek` call sites are unwired. |
| `app/shared/lib/storage/run-guarded-against-missing-dek.ts` | Deleted, with its test file. |
| `app/root.tsx:71-110` | Registers the global policy listeners. |
| `app/auth/routes/loaders.ts` | The login gate refuses a device that cannot open its own data. |
| `app/shared/lib/i18n/es.ts` | New messages. |

**Deleted**

- `app/shared/lib/storage/run-guarded-against-missing-dek.ts`
- `app/shared/lib/storage/__tests__/run-guarded-against-missing-dek.test.ts`

---

## Stage 1 — Frontend only (no backend dependency)

### Task 1: The three-state read helper

**Files:**
- Create: `frontend-react/apps/web-store-pos/app/shared/lib/storage/read-entity-or-throw.ts`
- Test: `frontend-react/apps/web-store-pos/app/shared/lib/storage/__tests__/read-entity-or-throw.test.ts`

**Interfaces:**
- Consumes: `decryptEntity`, `MissingDataKeyError` from `./entity-crypto`.
- Produces:
  - `readEntityOrThrow<T>(storageKey: string, parse: (plaintext: string) => T | null): T | null`
  - `class EntityUnreadableError extends Error` with `readonly name = 'EntityUnreadableError'`, `readonly storageKey: string`, `readonly reason: unknown`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readEntityOrThrow, EntityUnreadableError } from '../read-entity-or-throw';
import { MissingDataKeyError } from '../entity-crypto';
import { setDek, clearDek } from '../data-key-store';

const KEY = 'lizoft.store-product-categories-s1';

describe('readEntityOrThrow', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when the key is absent — a genuinely new store', () => {
    expect(readEntityOrThrow(KEY, (json) => JSON.parse(json))).toBeNull();
  });

  it('returns the parsed value for readable plaintext', () => {
    localStorage.setItem(KEY, '[["a",{"id":"a"}]]');
    expect(readEntityOrThrow(KEY, (json) => new Map(JSON.parse(json)))).toEqual(
      new Map([['a', { id: 'a' }]]),
    );
  });

  it('lets the parse callback veto with null, without treating it as a failure', () => {
    localStorage.setItem(KEY, '{}');
    expect(readEntityOrThrow(KEY, (json) => (json === '{}' ? null : JSON.parse(json)))).toBeNull();
  });

  it('propagates MissingDataKeyError unchanged, so the policy can tell the two failures apart', () => {
    localStorage.setItem(KEY, 'enc:v1:AAAA');
    expect(() => readEntityOrThrow(KEY, (json) => JSON.parse(json))).toThrow(MissingDataKeyError);
  });

  it('wraps a decrypt failure that is NOT a missing key in EntityUnreadableError', () => {
    setDek(new Uint8Array(32), 's1');
    // A well-formed envelope whose GCM tag cannot verify under this key.
    localStorage.setItem(KEY, 'enc:v1:' + Buffer.alloc(60).toString('base64'));
    expect(() => readEntityOrThrow(KEY, (json) => JSON.parse(json))).toThrow(EntityUnreadableError);
  });

  it('wraps a parse failure in EntityUnreadableError', () => {
    localStorage.setItem(KEY, 'not json at all');
    expect(() =>
      readEntityOrThrow(KEY, (json) => JSON.parse(json) as unknown),
    ).toThrow(EntityUnreadableError);
  });

  it('NEVER writes to storage on any failure path', () => {
    localStorage.setItem(KEY, 'enc:v1:AAAA');
    const before = localStorage.getItem(KEY);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    expect(() => readEntityOrThrow(KEY, (json) => JSON.parse(json))).toThrow();
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/storage/__tests__/read-entity-or-throw.test.ts`
Expected: FAIL — `Failed to resolve import "../read-entity-or-throw"`.

- [ ] **Step 3: Write the implementation**

```ts
import { decryptEntity } from './entity-crypto';

/**
 * A stored entity exists but cannot be turned back into a value: its ciphertext
 * failed to authenticate, or its plaintext failed to parse. Distinct from
 * `MissingDataKeyError`, which means the bytes are fine and the key is not here
 * — that one is recoverable, this one is not, and the two owe the user
 * different messages (design D5).
 */
export class EntityUnreadableError extends Error {
  readonly name = 'EntityUnreadableError';
  constructor(
    readonly storageKey: string,
    readonly reason: unknown,
  ) {
    super(`Stored entity at "${storageKey}" could not be read`);
    Object.setPrototypeOf(this, EntityUnreadableError.prototype);
  }
}

/**
 * The three-state read at the storage boundary (design D4):
 *   - key absent            -> `null`; the caller may auto-initialise, because
 *                              "no data" is a genuinely new store.
 *   - key present, readable -> the parsed value (or `null` if `parse` vetoes,
 *                              e.g. the empty-map sentinel `'{}'`).
 *   - key present, unreadable -> THROWS. Never returns, and never writes.
 *
 * The last state is the whole point. The six entity read paths used to catch it
 * and write an empty value over the unreadable one, turning an intact store into
 * an empty one. Since every mutation reads before it writes, throwing here also
 * stops the mutation — no separate write guard is needed.
 *
 * `MissingDataKeyError` passes through unchanged; everything else becomes
 * `EntityUnreadableError`, so callers upstream can tell "recoverable" from
 * "damaged" without string-matching.
 */
export function readEntityOrThrow<T>(
  storageKey: string,
  parse: (plaintext: string) => T | null,
): T | null {
  const stored = localStorage.getItem(storageKey);
  if (stored === null) return null;

  let plaintext: string | null;
  try {
    plaintext = decryptEntity(stored);
  } catch (err) {
    // Matched on `name`, not `instanceof`: entity-crypto is reachable through
    // more than one module instance in tests, so class identity is not
    // guaranteed (same precedent as auth-store's SessionRejectedError note).
    if ((err as { name?: string })?.name === 'MissingDataKeyError') throw err;
    throw new EntityUnreadableError(storageKey, err);
  }

  if (plaintext === null) return null;

  try {
    return parse(plaintext);
  } catch (err) {
    throw new EntityUnreadableError(storageKey, err);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/storage/__tests__/read-entity-or-throw.test.ts`
Expected: PASS, 7/7.

- [ ] **Step 5: Typecheck**

Run: `cd frontend-react && npx turbo run typecheck --force`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/shared/lib/storage/read-entity-or-throw.ts frontend-react/apps/web-store-pos/app/shared/lib/storage/__tests__/read-entity-or-throw.test.ts
git commit -m "feat(storage): add a three-state entity read that never writes on failure"
```

---

### Task 2: Wire the six entity read paths to the helper

**Files:**
- Modify: `app/sales/lib/repositories/product-category-repository.ts:237-249`
- Modify: `app/sales/lib/repositories/product-repository.ts:421-432`
- Modify: `app/sales/lib/services/order-offline-service.ts:601-612`
- Modify: `app/inventory/lib/services/inventory-offline-service.ts:950-961`
- Modify: `app/sales/lib/services/sale-credit-offline-service.ts:395-406`
- Modify: `app/expenses/lib/services/expense-offline-service.ts:280-291`
- Test: each entity's existing test file, extended (these are unit tests, not E2E — modifying them is allowed)

**Interfaces:**
- Consumes: `readEntityOrThrow`, `EntityUnreadableError` from Task 1.
- Produces: no new exports. The six private read methods now throw instead of returning an empty collection when storage is unreadable.

- [ ] **Step 1: Write the failing tests**

Add this pair to **each** of the six entities' existing unit test files, substituting the entity's own storage key, service/repository constructor and read method. Shown for categories; repeat literally for the other five rather than referring back to this one.

```ts
import { EntityUnreadableError } from '~/shared/lib/storage/read-entity-or-throw';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';

it('throws instead of returning an empty map when the stored categories cannot be read', () => {
  localStorage.setItem('lizoft.store-product-categories-s1', 'enc:v1:AAAA');
  const repo = new ProductCategoryRepository('s1');
  expect(() => repo.getProductCategories()).toThrow(MissingDataKeyError);
});

it('leaves the unreadable bytes byte-for-byte intact', () => {
  const bytes = 'enc:v1:AAAA';
  localStorage.setItem('lizoft.store-product-categories-s1', bytes);
  const repo = new ProductCategoryRepository('s1');
  expect(() => repo.getProductCategories()).toThrow();
  expect(localStorage.getItem('lizoft.store-product-categories-s1')).toBe(bytes);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend-react/apps/web-store-pos && npx vitest run app/sales app/inventory app/expenses`
Expected: FAIL — the reads currently return an empty collection and overwrite storage, so both assertions fail (no throw; stored value replaced).

- [ ] **Step 3: Rewrite the six read methods**

`product-category-repository.ts` — replace lines 237-249:

```ts
  private getProductCategoriesFromLocalStorage(): Map<string, ProductCategory> {
    // design D4: an unreadable store propagates and is never written over. The
    // auto-init below survives only for its honest case — no stored value at
    // all, i.e. a genuinely new store.
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json && json !== '{}' ? new Map<string, ProductCategory>(JSON.parse(json)) : null,
    );
    if (stored) return stored;

    const categories = new Map<string, ProductCategory>();
    this.setProductCategoriesLocalStorage(categories);
    return categories;
  }
```

`product-repository.ts` — replace lines 421-432:

```ts
  private getProductsFromLocalStorage(): Map<string, Product> {
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json && json !== '{}' ? new Map<string, Product>(JSON.parse(json)) : null,
    );
    if (stored) return stored;

    const products = new Map<string, Product>();
    this.setProductsLocalStorage(products);
    return products;
  }
```

`order-offline-service.ts` — replace lines 601-612:

```ts
  private getOrdersFromLocalStorage(): Order[] {
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json ? (JSON.parse(json) as Order[]).map((order) => this.reviveAndBackfillOrder(order)) : null,
    );
    if (stored) return stored;

    this.setOrdersLocalStorage([]);
    return [];
  }
```

`inventory-offline-service.ts` — replace lines 950-961, keeping the existing date-revival body inside the parse callback:

```ts
  private getInventoriesFromLocalStorage(): Map<string, InventoryEntry[]> {
    const stored = readEntityOrThrow(this.getStorageKey(), (json) => {
      if (!json || json === '{}') return null;
      const inventoryMap = new Map<string, InventoryEntry[]>(JSON.parse(json));
      inventoryMap.forEach((entries) => {
        entries.forEach((entry) => {
          (entry as unknown as { date: Date }).date = new Date(entry.date);
        });
      });
      return inventoryMap;
    });
    if (stored) return stored;

    const inventories = new Map<string, InventoryEntry[]>();
    this.setInventoriesLocalStorage(inventories);
    return inventories;
  }
```

`sale-credit-offline-service.ts` — replace lines 395-406:

```ts
  private getSaleCreditsFromLocalStorage(): SaleCredit[] {
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json ? (JSON.parse(json) as SaleCredit[]).map((c) => this.reviveSaleCreditDates(c)) : null,
    );
    if (stored) return stored;

    this.setSaleCreditsLocalStorage([]);
    return [];
  }
```

`expense-offline-service.ts` — replace lines 280-291:

```ts
  private getExpensesFromLocalStorage(): Expense[] {
    const stored = readEntityOrThrow(this.getStorageKey(), (json) =>
      json ? (JSON.parse(json) as Expense[]).map((e) => this.reviveExpenseDates(e)) : null,
    );
    if (stored) return stored;

    this.setExpensesLocalStorage([]);
    return [];
  }
```

Add `import { readEntityOrThrow } from '~/shared/lib/storage/read-entity-or-throw';` to each of the six files.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd frontend-react/apps/web-store-pos && npx vitest run app/sales app/inventory app/expenses`
Expected: PASS.

- [ ] **Step 5: Full unit gate — pre-existing tests may legitimately break here**

Run: `cd frontend-react && npx turbo run test --force`

Any pre-existing test that asserted "unreadable storage yields an empty collection" is asserting the defect. **Do not silently rewrite it.** Report each one by name to the user with the assertion it makes, and wait. Pre-existing tests that assert the *absent-key* auto-init must still pass untouched — if one of those breaks, the implementation is wrong, not the test.

- [ ] **Step 6: Commit**

```bash
git add frontend-react/apps/web-store-pos/app
git commit -m "fix(storage): stop overwriting entity data that could not be read"
```

---

### Task 3: The app stops inventing keys, and the server's key wins

**Files:**
- Modify: `app/shared/lib/offline/dek-provisioning.ts:161-166` (the mint) and `:189-212` (reconciliation)
- Test: `app/shared/lib/offline/__tests__/dek-provisioning.test.ts` (existing file, extended)

**Interfaces:**
- Consumes: `DekUnwrapError` (already exported from `dek-provisioning.ts`), `bytesEqual`, `unwrapDek`.
- Produces: `resolveDekForLogin` keeps its signature `(args: { login: string; password: string; sessionStoreId: string }) => Promise<void>` and now rejects with `DekUnwrapError` where it previously minted.

- [ ] **Step 1: Write the failing tests**

```ts
it('refuses to mint a key when nothing can supply the server key', async () => {
  localStorage.clear();
  await expect(
    resolveDekForLogin({ login: 'jdoe', password: 'pw', sessionStoreId: 's1' }),
  ).rejects.toThrow(DekUnwrapError);
});

it('writes nothing to storage when it refuses', async () => {
  localStorage.clear();
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  await expect(
    resolveDekForLogin({ login: 'jdoe', password: 'pw', sessionStoreId: 's1' }),
  ).rejects.toThrow();
  expect(setItem).not.toHaveBeenCalled();
});

it('adopts the roster key over a disagreeing local key, instead of only logging', async () => {
  // Arrange: a device table holding key A, and a roster wrap holding key B.
  await seedDeviceTableWithDek(KEY_A, 'jdoe', 'pw', 's1');
  seedRosterWithDek(KEY_B, 'jdoe', 'pw', 's1');

  await resolveDekForLogin({ login: 'jdoe', password: 'pw', sessionStoreId: 's1' });

  // The server's key is the authority — the roster carries it, the local table does not.
  expect(getDek()).toEqual(KEY_B);
  expect(readDeviceDekTable()?.conflictDetectedAt).toBeDefined();
});
```

`seedDeviceTableWithDek` and `seedRosterWithDek` are local test helpers in this file; write them with `wrapDekWithPassword` and the roster shape already used by the file's existing tests.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/offline/__tests__/dek-provisioning.test.ts`
Expected: FAIL — the first two because a key is minted and persisted rather than refused; the third because the local key is kept.

- [ ] **Step 3: Remove the mint**

Replace lines 161-166:

```ts
    } else {
      // design D2: no device table, no roster wrap, and nothing on the login
      // response — there is no way to obtain the key the SERVER derives for this
      // store. Minting a random local key here (the old behaviour) produced data
      // no roster and no online login could ever recover. Refusing destroys
      // nothing; minting destroyed silently.
      throw new DekUnwrapError();
    }
```

The `source`/`tableStoreId` assignments in that branch go with it; `source` is now only ever `'roster'`.

- [ ] **Step 4: Make reconciliation act**

Replace the body of the `if (!bytesEqual(fromRoster, dek))` block at lines 194-206:

```ts
      if (!bytesEqual(fromRoster, dek)) {
        const bundle = getRawRoster();
        workingTable = workingTable ?? {
          formatVersion: 1,
          dekSource: source ?? 'roster',
          storeId: tableStoreId ?? getDekStoreId() ?? sessionStoreId,
          device: null,
          users: {},
        };
        workingTable.conflictDetectedAt = Date.now();
        workingTable.conflictStoreId = bundle?.storeId;
        console.error(CONFLICT_LOG_MARKER, { conflictStoreId: workingTable.conflictStoreId });

        // design D3: the server's key is the authority. Detecting the
        // disagreement and keeping the local key (the old behaviour) made
        // "import a fresh roster" a no-op on any device that had drifted — the
        // recovery route the business rules depend on did nothing at all.
        dek = fromRoster;
        setDek(dek, bundle?.storeId ?? sessionStoreId);
        workingTable.device = null; // re-wrapped for the adopted key at step 5
      }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/offline`
Expected: PASS.

- [ ] **Step 6: Full unit gate**

Run: `cd frontend-react && npx turbo run test --force`

`auth-store.dek.test.ts` and the `dek-provisioning` suite contain tests written against the minting behaviour. Report each by name to the user before changing any of them.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/shared/lib/offline
git commit -m "fix(offline): never mint a local data key, and let the server key win reconciliation"
```

---

### Task 4: One global decryption-failure policy

**Files:**
- Create: `app/shared/lib/storage/decryption-failure-policy.ts`
- Test: `app/shared/lib/storage/__tests__/decryption-failure-policy.test.ts`
- Modify: `app/root.tsx:71-110`, `app/shared/lib/i18n/es.ts`
- Modify: `app/sales/routes/products.tsx` (unwire the eight guard call sites)
- Delete: `app/shared/lib/storage/run-guarded-against-missing-dek.ts` and its test

**Interfaces:**
- Consumes: `MissingDataKeyError`, `EntityUnreadableError` (Task 1), `showBlockingError` from `~/shared/lib/blocking-alert`, `useAuthStore` from `~/shared/lib/stores/auth-store`.
- Produces:
  - `classifyDecryptionFailure(error: unknown): 'missing-key' | 'damaged' | null`
  - `handleDecryptionFailure(error: unknown): boolean` — returns whether it handled the error.
  - `registerDecryptionFailurePolicy(): () => void` — installs the `unhandledrejection` listener, returns an unsubscribe.

- [ ] **Step 1: Write the failing tests**

```ts
describe('classifyDecryptionFailure', () => {
  it('classifies a missing key as recoverable', () => {
    expect(classifyDecryptionFailure(new MissingDataKeyError())).toBe('missing-key');
  });

  it('classifies unreadable bytes as damaged', () => {
    expect(classifyDecryptionFailure(new EntityUnreadableError('k', new Error('tag')))).toBe('damaged');
  });

  it('classifies anything else as not ours — the policy must never become a catch-all', () => {
    expect(classifyDecryptionFailure(new TypeError('unrelated'))).toBeNull();
    expect(classifyDecryptionFailure(undefined)).toBeNull();
  });
});

describe('handleDecryptionFailure', () => {
  it('shows the recoverable message and signs the user out on a missing key', () => {
    expect(handleDecryptionFailure(new MissingDataKeyError())).toBe(true);
    expect(showBlockingErrorMock).toHaveBeenCalledWith(
      'Error',
      'No se pudo abrir la información de esta tienda. Inicie sesión con conexión o importe un roster para recuperarla.',
    );
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('tells the truth on damaged data — no promise of recovery — and still signs out', () => {
    expect(handleDecryptionFailure(new EntityUnreadableError('k', new Error('tag')))).toBe(true);
    expect(showBlockingErrorMock).toHaveBeenCalledWith(
      'Error',
      'La información guardada en este dispositivo está dañada y no se pudo leer. No se borró nada.',
    );
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all for an unrelated error', () => {
    expect(handleDecryptionFailure(new TypeError('unrelated'))).toBe(false);
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('shows one message per failure even when several arrive together', () => {
    handleDecryptionFailure(new MissingDataKeyError());
    handleDecryptionFailure(new MissingDataKeyError());
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
```

The last test pins a real hazard: a page that loads categories and products in parallel produces two rejections for one cause, and the user must not be shown two dialogs. Implement it with a module-level latch that resets on the next successful login.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend-react/apps/web-store-pos && npx vitest run app/shared/lib/storage/__tests__/decryption-failure-policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the policy**

```ts
import { EntityUnreadableError } from './read-entity-or-throw';

export type DecryptionFailureKind = 'missing-key' | 'damaged';

/**
 * Matched on `name`, never `instanceof`: these errors cross dynamic-import
 * boundaries, so class identity is not guaranteed to be the one this module
 * closed over.
 */
export function classifyDecryptionFailure(error: unknown): DecryptionFailureKind | null {
  const name = (error as { name?: string } | null | undefined)?.name;
  if (name === 'MissingDataKeyError') return 'missing-key';
  if (name === 'EntityUnreadableError') return 'damaged';
  return null;
}

// One dialog per failure, not one per rejected promise: a screen that loads two
// entities in parallel produces two rejections from a single cause.
let announced = false;

/** Cleared by a successful login, so a later failure is announced again. */
export function resetDecryptionFailureLatch(): void {
  announced = false;
}

export function handleDecryptionFailure(error: unknown): boolean {
  const kind = classifyDecryptionFailure(error);
  if (kind === null) return false;
  if (announced) return true;
  announced = true;

  const { showBlockingError } = require('~/shared/lib/blocking-alert');
  const messages = require('~/shared/lib/i18n/es').default;
  showBlockingError(
    messages['GENERAL.ERROR'],
    kind === 'missing-key'
      ? messages['ENCRYPTION.KEY_UNAVAILABLE']
      : messages['ENCRYPTION.DATA_DAMAGED'],
  );

  const { useAuthStore } = require('~/shared/lib/stores/auth-store');
  useAuthStore.getState().logout();
  return true;
}

export function registerDecryptionFailurePolicy(): () => void {
  const onRejection = (event: PromiseRejectionEvent) => {
    if (handleDecryptionFailure(event.reason)) event.preventDefault();
  };
  window.addEventListener('unhandledrejection', onRejection);
  return () => window.removeEventListener('unhandledrejection', onRejection);
}
```

Replace the `require(...)` calls with static ESM imports; they are written that way above only to show which module each symbol comes from. Static imports are correct here — this module is not on the cold-boot path that `auth-store.ts`'s dynamic-import note protects.

- [ ] **Step 4: Add the messages**

In `app/shared/lib/i18n/es.ts`:

```ts
  'ENCRYPTION.KEY_UNAVAILABLE':
    'No se pudo abrir la información de esta tienda. Inicie sesión con conexión o importe un roster para recuperarla.',
  'ENCRYPTION.DATA_DAMAGED':
    'La información guardada en este dispositivo está dañada y no se pudo leer. No se borró nada.',
```

- [ ] **Step 5: Register the listeners in the root**

In `app/root.tsx`'s `App()`, alongside the existing effects:

```tsx
  // design D5: one app-wide response to a decryption failure, rather than a
  // guard at each of the ~20 authenticated routes that read entity storage.
  // Rejected promises arrive here; a throw during render or in a loader is
  // caught by the ErrorBoundary below, which calls the same handler.
  useEffect(() => registerDecryptionFailurePolicy(), []);
```

And at the top of the existing `ErrorBoundary`:

```tsx
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (handleDecryptionFailure(error)) return null;
  // ...existing body unchanged
```

- [ ] **Step 6: Reset the latch on a successful login**

The latch is what keeps one cause from producing several dialogs, but left alone
it also silences every failure after the first for the lifetime of the tab. Wire
its reset into the one event that means "this device can read again": a login
that resolved a key.

In `auth-store.ts`, immediately after `resolveDekForLogin` resolves in **both**
`login()` and `loginOffline()`:

```ts
      resetDecryptionFailureLatch();
```

Add the matching test to the Task 4 suite:

```ts
it('announces again after a successful login cleared the latch', () => {
  handleDecryptionFailure(new MissingDataKeyError());
  resetDecryptionFailureLatch();
  handleDecryptionFailure(new MissingDataKeyError());
  expect(showBlockingErrorMock).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 7: Unwire the eight guard call sites in `products.tsx`**

Every `runGuardedAgainstMissingDek(fn, title, message)` becomes a direct `await fn()` / `fn()`, and the `succeeded` / `mutationSucceeded` booleans revert to the call's own result. With the global policy in place, a per-call-site guard would show a second dialog for the same failure. Delete `run-guarded-against-missing-dek.ts` and its test file.

The two pre-existing `handleClearData` repaint-failure tests and the `handleCsvImport` suite must keep passing unmodified; if one needs changing, stop and report it.

- [ ] **Step 8: Run the gates**

Run: `cd frontend-react && npx turbo run test --force`
Run: `cd frontend-react && npx turbo run typecheck --force`
Run: `cd frontend-react && npx turbo run lint --force`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend-react/apps/web-store-pos/app
git commit -m "feat(storage): announce decryption failures app-wide and sign the user out"
```

---

### Task 5: The login refuses a device that cannot open its own data

**Files:**
- Modify: `app/auth/routes/loaders.ts` (`guestOnlyLoader`), `app/auth/routes/login.tsx`
- Test: `app/auth/routes/__tests__/loaders.test.ts` (existing file, extended)

**Interfaces:**
- Consumes: `DekUnwrapError` from `~/shared/lib/offline/dek-provisioning`, `handleDecryptionFailure` from Task 4.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```ts
it('refuses the login and reports the reason when the device holds data it cannot open', async () => {
  seedEncryptedEntity('lizoft.store-product-categories-s1');
  clearDek();

  await expect(submitLogin({ login: 'jdoe', password: 'pw' })).rejects.toThrow(DekUnwrapError);
  expect(showBlockingErrorMock).toHaveBeenCalledWith(
    'Error',
    'No se pudo abrir la información de esta tienda. Inicie sesión con conexión o importe un roster para recuperarla.',
  );
  expect(localStorage.getItem('lizoft.store-product-categories-s1')).toBe(SEEDED_BYTES);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend-react/apps/web-store-pos && npx vitest run app/auth`
Expected: FAIL — the login currently succeeds by minting (before Task 3) or rejects without reporting (after Task 3).

- [ ] **Step 3: Route the login failure through the policy**

In the login submit handler, a rejected `login()` / `loginOffline()` is offered to `handleDecryptionFailure` before the generic credential-error path. `DekUnwrapError` is classified as `'missing-key'` — extend `classifyDecryptionFailure` to map `name === 'DekUnwrapError'` to `'missing-key'`, and add a test for that mapping in the Task 4 suite.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend-react/apps/web-store-pos && npx vitest run app/auth app/shared/lib/storage`
Expected: PASS.

- [ ] **Step 5: Full gate and commit**

```bash
git add frontend-react/apps/web-store-pos/app
git commit -m "feat(auth): refuse a login when the device cannot open its stored data"
```

---

### Task 6: End-to-end coverage that does not need the backend contract

**Files:**
- Create: `frontend-react/e2e/roster-recovery.spec.ts`
- Create: `frontend-react/e2e/support/entity-storage.ts`

**Constraint:** no existing spec or existing `e2e/support/*` file may be modified. Both files here are new.

**Interfaces:**
- Consumes: existing support modules (`LoginPage`, `plantRoster`, `seedCategoryAndProduct`, `readStoredRoster`, `buildRosterBundle`) — read-only, unmodified.
- Produces: `readEntityBytes(page, entity, storeId): Promise<string | null>` and `seedDamagedEntity(page, entity, storeId): Promise<void>` in the new support file.

- [ ] **Step 0: Write the new support module**

`frontend-react/e2e/support/entity-storage.ts` — new file, so no existing support
module is touched:

```ts
import type { Page } from '@playwright/test';

/** Mirrors `StorageKeys.entityKey` (app/shared/lib/storage/storage-keys.ts:8-9). */
export function entityKey(entity: string, storeId: string): string {
  return `lizoft.store-${entity}-${storeId}`;
}

/**
 * The RAW stored string, ciphertext included — never the decrypted value. The
 * point of these assertions is that the bytes on disk did not change, so the
 * comparison has to happen on the bytes, not on what the app renders from them.
 */
export async function readEntityBytes(
  page: Page,
  entity: string,
  storeId: string,
): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), entityKey(entity, storeId));
}
```

- [ ] **Step 1: Write E2E 4 — a failed read leaves the bytes untouched**

```ts
import { test, expect } from './support/fixtures';
import { LoginPage } from './support/login-page';
import { plantRoster, uniqueLogin, KAT_PASSWORD } from './support/roster-fixture';
import { seedCategoryAndProduct } from './support/store-seed';
import { readEntityBytes } from './support/entity-storage';

test('un fallo de descifrado no toca un solo byte de lo guardado', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const login = uniqueLogin('bytes');

  await loginPage.goto();
  const activation = await plantRoster(page, { users: [{ login }] });
  await loginPage.fill({ login, password: KAT_PASSWORD });
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);

  await seedCategoryAndProduct(page, `E2E Bytes ${login}`);

  // La precondición, pineada: hay bytes guardados y están cifrados. Sin esto,
  // "los bytes no cambiaron" no distingue "se preservaron" de "nunca hubo nada".
  const before = await readEntityBytes(page, 'products', activation.storeId);
  expect(before).not.toBeNull();
  expect(before!.startsWith('enc:v1:')).toBe(true);

  // Salir libera la clave en memoria; volver a `/sales/products` fuerza una
  // lectura sin clave, que es el fallo que antes escribía un valor vacío encima.
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.waitForURL(/\/login$/);
  await page.goto('/sales/products');

  expect(await readEntityBytes(page, 'products', activation.storeId)).toBe(before);
});
```

- [ ] **Step 2: Write the remaining three specs**

Same file, same imports, same shape — precondition pinned first, then the single
behaviour under test.

**E2E 1 — the roster swap recovers the data.** Import a roster, sign in, create a
category and a product, sign out, delete the roster from the login screen (the
disable button in the offline-access panel plus its SweetAlert confirmation),
import a second roster for the same store, sign in again, and assert the product
name is visible. Pin the precondition that the first roster is gone
(`readStoredRoster(page)` returns `null`) before importing the second, so a pass
cannot come from the original roster never having been removed.

**E2E 5 — a failure while signed in announces itself.** Same failure trigger as
E2E 4, then assert the message text from `ENCRYPTION.KEY_UNAVAILABLE` is visible
and the URL settles on `/login`.

**E2E 6 — the login refuses a device that cannot open its data.** After E2E 4's
sign-out, delete the roster so no key source remains, then attempt to sign in and
assert three things: the refusal message is shown, the URL is still `/login`, and
`readEntityBytes` matches the value captured before the attempt.

**E2E 1 — roster swap recovers the data.** Import a roster, sign in, create a category and a product, sign out, delete the roster from the login screen, import a second roster for the same store, sign in again — the product is on screen. This is the roster half of business rule 3.

**E2E 4 — a failed read leaves the bytes untouched.** Read the raw stored bytes for the products entity, force a failure (sign out, which releases the key, then drive a read), assert the stored bytes are byte-for-byte identical afterwards. This is the only assertion that proves rule 2; write it as an exact string comparison of the raw `localStorage` value, never as "the product still renders".

**E2E 5 — a failure while signed in announces itself.** Provoke a decryption failure inside the app; the message appears and the session ends on `/login`. Assert both the message text and the URL.

**E2E 6 — the login refuses a device that cannot open its data.** Seed an encrypted entity with no recoverable key, attempt to sign in, assert the refusal message, assert the URL is still `/login`, and assert the stored bytes are unchanged.

- [ ] **Step 2: Hand the suite to the user to run**

The agent does not run Playwright. Commit and push, then report the exact command:

```
cd frontend-react && pnpm test:e2e
```

- [ ] **Step 3: Commit**

```bash
git add frontend-react/e2e
git commit -m "test(e2e): cover roster recovery, untouched bytes, and login refusal"
```

---

## Stage 2 — Gated on the backend contract

Do not start these tasks until the login response carries `wrappedDek`, `wrapSalt` and `wrapIv`. Verify by inspecting a real login response, not by reading a ticket.

### Task 7: Adopt the key from the login response

**Files:**
- Modify: `app/shared/lib/offline/dek-provisioning.ts`, `app/shared/lib/stores/auth-store.ts:297-298`, `app/shared/lib/http/auth-http-service.ts` types
- Test: `app/shared/lib/offline/__tests__/dek-provisioning.test.ts`

- [ ] **Step 1: Write the failing test** — an online login whose response carries a wrap, on a device with no table and no roster, sets exactly that key and creates the device table from it.
- [ ] **Step 2: Run it to verify it fails** (the device has no source, so Task 3's `DekUnwrapError` fires).
- [ ] **Step 3: Add the login-response wrap as source 3**, ahead of the roster, in `resolveDekForLogin`. Empty fields mean "absent", per the backend contract's rule 4.
- [ ] **Step 4: Run the tests**, then the full gate.
- [ ] **Step 5: Commit** — `feat(offline): take the data key from the login response`

### Task 8: End-to-end coverage of the online recovery

**Files:** extend `frontend-react/e2e/roster-recovery.spec.ts` (created in Task 6, so extending it is allowed — it is not a pre-existing E2E file)

- [ ] **Step 1: E2E 2** — import a roster, create data, delete the roster, sign in **online**, see the data.
- [ ] **Step 2: E2E 3** — create data signed in **online**, then sign in **offline**, see the data; and the reverse. This single test proves business rule 1 on its own.
- [ ] **Step 3:** Both specs must obtain their roster from the running backend, not from the pinned known-answer fixture. A synthetic roster carries a key the real server never derived, so a test built on it would pass while proving nothing about recovery.
- [ ] **Step 4: Commit** — `test(e2e): cover online recovery and cross-mode key independence`

---

## Verification checklist

- [ ] `npx turbo run test --force` passes; totals reported.
- [ ] `npx turbo run typecheck --force` and `npx turbo run lint --force` pass.
- [ ] No file under `frontend-react/e2e/` that existed before this change has been modified — verify with `git diff --stat main..HEAD -- frontend-react/e2e`.
- [ ] No backend production file has been modified — verify with `git diff --stat main..HEAD -- backend/`.
- [ ] All six entity read paths route through `readEntityOrThrow`; `grep` for the old `// ignore — fall through to auto-init` returns nothing.
- [ ] `dek-provisioning.ts` contains no `crypto.getRandomValues` mint.
- [ ] `run-guarded-against-missing-dek.ts` and its test are deleted, and `products.tsx` no longer imports it.
- [ ] The absent-key auto-init still works for all six entities — a brand-new store initialises normally.
- [ ] Playwright run by the user, green, totals reported.
