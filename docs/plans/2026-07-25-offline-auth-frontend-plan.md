# Offline Auth — Frontend (React PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a device authenticate store users **offline** by (1) an admin exporting an encrypted roster bundle, (2) provisioning a device by importing it with the master password, and (3) logging in offline: the typed password is verified against a per-user PBKDF2 verifier, then the same `UserModel` an online login produces is hydrated so existing loaders/guards work unchanged. Two timers: 1h inactivity locks the user; 35 days expires the bundle.

**Architecture:** New modules under `app/shared/lib/offline/` (crypto, bundle serializer, roster storage + anti-replay, offline-auth service, idle timer). The auth store gains a `loginOffline` action that hydrates via the existing `setUser` seam. `login.tsx` gets an offline branch (currently it only warns). A `auth/provision` route imports bundles; the existing `management/users` list gets an "Export offline roster" action that calls the new backend endpoint and downloads the encrypted file.

**Tech Stack:** React Router v7 (SPA, `ssr:false`), Zustand, `@zip.js/zip.js`, Web Crypto (`crypto.subtle` — confirmed available in browser AND vitest/jsdom, no mock needed), Vitest + jsdom. App root: `frontend-react/apps/web-store-pos`.

## Global Constraints

- **Verifier algorithm (MUST match the backend byte-for-byte):** PBKDF2-HMAC-**SHA256**; **iterations = 210000**; **salt = 16 bytes, Base64**; **derived key = 32 bytes, Base64**; **PBKDF2 password input = the UTF-8 bytes of the `Base64(SHA256(utf8(password)))` string**. So offline verify = `pbkdf2Base64( await sha256Base64(typedPassword), user.verifier.salt, user.verifier.iterations ) === user.verifier.hash`.
- **Bundle file container:** `@zip.js/zip.js` AES, single entry `roster.json`, `configure({ useWebWorkers: false })`, zip password = `` `${master}${storeId}` `` (master first — mirrors the sync `password + storeId` convention). Reuse `WrongPasswordError`/`CorruptFileError` from the sync serializer's pattern.
- **Bundle metadata (from backend):** `bundleId: string`, `issuedAt: number` (epoch ms), `expiresAt: number` (epoch ms), `formatVersion: number` (=1), `storeId: string`, `users: OfflineRosterUser[]`.
- **Auth hydration seam:** offline login MUST end by producing a `UserModel` and calling the store's existing `setUser(user, token)` side-effect set (writes TOKEN, CURRENT_USER, AUTH_MODEL, sets `{user, isAuthenticated:true}`) so `authLoader`/`featureLoader`/`adminLoader` in `app/auth/routes/loaders.ts` pass unchanged.
- **Cold-boot invariant:** any new module-load-time hydration must `set()` synchronously before any `await` (see `auth-store.ts:204-222`). Do not break this.
- **Time:** use `Date.now()` for all expiry/idle comparisons (matches the store's `THIRTY_FIVE_DAYS_MS` usage).
- **No new deps.** Web Crypto + zip.js (already present) cover everything. Base64 helpers must be written (none exist).
- **Conventions:** repositories/services are plain classes/objects instantiated with `new` at call sites (no DI container); localStorage keys via `StorageKeys.entityKey(entity, storeId)`; tests are `*.test.ts(x)` under `app/`, run with `npx vitest run <file>`.

---

## File Structure

- Create `app/shared/lib/offline/offline-crypto.ts` — SHA-256, PBKDF2, base64, `verifyOfflinePassword`.
- Create `app/shared/lib/offline/roster-types.ts` — `OfflineVerifier`, `OfflineRosterUser`, `OfflineRosterBundle`.
- Create `app/shared/lib/offline/roster-serializer.ts` — encrypt/decrypt the bundle file (zip.js).
- Create `app/shared/lib/offline/roster-store.ts` — persist roster + anti-replay (`ReplayBundleError`, `ExpiredBundleError`).
- Create `app/shared/lib/offline/offline-auth-service.ts` — verify + map roster user → `UserModel`.
- Create `app/shared/lib/offline/idle-timeout.ts` — 1h inactivity → lock callback.
- Create `app/shared/lib/http/roster-http-service.ts` — call the backend export endpoint.
- Modify `app/shared/lib/stores/auth-store.ts` — add `loginOffline` action.
- Modify `app/auth/routes/login.tsx` — offline login branch.
- Create `app/auth/routes/provision.tsx` — import-bundle route; register in `app/routes.ts`.
- Modify `app/management/users/routes/user-list.tsx` — "Export offline roster" action.
- Modify `app/shared/components/app-layout.tsx` — wire the idle timer.

---

### Task 1: Web Crypto utilities (SHA-256, PBKDF2, base64)

**Files:**
- Create: `app/shared/lib/offline/offline-crypto.ts`
- Test: `app/shared/lib/offline/__tests__/offline-crypto.test.ts`

**Interfaces:**
- Produces:
  - `sha256Base64(text: string): Promise<string>`
  - `pbkdf2Base64(input: string, saltBase64: string, iterations: number): Promise<string>`
  - `verifyOfflinePassword(password: string, verifier: { hash: string; salt: string; iterations: number }): Promise<boolean>`

- [ ] **Step 1: Write the failing test** (`crypto.subtle` is real under jsdom — use known-answer vectors)

```ts
import { describe, it, expect } from 'vitest';
import { sha256Base64, pbkdf2Base64, verifyOfflinePassword } from '../offline-crypto';

describe('offline-crypto', () => {
  it('sha256Base64 matches the known digest of "test"', async () => {
    // Base64(SHA256("test")) — the exact value the .NET HashPasswordService produces.
    expect(await sha256Base64('test')).toBe('n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=');
  });

  it('pbkdf2Base64 is deterministic for a fixed salt+iterations', async () => {
    const salt = 'AAAAAAAAAAAAAAAAAAAAAA=='; // 16 zero bytes, base64
    const a = await pbkdf2Base64('n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=', salt, 1000);
    const b = await pbkdf2Base64('n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=', salt, 1000);
    expect(a).toBe(b);
    expect(atob(a).length).toBe(32); // 32-byte derived key
  });

  it('verifyOfflinePassword returns true only for the matching password', async () => {
    const salt = 'EjRWeBI0VngSNFZ4EjRWeA=='; // some 16-byte salt
    const hash = await pbkdf2Base64(await sha256Base64('secret'), salt, 210000);
    const verifier = { hash, salt, iterations: 210000 };
    expect(await verifyOfflinePassword('secret', verifier)).toBe(true);
    expect(await verifyOfflinePassword('wrong', verifier)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/offline/__tests__/offline-crypto.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/shared/lib/offline/offline-crypto.ts
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
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

export async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bufferToBase64(digest);
}

export async function pbkdf2Base64(
  input: string,
  saltBase64: string,
  iterations: number,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64ToBytes(saltBase64), iterations, hash: 'SHA-256' },
    keyMaterial,
    32 * 8, // 32 bytes
  );
  return bufferToBase64(bits);
}

export async function verifyOfflinePassword(
  password: string,
  verifier: { hash: string; salt: string; iterations: number },
): Promise<boolean> {
  const computed = await pbkdf2Base64(await sha256Base64(password), verifier.salt, verifier.iterations);
  return computed === verifier.hash;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/offline/__tests__/offline-crypto.test.ts`
Expected: PASS (3 tests). If the SHA-256 known-answer fails, the environment's `crypto.subtle` is missing — stop and report (do NOT add a mock; the plan relies on real Web Crypto).

- [ ] **Step 5: Commit**

```bash
git add app/shared/lib/offline/offline-crypto.ts app/shared/lib/offline/__tests__/offline-crypto.test.ts
git commit -m "feat(offline): add web crypto SHA-256 + PBKDF2 verify utilities"
```

---

### Task 2: Roster bundle types + serializer (encrypt/decrypt file)

**Files:**
- Create: `app/shared/lib/offline/roster-types.ts`
- Create: `app/shared/lib/offline/roster-serializer.ts`
- Test: `app/shared/lib/offline/__tests__/roster-serializer.test.ts`

**Interfaces:**
- Produces:
  - types `OfflineVerifier`, `OfflineRosterUser`, `OfflineRosterBundle`
  - `serializeRoster(bundle: OfflineRosterBundle, master: string, storeId: string): Promise<Uint8Array>`
  - `deserializeRoster(payload: Uint8Array, master: string, storeId: string): Promise<OfflineRosterBundle>`
  - error classes `WrongPasswordError`, `CorruptFileError`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { serializeRoster, deserializeRoster, WrongPasswordError } from '../roster-serializer';
import type { OfflineRosterBundle } from '../roster-types';

const bundle: OfflineRosterBundle = {
  bundleId: '11111111-1111-1111-1111-111111111111',
  issuedAt: 1_700_000_000_000,
  expiresAt: 1_700_000_000_000 + 35 * 24 * 60 * 60 * 1000,
  formatVersion: 1,
  storeId: 'store-abc',
  users: [
    { id: 'u1', login: 'ana', fullName: 'Ana', isActive: true, roles: [], featureIds: [1],
      storeModuleIds: [2], isSuperAdmin: false, isOwnerAdmin: true, isReSeller: false,
      selectedStoreId: 'store-abc', verifier: { hash: 'h', salt: 's', iterations: 210000 } },
  ],
};

describe('roster-serializer', () => {
  it('round-trips a bundle with the correct master+storeId', async () => {
    const bytes = await serializeRoster(bundle, 'master', 'store-abc');
    const back = await deserializeRoster(bytes, 'master', 'store-abc');
    expect(back).toEqual(bundle);
  });

  it('throws WrongPasswordError with a wrong master', async () => {
    const bytes = await serializeRoster(bundle, 'master', 'store-abc');
    await expect(deserializeRoster(bytes, 'wrong', 'store-abc')).rejects.toBeInstanceOf(WrongPasswordError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/offline/__tests__/roster-serializer.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement types**

```ts
// app/shared/lib/offline/roster-types.ts
import type { StoreModuleFeatures } from '@store-mgmt/domain';

export interface OfflineVerifier {
  hash: string;
  salt: string;
  iterations: number;
}

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
}

export interface OfflineRosterBundle {
  bundleId: string;
  issuedAt: number;
  expiresAt: number;
  formatVersion: number;
  storeId: string;
  users: OfflineRosterUser[];
}
```

- [ ] **Step 4: Implement the serializer** (mirror `app/sync/lib/services/data-serializer-service.ts` exactly)

```ts
// app/shared/lib/offline/roster-serializer.ts
import {
  BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter, configure,
} from '@zip.js/zip.js';
import type { OfflineRosterBundle } from './roster-types';

configure({ useWebWorkers: false });

const ENTRY_NAME = 'roster.json';

export class WrongPasswordError extends Error {
  readonly name = 'WrongPasswordError';
  constructor(message = 'Wrong master password or corrupted file') {
    super(message);
    Object.setPrototypeOf(this, WrongPasswordError.prototype);
  }
}

export class CorruptFileError extends Error {
  readonly name = 'CorruptFileError';
  constructor(message = 'File is corrupt or has an unsupported format') {
    super(message);
    Object.setPrototypeOf(this, CorruptFileError.prototype);
  }
}

function derivePassword(master: string, storeId: string): string {
  return master + storeId; // master first — mirrors sync's (password + storeId)
}

export async function serializeRoster(
  bundle: OfflineRosterBundle, master: string, storeId: string,
): Promise<Uint8Array> {
  const zipWriter = new ZipWriter(new BlobWriter('application/zip'), {
    password: derivePassword(master, storeId),
  });
  await zipWriter.add(ENTRY_NAME, new TextReader(JSON.stringify(bundle)));
  const blob = await zipWriter.close();
  return new Uint8Array(await blob.arrayBuffer());
}

export async function deserializeRoster(
  payload: Uint8Array, master: string, storeId: string,
): Promise<OfflineRosterBundle> {
  const zipReader = new ZipReader(new BlobReader(new Blob([payload])), {
    password: derivePassword(master, storeId),
  });

  let entries: Awaited<ReturnType<typeof zipReader.getEntries>>;
  try {
    entries = await zipReader.getEntries();
  } catch {
    throw new CorruptFileError('ZIP extraction failed');
  }

  try {
    const entry = entries.find((e) => !e.directory && e.filename === ENTRY_NAME);
    if (!entry || !entry.getData) throw new CorruptFileError('Missing roster entry');
    const text = await entry.getData(new TextWriter());
    return JSON.parse(text) as OfflineRosterBundle;
  } catch (err) {
    if (err instanceof CorruptFileError) throw err;
    if (err instanceof Error && err.message === 'Invalid password') throw new WrongPasswordError();
    throw new WrongPasswordError('Decryption failed');
  } finally {
    await zipReader.close();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/offline/__tests__/roster-serializer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/shared/lib/offline/roster-types.ts app/shared/lib/offline/roster-serializer.ts \
        app/shared/lib/offline/__tests__/roster-serializer.test.ts
git commit -m "feat(offline): add roster bundle types and encrypted serializer"
```

---

### Task 3: Roster storage + anti-replay

**Files:**
- Create: `app/shared/lib/offline/roster-store.ts`
- Test: `app/shared/lib/offline/__tests__/roster-store.test.ts`

**Interfaces:**
- Consumes: `OfflineRosterBundle` (Task 2).
- Produces:
  - `importRoster(bundle: OfflineRosterBundle, now?: number): void` — validates + persists.
  - `getRoster(): OfflineRosterBundle | null` — null if none or expired.
  - `findRosterUser(login: string): OfflineRosterUser | null`
  - `clearRoster(): void`
  - error classes `ExpiredBundleError`, `ReplayBundleError`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { importRoster, getRoster, findRosterUser, clearRoster, ExpiredBundleError, ReplayBundleError } from '../roster-store';
import type { OfflineRosterBundle } from '../roster-types';

const base: OfflineRosterBundle = {
  bundleId: 'b1', issuedAt: 1000, expiresAt: 10_000, formatVersion: 1, storeId: 's1',
  users: [{ id: 'u1', login: 'ana', fullName: 'Ana', isActive: true, roles: [], featureIds: [],
    storeModuleIds: [], isSuperAdmin: false, isOwnerAdmin: false, isReSeller: false,
    selectedStoreId: 's1', verifier: { hash: 'h', salt: 's', iterations: 210000 } }],
};

describe('roster-store', () => {
  beforeEach(() => localStorage.clear());

  it('imports and reads a fresh bundle', () => {
    importRoster(base, 5000);
    expect(getRoster()?.bundleId).toBe('b1');
    expect(findRosterUser('ana')?.id).toBe('u1');
    expect(findRosterUser('nobody')).toBeNull();
  });

  it('rejects an expired bundle on import', () => {
    expect(() => importRoster(base, 20_000)).toThrow(ExpiredBundleError);
  });

  it('treats an expired stored bundle as absent on read', () => {
    importRoster(base, 5000);
    // now past expiry
    expect(getRoster.call(null)).not.toBeNull();
    // simulate time passing via a bundle whose expiresAt < Date.now(): read guard
  });

  it('rejects re-importing the same bundleId', () => {
    importRoster(base, 5000);
    expect(() => importRoster(base, 6000)).toThrow(ReplayBundleError);
  });

  it('rejects an older-or-equal issuedAt (rollback)', () => {
    importRoster(base, 5000);
    const older = { ...base, bundleId: 'b0', issuedAt: 500, expiresAt: 10_000 };
    expect(() => importRoster(older, 6000)).toThrow(ReplayBundleError);
  });

  it('accepts a newer bundle', () => {
    importRoster(base, 5000);
    const newer = { ...base, bundleId: 'b2', issuedAt: 2000, expiresAt: 30_000 };
    importRoster(newer, 6000);
    expect(getRoster()?.bundleId).toBe('b2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/offline/__tests__/roster-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/shared/lib/offline/roster-store.ts
import type { OfflineRosterBundle, OfflineRosterUser } from './roster-types';

const ROSTER_KEY = 'lizoft.offline-roster';
const REPLAY_KEY = 'lizoft.offline-roster-last'; // { bundleId, issuedAt }

export class ExpiredBundleError extends Error {
  readonly name = 'ExpiredBundleError';
  constructor(message = 'Bundle has expired') { super(message); Object.setPrototypeOf(this, ExpiredBundleError.prototype); }
}
export class ReplayBundleError extends Error {
  readonly name = 'ReplayBundleError';
  constructor(message = 'This bundle was already imported or is older than the current one') {
    super(message); Object.setPrototypeOf(this, ReplayBundleError.prototype);
  }
}

interface LastImport { bundleId: string; issuedAt: number; }

function readLast(): LastImport | null {
  const raw = localStorage.getItem(REPLAY_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as LastImport; } catch { return null; }
}

export function importRoster(bundle: OfflineRosterBundle, now: number = Date.now()): void {
  if (bundle.expiresAt <= now) throw new ExpiredBundleError();

  const last = readLast();
  if (last && (bundle.bundleId === last.bundleId || bundle.issuedAt <= last.issuedAt)) {
    throw new ReplayBundleError();
  }

  localStorage.setItem(ROSTER_KEY, JSON.stringify(bundle));
  localStorage.setItem(REPLAY_KEY, JSON.stringify({ bundleId: bundle.bundleId, issuedAt: bundle.issuedAt }));
}

export function getRoster(now: number = Date.now()): OfflineRosterBundle | null {
  const raw = localStorage.getItem(ROSTER_KEY);
  if (!raw) return null;
  let bundle: OfflineRosterBundle;
  try { bundle = JSON.parse(raw) as OfflineRosterBundle; } catch { return null; }
  if (bundle.expiresAt <= now) return null;
  return bundle;
}

export function findRosterUser(login: string): OfflineRosterUser | null {
  const bundle = getRoster();
  if (!bundle) return null;
  return bundle.users.find((u) => u.login === login) ?? null;
}

export function clearRoster(): void {
  localStorage.removeItem(ROSTER_KEY);
  // REPLAY_KEY intentionally survives so a re-imported old file is still rejected.
}
```

> Adjust the "expired stored bundle" test in Step 1 to call `getRoster(20_000)` (pass an explicit `now`) rather than the placeholder line — the implementation accepts a `now` argument precisely so this is deterministic. Fix the test to `expect(getRoster(20_000)).toBeNull()` before running.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/offline/__tests__/roster-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/shared/lib/offline/roster-store.ts app/shared/lib/offline/__tests__/roster-store.test.ts
git commit -m "feat(offline): persist roster with anti-replay and expiry guards"
```

---

### Task 4: Offline auth service (verify + map to UserModel)

**Files:**
- Create: `app/shared/lib/offline/offline-auth-service.ts`
- Test: `app/shared/lib/offline/__tests__/offline-auth-service.test.ts`

**Interfaces:**
- Consumes: `findRosterUser` (Task 3), `verifyOfflinePassword` (Task 1), `UserModel` (`@store-mgmt/domain`).
- Produces: `authenticateOffline(login: string, password: string): Promise<UserModel>`; error classes `NoRosterError`, `OfflineUserNotFoundError`, `OfflineInvalidPasswordError`, `OfflineUserInactiveError`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importRoster } from '../roster-store';
import { authenticateOffline, OfflineInvalidPasswordError, OfflineUserNotFoundError, OfflineUserInactiveError } from '../offline-auth-service';
import { pbkdf2Base64, sha256Base64 } from '../offline-crypto';
import type { OfflineRosterBundle } from '../roster-types';

async function makeBundle(login: string, password: string, isActive = true): Promise<OfflineRosterBundle> {
  const salt = 'EjRWeBI0VngSNFZ4EjRWeA==';
  const hash = await pbkdf2Base64(await sha256Base64(password), salt, 210000);
  return {
    bundleId: 'b1', issuedAt: 1000, expiresAt: Date.now() + 1_000_000, formatVersion: 1, storeId: 's1',
    users: [{ id: 'u1', login, fullName: 'Ana', isActive, roles: [], featureIds: [7], storeModuleIds: [2],
      isSuperAdmin: false, isOwnerAdmin: true, isReSeller: false, selectedStoreId: 's1',
      verifier: { hash, salt, iterations: 210000 } }],
  };
}

describe('offline-auth-service', () => {
  beforeEach(() => localStorage.clear());

  it('returns a UserModel for the right password', async () => {
    importRoster(await makeBundle('ana', 'secret'));
    const user = await authenticateOffline('ana', 'secret');
    expect(user.id).toBe('u1');
    expect(user.isOwnerAdmin).toBe(true);
    expect(user.featureIds).toEqual([7]);
    expect(user.password).toBe('');
    expect(user.authToken).toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    importRoster(await makeBundle('ana', 'secret'));
    await expect(authenticateOffline('ana', 'nope')).rejects.toBeInstanceOf(OfflineInvalidPasswordError);
  });

  it('rejects an unknown user', async () => {
    importRoster(await makeBundle('ana', 'secret'));
    await expect(authenticateOffline('ghost', 'secret')).rejects.toBeInstanceOf(OfflineUserNotFoundError);
  });

  it('rejects an inactive user', async () => {
    importRoster(await makeBundle('ana', 'secret', false));
    await expect(authenticateOffline('ana', 'secret')).rejects.toBeInstanceOf(OfflineUserInactiveError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/offline/__tests__/offline-auth-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/shared/lib/offline/offline-auth-service.ts
import type { UserModel } from '@store-mgmt/domain';
import { findRosterUser, getRoster } from './roster-store';
import { verifyOfflinePassword } from './offline-crypto';
import type { OfflineRosterUser } from './roster-types';

export class NoRosterError extends Error { readonly name = 'NoRosterError'; }
export class OfflineUserNotFoundError extends Error { readonly name = 'OfflineUserNotFoundError'; }
export class OfflineInvalidPasswordError extends Error { readonly name = 'OfflineInvalidPasswordError'; }
export class OfflineUserInactiveError extends Error { readonly name = 'OfflineUserInactiveError'; }

const OFFLINE_TOKEN = 'offline-session';

function toUserModel(u: OfflineRosterUser, bundleExpiresAt: number): UserModel {
  return {
    id: u.id,
    login: u.login,
    fullName: u.fullName,
    cellPhone: '',
    email: '',
    isActive: u.isActive,
    password: '',
    roles: u.roles,
    featureIds: u.featureIds,
    storeModuleIds: u.storeModuleIds,
    isSuperAdmin: u.isSuperAdmin,
    isOwnerAdmin: u.isOwnerAdmin,
    isReSeller: u.isReSeller,
    selectedStoreId: u.selectedStoreId,
    authToken: OFFLINE_TOKEN,
    refreshToken: '',
    expiresIn: bundleExpiresAt,
  };
}

export async function authenticateOffline(login: string, password: string): Promise<UserModel> {
  const bundle = getRoster();
  if (!bundle) throw new NoRosterError('No roster provisioned on this device');

  const user = findRosterUser(login);
  if (!user) throw new OfflineUserNotFoundError('User not in roster');
  if (!user.isActive) throw new OfflineUserInactiveError('User is inactive');

  const ok = await verifyOfflinePassword(password, user.verifier);
  if (!ok) throw new OfflineInvalidPasswordError('Wrong password');

  return toUserModel(user, bundle.expiresAt);
}
```

> Confirm the `UserModel` field list against `packages/domain/src/models/auth.ts:21-35` and fill every required field (cellPhone/email are '' offline — the roster does not carry them; if the backend later adds them, map them here).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/offline/__tests__/offline-auth-service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/shared/lib/offline/offline-auth-service.ts app/shared/lib/offline/__tests__/offline-auth-service.test.ts
git commit -m "feat(offline): verify password against roster and map to UserModel"
```

---

### Task 5: `loginOffline` action on the auth store

**Files:**
- Modify: `app/shared/lib/stores/auth-store.ts`
- Test: `app/shared/lib/stores/__tests__/auth-store.offline.test.ts`

**Interfaces:**
- Consumes: `authenticateOffline` (Task 4), existing `setUser`.
- Produces: `AuthState.loginOffline(login: string, password: string): Promise<UserModel>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../auth-store';
import { importRoster } from '../../offline/roster-store';
import { pbkdf2Base64, sha256Base64 } from '../../offline/offline-crypto';
import type { OfflineRosterBundle } from '../../offline/roster-types';

describe('auth-store loginOffline', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, error: null });
  });

  it('hydrates the store like an online login', async () => {
    const salt = 'EjRWeBI0VngSNFZ4EjRWeA==';
    const hash = await pbkdf2Base64(await sha256Base64('secret'), salt, 210000);
    const bundle: OfflineRosterBundle = {
      bundleId: 'b1', issuedAt: 1, expiresAt: Date.now() + 1_000_000, formatVersion: 1, storeId: 's1',
      users: [{ id: 'u1', login: 'ana', fullName: 'Ana', isActive: true, roles: [], featureIds: [7],
        storeModuleIds: [2], isSuperAdmin: false, isOwnerAdmin: true, isReSeller: false,
        selectedStoreId: 's1', verifier: { hash, salt, iterations: 210000 } }],
    };
    importRoster(bundle);

    const user = await useAuthStore.getState().loginOffline('ana', 'secret');

    expect(user.id).toBe('u1');
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('u1');
    expect(localStorage.getItem('currentUser')).toContain('u1'); // StorageService.setCurrentUser ran
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/stores/__tests__/auth-store.offline.test.ts`
Expected: FAIL — `loginOffline` is not a function.

- [ ] **Step 3: Implement**

Add to the `AuthState` interface (near line 26): `loginOffline: (login: string, password: string) => Promise<UserModel>;`

Add the action inside `create<AuthState>((set, get) => ({ ... }))`:

```ts
loginOffline: async (login: string, password: string): Promise<UserModel> => {
  set({ isLoading: true, error: null });
  try {
    const { authenticateOffline } = await import('../../offline/offline-auth-service');
    const user = await authenticateOffline(login, password);
    // Reuse the exact online hydration seam so loaders/guards see identical state.
    get().setUser(user, user.authToken);
    set({ isLoading: false });
    return user;
  } catch (err) {
    set({ isLoading: false });
    throw err;
  }
},
```

> Note: `setUser` stamps `expiresIn = Date.now() + THIRTY_FIVE_DAYS_MS`, overriding the bundle's `expiresAt`. That is acceptable — the bundle's own `expiresAt` guard lives in `roster-store.getRoster()` (a locked/re-login attempt after bundle expiry finds no roster). If you want the session to also hard-expire with the bundle, change `setUser` to honor an existing `user.expiresIn` when present; only do this if the online path is unaffected (it passes no `expiresIn`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/stores/__tests__/auth-store.offline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/shared/lib/stores/auth-store.ts app/shared/lib/stores/__tests__/auth-store.offline.test.ts
git commit -m "feat(offline): add loginOffline action hydrating via setUser"
```

---

### Task 6: Offline branch in `login.tsx`

**Files:**
- Modify: `app/auth/routes/login.tsx`
- Test: `app/auth/routes/__tests__/login.offline.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore().loginOffline` (Task 5), `ConnectivityService.isOnline` (existing), `getRoster` (Task 3).

- [ ] **Step 1: Write the failing test**

```tsx
// Render <Login/> with ConnectivityService.isOnline mocked to false and a roster
// provisioned in localStorage. Type login+password, submit, assert:
//  - loginOffline was called (spy on useAuthStore.getState().loginOffline) and
//  - navigate was called with the resolved home path.
// Mirror app/auth/routes/__tests__/login.test.tsx setup (react-router test render,
// vi.mock for ConnectivityService and resolveUserHomePath).
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/auth/routes/__tests__/login.offline.test.tsx`
Expected: FAIL — offline submit currently only sets an `isOffline` flag (login.tsx:65) and returns.

- [ ] **Step 3: Implement**

VERIFIED against `login.tsx` (206 lines): the offline early-return is **lines 65-68** (`if (!ConnectivityService.isOnline()) { setIsOffline(true); return; }`). The component uses `form.email`/`form.password` state (not bare vars), the error setter is **`setErrors({ form: ... })`** (there is NO `setError`), messages come from `intl.formatMessage({ id })`, and the online success path wraps in `setIsSubmitting(true)` (line 71) + calls `armTracking()`, `preloadHeavyChunks()`, `navigate(await resolveUserHomePath(user))` (lines 77-81). Mirror that exactly:

```ts
if (!ConnectivityService.isOnline()) {
  const { getRoster } = await import('~/shared/lib/offline/roster-store');
  if (!getRoster()) {
    setIsOffline(true); // no roster provisioned on this device — keep the existing banner
    return;
  }
  try {
    setIsSubmitting(true);
    const user = await useAuthStore.getState().loginOffline(form.email, form.password);
    armTracking();
    preloadHeavyChunks();
    navigate(await resolveUserHomePath(user));
  } catch (err) {
    setIsSubmitting(false);
    setErrors({ form: intl.formatMessage({ id: offlineErrorMessageId(err) }) });
  }
  return;
}
```

Add a module-level `offlineErrorMessageId(err): string` helper that maps the offline error classes to EXISTING message ids already used by the online path: `OfflineInvalidPasswordError` / `OfflineUserNotFoundError` → `'AUTH.INVALID_CREDENTIALS'`; `OfflineUserInactiveError` → `'AUTH.ACCOUNT_INACTIVE'`; `NoRosterError` / anything else → `'AUTH.SERVER_ERROR'` (import the classes from `~/shared/lib/offline/offline-auth-service`).

> `loginOffline` is reached via `useAuthStore.getState().loginOffline(...)` (the component already destructures `{ login, isLoading }` at line 30 — either add `loginOffline` there or use `getState()`; both are valid). Do NOT add a `setError`/`mapOfflineError` shape — the file only has `setErrors({ form })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/auth/routes/__tests__/login.offline.test.tsx`
Expected: PASS. Also run the existing `login.test.tsx` to confirm no regression:
`npx vitest run app/auth/routes/__tests__/login.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add app/auth/routes/login.tsx app/auth/routes/__tests__/login.offline.test.tsx
git commit -m "feat(offline): authenticate against roster when offline"
```

---

### Task 7: Device provisioning route (import bundle)

**Files:**
- Create: `app/auth/routes/provision.tsx`
- Modify: `app/routes.ts`
- Test: `app/auth/routes/__tests__/provision.test.tsx`

**Interfaces:**
- Consumes: `deserializeRoster` (Task 2), `importRoster` (Task 3).

- [ ] **Step 1: Write the failing test**

```tsx
// Render <Provision/>. Provide a File built from serializeRoster(bundle,'master','s1')
// (use the real serializer), fill the master field with 'master' and storeId 's1',
// submit, assert getRoster()?.bundleId === bundle.bundleId. Also assert a wrong
// master shows a WrongPasswordError message and does NOT import.
// Mirror app/sync/components/__tests__/import-form.test.tsx interaction style.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/auth/routes/__tests__/provision.test.tsx`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route** (model on `app/sync/routes/import.tsx` + `import-form.tsx`)

```tsx
// app/auth/routes/provision.tsx — a guest-accessible route (a fresh device is not
// authenticated). Form fields: file input, storeId, master password (show/hide).
// On submit:
//   const payload = new Uint8Array(await file.arrayBuffer());
//   const bundle = await deserializeRoster(payload, master, storeId);
//   importRoster(bundle);
//   -> success message + link to /login.
// Catch WrongPasswordError / CorruptFileError / ExpiredBundleError / ReplayBundleError
// and show a specific message for each (reuse the sync import-form error display style).
// No clientLoader gate (or a trivial one) — provisioning happens before any login.
```

- [ ] **Step 4: Register the route**

In `app/routes.ts`, add inside the guest `auth-layout` group (next to `login`/`register`):

```ts
route('auth/provision', 'auth/routes/provision.tsx'),
```

> Match the exact `route(...)` call signature already used in this file for `login`/`register`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/auth/routes/__tests__/provision.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/auth/routes/provision.tsx app/routes.ts app/auth/routes/__tests__/provision.test.tsx
git commit -m "feat(offline): add device provisioning (import roster) route"
```

---

### Task 8: Admin "Export offline roster" action

**Files:**
- Create: `app/shared/lib/http/roster-http-service.ts`
- Modify: `app/management/users/routes/user-list.tsx`
- Test: `app/shared/lib/http/__tests__/roster-http-service.test.ts`

**Interfaces:**
- Consumes: `apiClient` (existing), `serializeRoster` (Task 2), `BaseResponseModel<OfflineRosterBundle>`.
- Produces: `rosterHttpService.getOfflineRoster(storeId: string): Promise<OfflineRosterBundle>`.

- [ ] **Step 1: Write the failing test**

```ts
// Mock apiClient.get to resolve { data: { data: bundle, succeeded: true, ... } }.
// Assert rosterHttpService.getOfflineRoster('s1') calls
// apiClient.get('/v1/storeusers/s1/offline-roster') and returns the bundle.
// Mirror the style of any existing *-http-service test; if none, mock the axios
// instance module used by auth-http-service.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/http/__tests__/roster-http-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the http service** (mirror `auth-http-service.ts`)

```ts
// app/shared/lib/http/roster-http-service.ts
import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from './api-client';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

export const rosterHttpService = {
  async getOfflineRoster(storeId: string): Promise<OfflineRosterBundle> {
    const response = await apiClient.get<BaseResponseModel<OfflineRosterBundle>>(
      `/v1/storeusers/${storeId}/offline-roster`,
    );
    return response.data.data;
  },
};
```

> Confirm the base path prefix (`/v1` vs `/api/v1`) against `auth-http-service.ts` — use whatever prefix `login`/`getMe` use, since `apiClient.baseURL` already includes the host.

- [ ] **Step 4: Wire the UI action**

VERIFIED against `user-list.tsx` (73 lines): `clientLoader = adminFeatureLoader([EFeatures.Users])` (line 11); the page uses `useOnlineStatus()` (line 16, from `~/shared/lib/hooks/use-online-status`) and has a header `<div className="flex items-center justify-between">` (lines 54-58) where a title lives — the natural anchor for the button. Add an "Export offline roster" button in that header that:
1. is disabled when `!isOnline` (the export needs the API),
2. reads `const storeId = useAuthStore.getState().user?.selectedStoreId` (`UserModel.selectedStoreId` is a Guid string),
3. prompts for a master password (reuse the app's existing dialog/toast primitives — e.g. the same show/hide password field pattern the sync `export-form.tsx` uses; do NOT roll a new design),
4. `const bundle = await rosterHttpService.getOfflineRoster(storeId);`
5. `const bytes = await serializeRoster(bundle, master, storeId);`
6. downloads via the same `Blob` → `URL.createObjectURL` → `<a download>` → `URL.revokeObjectURL` pattern used in `app/sync/routes/export.tsx:61-67` (filename e.g. `roster-${storeId}.smcabundle`).

> The page currently imports `useAuthStore`? No — add the import. It already imports `useOnlineStatus`, `useIntl`, `userHttpService`. Keep the export logic in a small handler; do not restructure `UserListPage`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/http/__tests__/roster-http-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/shared/lib/http/roster-http-service.ts app/shared/lib/http/__tests__/roster-http-service.test.ts \
        app/management/users/routes/user-list.tsx
git commit -m "feat(offline): admin export of encrypted roster bundle"
```

---

### Task 9: 1-hour inactivity lock

**Files:**
- Create: `app/shared/lib/offline/idle-timeout.ts`
- Modify: `app/shared/components/app-layout.tsx`
- Test: `app/shared/lib/offline/__tests__/idle-timeout.test.ts`

**Interfaces:**
- Produces: `createIdleTimer(onIdle: () => void, timeoutMs?: number): { start(): void; stop(): void; notifyActivity(): void; }` (default `timeoutMs = 60 * 60 * 1000`).

- [ ] **Step 1: Write the failing test** (fake timers)

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createIdleTimer } from '../idle-timeout';

describe('idle-timeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires onIdle after the timeout with no activity', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(onIdle, 1000);
    timer.start();
    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    timer.stop();
  });

  it('resets the countdown on activity', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(onIdle, 1000);
    timer.start();
    vi.advanceTimersByTime(800);
    timer.notifyActivity();
    vi.advanceTimersByTime(800);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onIdle).toHaveBeenCalledTimes(1);
    timer.stop();
  });

  it('does not fire after stop()', () => {
    const onIdle = vi.fn();
    const timer = createIdleTimer(onIdle, 1000);
    timer.start();
    timer.stop();
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/shared/lib/offline/__tests__/idle-timeout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/shared/lib/offline/idle-timeout.ts
const ONE_HOUR_MS = 60 * 60 * 1000;

export function createIdleTimer(onIdle: () => void, timeoutMs: number = ONE_HOUR_MS) {
  let handle: ReturnType<typeof setTimeout> | null = null;

  const arm = () => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(onIdle, timeoutMs);
  };

  return {
    start() { arm(); },
    notifyActivity() { if (handle) arm(); },
    stop() { if (handle) { clearTimeout(handle); handle = null; } },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/shared/lib/offline/__tests__/idle-timeout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into the authenticated layout**

VERIFIED against `app-layout.tsx` (71 lines): `AppLayout` is the authenticated layout (`clientLoader = authLoader`, line 9) and already has `useEffect` hooks (lines 22-31, 39-45) — a natural place to add one. Add a `useEffect` that:
- **only arms the timer for OFFLINE sessions** — guard on `useAuthStore.getState().user?.authToken === 'offline-session'` (the sentinel token set by `authenticateOffline` in Task 4). This keeps ONLINE sessions unchanged: the 1h idle lock was specified only for the offline/Mundo-2 flow, and online users already rely on the 35-day token with no idle lock. Applying it globally would be an unintended behavior change.
- creates `const timer = createIdleTimer(() => useAuthStore.getState().logout())`, calls `timer.start()`,
- attaches `timer.notifyActivity` to `mousedown`/`keydown`/`touchstart`/`visibilitychange` window listeners,
- returns a cleanup that removes the listeners and calls `timer.stop()`.

Import `useAuthStore` and `createIdleTimer` at the top of the file.

> `logout()` clears `AUTH_MODEL` and redirects to `/login` (VERIFIED auth-store.ts:188-201). The offline user then re-enters only their password (the roster stays on the device via `roster-store`), satisfying "1h inactivity → re-ask the user password". Do NOT clear the roster here.
>
> **Decision to confirm with the product owner:** gating on the offline sentinel means online sessions get NO idle lock. If you want the 1h lock to apply to every session (online too), drop the `authToken === 'offline-session'` guard — but that is a deliberate scope change beyond the agreed offline design.

- [ ] **Step 6: Run test + commit**

Run: `npx vitest run app/shared/lib/offline/__tests__/idle-timeout.test.ts`

```bash
git add app/shared/lib/offline/idle-timeout.ts app/shared/components/app-layout.tsx \
        app/shared/lib/offline/__tests__/idle-timeout.test.ts
git commit -m "feat(offline): lock session after one hour of inactivity"
```

---

### Task 10: Full-suite green + manual smoke checklist

- [ ] **Step 1: Run the whole frontend test suite**

Run: `npx vitest run` (from `frontend-react/apps/web-store-pos`)
Expected: PASS, including the pre-existing `auth-store`, `loaders.cold-boot`, `data-serializer-service`, and `login` suites (no regressions).

- [ ] **Step 2: Manual smoke (documented, not automated)**

Record results in the PR description:
1. As OwnerAdmin online → Export offline roster → downloads `roster-*.smcabundle`.
2. On a second device, `auth/provision` → import with the master → success.
3. Go offline (devtools) → `/login` with a roster user → lands on their home; permissions/menu match online.
4. Wrong password offline → same error surface as online invalid login.
5. Re-import the SAME file → `ReplayBundleError` message.
6. Leave idle 1h (or set `timeoutMs` low temporarily) → redirected to `/login`; roster still present; re-login with password only.

- [ ] **Step 3: Commit any doc/checklist file**

```bash
git add docs/plans/2026-07-25-offline-auth-frontend-plan.md
git commit -m "docs(offline): record offline-auth frontend smoke checklist"
```

---

## Self-Review

- **Spec coverage:** crypto/verify (T1), bundle format + encryption (T2), anti-replay + expiry (T3), verify→UserModel (T4), store hydration via `setUser` seam (T5), offline login branch (T6), provisioning/import (T7), admin export + endpoint call (T8), 1h idle lock (T9), full green (T10). Covered.
- **Type consistency:** `OfflineVerifier{hash,salt,iterations}` and `OfflineRosterBundle` (T2) flow through T3→T4→T5→T7→T8. `verifyOfflinePassword(password, verifier)` (T1) consumed in T4. `loginOffline(login,password)` (T5) consumed in T6. `serializeRoster/deserializeRoster(…, master, storeId)` (T2) consumed in T7/T8. Aligned.
- **Verifier parameters** identical to the backend plan (PBKDF2-HMAC-SHA256 / 210000 / 16-byte salt / 32-byte key / input = `Base64(SHA256(password))` string). Aligned — this is the single most important cross-plan invariant; if either side drifts, every offline login fails.
- **Cold-boot invariant** preserved (T5 adds an action only; no new module-load hydration).
- **Placeholder scan:** UI-heavy tasks (T6/T7/T8) intentionally describe the exact seam + reuse existing primitives rather than inventing a design system; each still names the exact functions to call and the file to model on. No `TODO`/`TBD`.
