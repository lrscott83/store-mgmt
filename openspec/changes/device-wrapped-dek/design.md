# Design: device-wrapped-dek

> Architecture only — the HOW at module level. Tasks are `sdd-tasks`' job.
> Inputs: proposal (`openspec/changes/device-wrapped-dek/proposal.md`, engram #2116),
> key model (engram `architecture/at-rest-encryption-key-model`, #2113),
> answered questions (engram `sdd/device-wrapped-dek/design-decisions`, #2117),
> test authorization (engram `sdd/device-wrapped-dek/test-authorization`, #2115).
> Prior art: `openspec/changes/archive/2026-08-02-at-rest-encryption-frontend/design.md`
> and the four merged specs under `openspec/specs/`.
>
> Every claim below carries `file:line` evidence or an explicit **NOT VERIFIED** marker.

---

## §0. The one sentence

The device wrap is stored as **two independent halves** — a non-extractable `CryptoKey` in
IndexedDB and a plain-JSON **wrap table in `localStorage`** — and the async recovery of the DEK
from those halves is `await`ed inside `authLoader`/`guestOnlyLoader`, the only three seams
through which any of the 16 synchronous `encryptEntity`/`decryptEntity` call sites can be
reached.

Everything else in this document follows from that split and that proof.

---

## §1. Ratified decisions (with the alternative that lost)

### D1 — The wrap table lives in `localStorage`; IndexedDB holds ONLY the `CryptoKey`

IndexedDB is used for exactly one thing: persisting a `CryptoKey` created with
`extractable: false`. That is the *only* reason IndexedDB is in this change at all — a
non-extractable `CryptoKey` cannot be JSON-serialised, and `localStorage` stores strings only.
Everything else (the wrapped DEK ciphertext, its IV, the per-user password wraps, the DEK
provenance) is plain JSON and goes to `localStorage` next to the roster
(`offline/roster-store.ts:19` already parks device-scoped raw keys there).

**Rejected**: put the whole wrap table in IndexedDB. Four things break:

1. **`entity-crypto.ts` must read the device-provisioning predicate synchronously.**
   `encryptEntity` is sync (`storage/entity-crypto.ts:57`) and its step-2 guard has to become
   device-level (§4). An IndexedDB-backed predicate is async — that is the async rewrite the
   whole change exists to avoid (`storage/aes-gcm.ts:9-13`, 16 `await`-free call sites).
2. **IndexedDB loss would become total data loss.** Private-browsing eviction, `VersionError`,
   or a per-origin IDB wipe would take the password wraps down with the device key, and Q2's
   entire purpose (engram #2117) is that the password wrap is the recovery path.
3. **`auth-store.dek.test.ts:151-161` (test 11.4 — NOT authorized) would break by test
   ordering.** Its `beforeEach` clears `localStorage` and the DEK
   (`auth-store.dek.test.ts:115-119`) but nothing clears IndexedDB. Test 11.1 at line 128 seeds
   a real DEK; with the table in IDB it would survive into 11.4, give it a device DEK, and the
   deliberate `DekUnwrapError` hard-fail (`at-rest-encryption-errors/spec.md:21-33`) would never
   fire. With the table in `localStorage`, the existing `localStorage.clear()` already isolates
   it. **11.4 survives untouched, by construction, not by luck.**
4. Testability: the table becomes assertable in jsdom with zero new machinery.

**Consequence to write into the spec**: "IndexedDB unavailable" is a *degradation* (no
password-free reload), never *data loss*.

### D2 — Q1's device-level predicate is `hasDeviceDekWrap()` in `storage/device-dek-table.ts`

Confirms engram #2117. `isEncryptionProvisioned()` (`offline/roster-store.ts:158-161`) stays
roster-only and byte-identical, which preserves `roster-store.ts:5-13`'s purity contract
(structurally enforced: `roster-store.purity.test.ts:48-60` asserts every `import` line is
`import type`) and keeps `roster-store.test.ts:199-230` — explicitly NOT authorized — green.

`hasDeviceDekWrap()` is sync, reads one `localStorage` key, and lives in `storage/` so
`entity-crypto.ts` can import it statically alongside its existing
`import { isEncryptionProvisioned } from '../offline/roster-store'` (`entity-crypto.ts:20`).

### D3 — The password-wrap MINT direction goes into `offline/dek-unwrap.ts`, same file

Q2 (engram #2117) requires the client to mint `WrappedDekEntry` values. `dek-unwrap.ts:19-25`
states the risk in its own words: `DEK_WRAP_ITERATIONS = 210_000` is *"hardcoded on both sides
with zero protocol protection — the single highest-drift-risk constant in this change"*, and
`dek-unwrap.kat.test.ts` is *"its only defense"*.

The mint direction therefore lives **in that same module**, sharing the **same identifier**, so
the two directions cannot drift — not "a matching constant in a new file", which is precisely
the drift class the comment warns about. `unwrapDek()` (`dek-unwrap.ts:48-64`) stays the single
unwrap path for backend-issued and client-issued wraps alike.

**Rejected**: a new `offline/dek-wrap.ts`. It buys file symmetry and costs the guarantee.
**Rejected**: renaming `dek-unwrap.ts` → `dek-wrap.ts`. Pure artifact drift; same reasoning as
`roster-store.ts:1-3`'s D7 note.

### D4 — DEK provisioning for BOTH auth modes lives in `auth-store.ts`; `offline-auth-service.ts` is UNTOUCHED

The obvious placement — extend the offline unwrap block at `offline-auth-service.ts:127-143` —
**breaks an unauthorized test**: `offline-auth-service.test.ts:98` asserts
`expect(getDek()).toBeNull()` after `authenticateOffline` on a v1 roster, and the new design
mints a local DEK in exactly that situation.

Splitting the concern correctly avoids it, and the split is better layering anyway:

| Concern | Owner | Why |
|---|---|---|
| "Is this password correct, and what does the ROSTER give me?" | `authenticateOffline` — **unchanged**, incl. lines 127-143 | It is the authenticator. Its roster unwrap is pinned by `offline-auth-service.test.ts:216-222` (unauthorized), which stays green. |
| "What is THIS DEVICE's DEK for this session?" | `auth-store.login` + `auth-store.loginOffline` | Identical in both modes; the key model's own lesson is *"the gate is the roster, not online/offline… the instinct to branch by auth mode is the wrong axis"* (#2113). One concept, one place, two call sites. |

`authenticateOffline` has exactly **one** production caller — `auth-store.ts:335-336`
(grep-verified across `apps/web-store-pos`; the other hits are tests). So routing provisioning
through `loginOffline` leaves no hole.

Net effect: `offline-auth-service.ts` drops off the Affected-Areas list entirely, and
`offline-auth-service.test.ts:98` and `:216-222` both stay untouched.

### D5 — `data-key-store.ts` is UNTOUCHED

The proposal listed it as Modified ("DEK provenance"). Provenance belongs in the wrap table
(§5), not next to the memory-only key. `data-key-store.ts:10-15`'s threat-model comment and the
`dek`/`dekStoreId` module-level `let`s are the load-bearing statement of
`dek-lifecycle-and-unlock-gate/spec.md:12-23`; touching that file for a field that has a better
home is gratuitous risk. `data-key-store.test.ts` stays green with zero attention.

### D6 — On conflict, refuse the SWAP, not the login

A roster arriving later with different DEK bytes must never trigger a key swap (#2113: *"do NOT
switch keys — re-encrypt everything"*), and the re-key pass is out of scope
(`entity-migration.ts:73` skips already-encrypted keys and never imports `decryptEntity`;
`data-key-store.ts:15-21` has one slot).

**Refusing the login would brick the POS** for a device whose data is perfectly readable under
its own DEK. So: keep the device DEK, do **not** write the roster's bytes anywhere, record the
conflict durably in the wrap table (`conflictDetectedAt`, `conflictStoreId`), and
`console.error` with a fixed marker string. The session proceeds normally.

No new user-facing surface ships here, because the only remediation is the deferred re-key pass —
a banner the user cannot act on is worse than a record the re-key change can consume. See
§9 open question OQ-2.

### D7 — Error vocabulary: reuse `DekUnwrapError`, add nothing

| New failure | Error | Justification |
|---|---|---|
| Device `CryptoKey` missing/unusable, wrap table present | `DekUnwrapError` | *"Failed to unwrap the data encryption key"* (`dek-unwrap.ts:29`) is literally true. Already mapped to `AUTH.UNLOCK_FAILED` on both login paths (`login.tsx:48-50`, `login.tsx:154-157`). |
| Device-wrap ciphertext corrupt (GCM tag failure) | `DekUnwrapError` | Same class as a roster-wrap tag failure. |
| Wrap table present, no wrap recoverable for THIS user | `DekUnwrapError` | There was a key to unwrap and we could not. Loud, legible, existing copy. |
| IndexedDB blocked/absent, device has no prior encrypted state | *no error* | Degradation, not failure: the DEK is still minted and still persisted via the password wrap. User sees nothing. |
| Roster DEK ≠ device DEK | *no error* | D6 — recorded, logged, non-blocking. |

`MissingDataKeyError` keeps its meaning exactly (`entity-crypto.ts:24-30`): a programming-error
guard, never user-visible (`at-rest-encryption-errors/spec.md:35-41`).

---

## §2. Module map

```
storage/                                        offline/
├── aes-gcm.ts            UNTOUCHED             ├── dek-unwrap.ts        MODIFIED (+mint, D3)
├── base64.ts             UNTOUCHED             ├── unlock-gate.ts       MODIFIED
├── data-key-store.ts     UNTOUCHED (D5)        ├── roster-store.ts      UNTOUCHED (D2, purity)
├── entity-crypto.ts      MODIFIED (1 guard)    ├── offline-auth-service.ts  UNTOUCHED (D4)
├── entity-migration.ts   MODIFIED (guard+scope)└── roster-types.ts      UNTOUCHED
├── device-dek-table.ts   NEW  ← sync leaf
├── device-key-store.ts   NEW  ← the ONLY IndexedDB code in the repo
└── dek-bootstrap.ts      NEW  ← async, memoised

stores/auth-store.ts      MODIFIED   auth/routes/loaders.ts      MODIFIED
offline/dek-provisioning.ts  NEW     profile/routes/change-password.tsx  MODIFIED
```

### `storage/device-dek-table.ts` — NEW, sync, zero-runtime-import leaf

```ts
const DEVICE_DEK_KEY = 'lizoft.device-dek';
import type { WrappedDekEntry } from '../offline/dek-unwrap';   // type-only: erased at build

export interface DeviceDekTable {
  formatVersion: 1;
  dekSource: 'roster' | 'local';
  storeId: string;
  device: { wrappedDek: string; wrapIv: string } | null;
  users: Record<string, WrappedDekEntry>;
  conflictDetectedAt?: number;
  conflictStoreId?: string;
}

export function readDeviceDekTable(): DeviceDekTable | null;   // shape-guarded, never throws
export function writeDeviceDekTable(table: DeviceDekTable): void;
export function hasDeviceDekWrap(): boolean;                   // D2 — the Q1 predicate
export function clearDeviceDekTable(): void;                   // E2E + rollback tooling
```

**Why here**: it is imported statically by `entity-crypto.ts`, which is imported statically by
all six entity modules (`expense-offline-service.ts:5`, `product-repository.ts:5`,
`product-category-repository.ts:4`, `sale-credit-offline-service.ts:4`,
`order-offline-service.ts:5`, `inventory-offline-service.ts:11`). It therefore MUST be as cheap
as `roster-store.ts` is: no runtime imports, no top-level side effects. The `WrappedDekEntry`
import is `import type` and erases — the same discipline `roster-store.ts:13-14` states and
`roster-store.purity.test.ts` enforces, and this module gets the **same structural purity test**.

`readDeviceDekTable` shape-guards exactly like `roster-store.ts:60-69` does (`hasValidShape`),
for the same reason recorded there: an unguarded read of a future/garbage shape is silently
wrong forever.

### `storage/device-key-store.ts` — NEW, the only IndexedDB in the repo

```ts
export const DEVICE_KEY_DB = 'lizoft-device-key';   // version 1, FOREVER
export const DEVICE_KEY_STORE = 'keys';
export const DEVICE_KEY_ID = 'device-dek-key';
export const DEVICE_KEY_OPEN_TIMEOUT_MS = 3_000;

export async function getDeviceKey(): Promise<CryptoKey | null>;        // read-only, never creates
export async function getOrCreateDeviceKey(): Promise<CryptoKey | null>;
export async function deleteDeviceKey(): Promise<void>;                 // tests + E2E
```

Rules, each load-bearing:

- **Never throws.** Every failure — no `indexedDB` global, `SecurityError` (private browsing /
  third-party context), `VersionError`, `QuotaExceededError`, a `blocked` event — resolves
  `null`. Callers branch on `null`; nobody writes a `try` around IndexedDB semantics.
- **Bounded open.** The `open()` is raced against `DEVICE_KEY_OPEN_TIMEOUT_MS` and resolves
  `null` on timeout. Non-negotiable: this promise is `await`ed inside `authLoader`, and an
  IndexedDB `blocked` event never fires an error — it just never settles. An unbounded open is
  a permanent white screen. This is the same class of trap the E2E suite already recorded for
  Vite dev-server chunk fetches (engram `gotcha-e2e-offline-vite-dev-modulos`: *"the fetch hangs
  forever"*).
- **Version pinned at 1 forever.** The record is one opaque `CryptoKey`; there is nothing to
  migrate. A `VersionError` therefore means someone else raised the version → unavailable → `null`.
- **`generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])`.** The
  `false` is the whole point (`extractable: false`, #2113).
- **`getDeviceKey` never creates.** Creation happens only on the login path (§3). Otherwise every
  anonymous page load on the landing page would mint an orphan key.

### `storage/dek-bootstrap.ts` — NEW, async, memoised

```ts
export async function bootstrapDeviceDek(): Promise<void>;
```

Idempotent and single-flight (module-level `let inFlight: Promise<void> | null`). Never throws.

```
if (getDek() !== null) return                       // already unlocked this page load
const table = readDeviceDekTable(); if (!table?.device) return   // nothing to recover
const key = await getDeviceKey(); if (!key) return  // IDB unavailable -> needsUnlock takes over
try { setDek(await unwrapDekFromDevice(table.device, key), table.storeId) } catch { /* leave null */ }
```

Uses `getDeviceKey`, never `getOrCreateDeviceKey`. Tests reset the memo with
`vi.resetModules()` + dynamic `import()` — the repo's established technique
(`roster-store.purity.test.ts:36,40`; engram `profile-loader-stale-storeid-closure`) — so no
test-only export is added to production code.

`unwrapDekFromDevice`/`wrapDekForDevice` live here too (they are pure WebCrypto over the device
key and have no other consumer):

- wrap: `crypto.subtle.encrypt({ name: 'AES-GCM', iv }, deviceKey, dek)` with a fresh 12-byte IV.
- unwrap: `crypto.subtle.decrypt(...)`; length ≠ 32 → `DekUnwrapError`; any throw → `DekUnwrapError`.
- **`encrypt`, not `wrapKey`.** The DEK is raw bytes (`Uint8Array`, `data-key-store.ts:15`), not a
  `CryptoKey`. `wrapKey` would force an `importKey`/`exportKey` round trip and a second key
  representation for zero benefit. WebCrypto AES-GCM emits `ciphertext‖tag`, the same layout
  `aes-gcm.ts:20-25` documents, so the two crypto stacks agree on the envelope by accident of
  the standard — recorded here so nobody "fixes" the layout later.

### `offline/dek-provisioning.ts` — NEW, the login-path resolver

```ts
export async function resolveDekForLogin(args: {
  login: string; password: string; sessionStoreId: string;
}): Promise<void>;
export async function rewrapDeviceDekForPassword(login: string, newPassword: string): Promise<void>;
```

Lives in `offline/` because it reads the roster (`getRawRoster`) and runs password KDFs — the
exact weight `offline/` exists to keep out of the initial bundle. `auth-store.ts` reaches it by
**dynamic import**, honouring D6 (`auth-store.ts:327-331`: *"a static import here would drag
crypto + localStorage offline modules into every page load"*). `auth-store.ts` keeps **zero
static `offline/` imports**.

Its one static `storage/` import remains legal for the same reason `data-key-store.ts:1-8`
records: `storage/` leaves are cheap by construction.

---

## §3. Bootstrap ordering — and the proof that nothing bypasses it

### The seams

Three, all already async, all already dynamic-importing `offline/`:

| # | Seam | Change |
|---|---|---|
| 1 | `authLoader` → `unlockGate(user)` — `auth/routes/loaders.ts:29-32,39` | `await bootstrapDeviceDek()` **before** `needsUnlock(user)` |
| 2 | `guestOnlyLoader` — `loaders.ts:48-57` | `await bootstrapDeviceDek()` **before** both `needsUnlock(user)` (line 54) and `resolveUserHomePath(user)` (line 56) |
| 3 | `auth-store.login` (`:296-317`) / `auth-store.loginOffline` (`:332-350`) | `await resolveDekForLogin(...)` before returning (D4) |

### The proof

**Step 1 — where the sync crypto is reachable from.** `encryptEntity`/`decryptEntity`
(`entity-crypto.ts:57,84`) have 16 call sites in exactly 6 modules (grep-verified, matches the
archived spec's count): `expense-offline-service.ts:258,281`,
`product-repository.ts:392,402,423`, `product-category-repository.ts:208,229,239`,
`sale-credit-offline-service.ts:372,396`, `order-offline-service.ts:569,578,602`,
`inventory-offline-service.ts:903,933,946`; plus `entity-migration.ts:74`.

**Step 2 — who imports those 6 modules.** 39 files (grep-verified). Every *route* file in that
set — `sales/*`, `inventory/*`, `expenses/*`, `reports/*`, `statistics/*`, `sync/*` — is nested
inside `layout('shared/components/app-layout.tsx', { id: 'app-layout' }, [...])`
(`routes.ts:34-112`), whose `clientLoader` **is** `authLoader` (`app-layout.tsx:17`).

**Step 3 — the routes NOT under that layout.** `index`→`home/routes/landing-deep.tsx`
(`routes.ts:20`), `login`, `register`, `auth/provision` (`routes.ts:23-31`), `help/tutorial`
under `public-app-layout` which deliberately exports no `clientLoader`
(`routes.ts:118-120`, `public-app-layout.test.ts:11-13`), `health`, `*`
(`routes.ts:123-124`). **None of the seven appears in the 39-file set.** Nothing outside the
gate can reach the sync crypto.

**Step 4 — the two non-route entry points.**
- `resolveUserHomePath` → `createProductService(...).hasAnyAvailableToSaleProduct()`
  (`user-home.ts:24`) → `product-repository.ts:392` `decryptEntity`. Reached from
  `guestOnlyLoader` (`loaders.ts:56` — covered by seam 2) and from `login.tsx:116,144`, which
  runs only after `login()`/`loginOffline()` resolve — covered by seam 3.
- `runEntityMigration()` — called only from the two login paths, after the DEK is set.

**Step 5 — parallel loaders.** React Router runs a matched branch's loaders concurrently, so
`app-layout`'s `authLoader` and the child route's `clientLoader` race. Harmless: every child
`clientLoader` is `featureLoader`/`adminFeatureLoader`/`superAdminLoader`/`resellerFeatureLoader`
(`loaders.ts:65-143`), and none of them touches entity storage — they read
`useAuthStore.getState()` and call `isUserAuthorized`. Components render only after **all**
loaders in the branch settle, so no component observes a pre-bootstrap DEK.

**Step 6 — the root component.** `root.tsx`'s `App()` mounts `registerServiceWorker`,
`registerAuthRedirect`, `useStoreUsageTracker`, `LoadingOverlay`, `InstallAppButton`,
`ToastContainer` (`root.tsx:73-111`). `store-usage-tracker.ts` is **not** among the 6 entity
modules (absent from the `encryptEntity|decryptEntity` grep) — it owns its own storage keys.
No path.

### Rejected seams

- **`entry.client.tsx` top-level `await`** (`entry.client.tsx:13-22`). Earliest, and wrong: it
  makes every anonymous visitor to the public landing page pay an IndexedDB open, and the
  ordering versus `auth-store.ts:389-391`'s module-evaluation `initialize()` depends on
  react-router's generated client module graph — **NOT VERIFIED**, and I will not build the
  central ordering guarantee on an unverified assumption. The loader seam needs no assumption:
  it is a promise the router itself awaits.
- **Async `initialize()`** (`auth-store.ts:93-95,389-391`). Its header comment
  (`auth-store.ts:373-388`) makes synchronous hydration a contract (the AUTH-03 cold-boot
  invariant, restated at `:124-125`). Making it async breaks every loader that reads
  `getState()` on first render.
- **Speculative kickoff from `initialize()` + await in the loaders.** Adds a static import to
  `auth-store.ts` and a second ordering story to save ~1-3 ms on a path that already awaits two
  dynamic imports. Rejected as unearned complexity.

---

## §4. The wrap table, coexistence, and migration of today's devices

### Shape (localStorage key `lizoft.device-dek`)

```json
{
  "formatVersion": 1,
  "dekSource": "local",
  "storeId": "s1",
  "device":  { "wrappedDek": "<b64 ct‖tag>", "wrapIv": "<b64 12B>" },
  "users":   { "ana": { "wrappedDek": "<b64>", "wrapSalt": "<b64>", "wrapIv": "<b64>" } },
  "conflictDetectedAt": 1760000000000,
  "conflictStoreId": "s2"
}
```

`users[login]` entries are **exactly** `WrappedDekEntry` (`offline/roster-types.ts:38-40`,
`dek-unwrap.ts:35-39`) — same field names, same PBKDF2 iteration count, same
`preHash = Base64(SHA256(UTF8(password)))` convention (`dek-unwrap.ts:5-6`). That is what keeps
`unwrapDek()` the single unwrap path (D3, engram #2117).

**No DEK fingerprint is stored.** Conflict detection compares raw bytes at login, the only
moment both candidate keys are derivable (§5 step 4). A stored digest would add a field, a
format-version risk, and a (small) analysis surface, to detect nothing the byte comparison
misses.

### Coexistence with the roster's own wraps

They never merge and never overwrite each other:

| | Roster bundle (`lizoft.offline-roster`) | Device table (`lizoft.device-dek`) |
|---|---|---|
| Author | backend `StoreKeyWrapService.cs` | this client |
| Lifetime | replaced wholesale by `importRoster` (`roster-store.ts:109-113`), expiry + anti-replay | written incrementally, never expires |
| Read by | `unwrapDek` at login, `needsUnlock` legacy branch, `isEncryptionProvisioned` | bootstrap, login resolver, `hasDeviceDekWrap` |

`importRoster` is untouched — a new roster import cannot corrupt the device table, and the
device table cannot make a bundle look replayed.

### Migration of devices that already have roster-based encryption today

**There is no migration step, and that is the design.** Such a device holds `enc:v1:` values
under the roster DEK. On its next login the resolver finds no device table, takes the roster
branch (§5 step 3b), adopts *those same bytes* as the device DEK with `dekSource: 'roster'`,
and writes the device wrap. Every existing ciphertext stays readable because the DEK never
changed. No re-encryption, no data touched, no window where the two disagree.

The one behavioural delta on such a device is the reload: `needsUnlock` now returns `false`
because the device wrap recovers the DEK. That is authorized test #1 (T10).

`entity-migration.ts` changes guard and scope:

```
- if (!isEncryptionProvisioned()) return;  const storeId = getRawRoster()!.storeId;
+ const storeId = getDekStoreId();  if (!storeId) return;
```

Same value on the roster path (`setDek(dek, bundle.storeId)` is what `auth-store.ts:306` already
passes), and it starts working on local-DEK devices where `isEncryptionProvisioned()` is false
— which is the point. It also drops `entity-migration.ts`'s import of `roster-store` entirely.

**All four existing `entity-migration.test.ts` suites stay green** (none is authorized, all were
checked): the unprovisioned guard test (`:62-76`) clears the DEK so the new guard returns
earlier and still performs zero entity reads/writes; the three others (`:79-114`, `:116-157`,
`:159-180`) all call `setDek(DEK, STORE_A)` in `beforeEach`, so `getDekStoreId()` yields exactly
the scope they assert. The `:159-180` requirement *"scoped to the roster store, not the active
store"* remains satisfied because `setDek`'s storeId **is** the roster's storeId on that path —
`entity-migration.ts` still never reads `selectedStoreId` (its `:44-48` comment stays true).

### `entity-crypto.ts` — one line

```
- if (!isEncryptionProvisioned()) return plaintext;
+ if (!isEncryptionProvisioned() && !hasDeviceDekWrap()) return plaintext;
```

Step 1 (DEK-first, `:58-66`) and `decryptEntity` (`:84-98`) are **untouched** — the permanent
marker-based read passthrough (`entity-at-rest-encryption/spec.md:41-62`) stays exactly as
shipped, which is what keeps mixed-state devices readable.

The write-side passthrough narrows to its only honest meaning: *no DEK **and** this device has
never held one* — the pre-bootstrap window. Without this line a device holding `enc:v1:` values
would silently write plaintext over them during a failed bootstrap: the original bug, in a
smaller window.

`entity-crypto.test.ts:108-111` (*"provisioned but locked → MissingDataKeyError"*, **not**
authorized) survives: it imports a v2 roster and writes no device table, so
`isEncryptionProvisioned()` is true, the guard falls through, and it still throws. Likewise the
six `*.crypto.test.ts` plaintext-mode tests (e.g.
`expense-offline-service.crypto.test.ts:48-57`) — each `beforeEach` does
`localStorage.clear(); clearDek(); clearRoster()` and calls the service directly, so both
predicates are false and the plaintext branch still runs.

### `unlock-gate.ts` — one branch above the existing logic

```
if (!user) return false;
if (getDek() !== null) return false;
if (hasDeviceDekWrap()) return true;      // NEW: device holds ciphertext we could not auto-recover
...existing expiry-ignoring roster check (unlock-gate.ts:16-21), unchanged...
```

All nine tests in `unlock-gate.test.ts` clear `localStorage` in `beforeEach` (`:42-45`) and never
write a device table, so `hasDeviceDekWrap()` is false and the roster branch decides. **Every
one stays green untouched**, including the stranding regression at `:51-54`.

`unlock-gate.ts` importing from `storage/` is the existing direction
(`unlock-gate.ts:7` already imports `data-key-store`).

---

## §5. The login-path algorithm (`resolveDekForLogin`)

Called from `auth-store.login` (replacing `:296-317`) and `auth-store.loginOffline` (after
`authenticateOffline` returns, before `setUser`). Both via dynamic import.

```
1. await bootstrapDeviceDek()                  // may already have set the DEK this page load
2. let dek = getDek()
3. if (dek === null):
   a. table exists?
        own = table.users[login]
        own            -> dek = await unwrapDek(password, own);  setDek(dek, table.storeId)
        else roster    -> dek = await unwrapDek(password, rosterEntry); setDek(dek, table.storeId)
        else           -> throw new DekUnwrapError()      // dead end, see below
   b. no table, roster entry for this login?
        dek = await unwrapDek(password, rosterEntry)      // <-- 11.4's hard fail lives HERE
        setDek(dek, bundle.storeId);  source='roster'; tableStoreId=bundle.storeId
   c. otherwise (Q2 mint):
        dek = crypto.getRandomValues(new Uint8Array(32))
        setDek(dek, sessionStoreId);  source='local';  tableStoreId=sessionStoreId
4. reconcile (only when step 3 did NOT come from the roster and a roster entry exists):
     try { y = await unwrapDek(password, rosterEntry)
           if (!bytesEqual(y, dek)) recordConflict(bundle.storeId) }   // D6
     catch { /* stale roster wrap; we already hold the device DEK — refresh below */ }
5. persist, best-effort, never fatal:
     table ??= { formatVersion:1, dekSource:source, storeId:tableStoreId, device:null, users:{} }
     if (!table.device) { k = await getOrCreateDeviceKey(); if (k) table.device = await wrapDekForDevice(dek, k) }
     if (!table.users[login]) table.users[login] = await wrapDekWithPassword(password, dek)
     writeDeviceDekTable(table)
6. try { runEntityMigration() } catch {}        // unchanged doctrine, entity-migration.ts:15-18
```

Three properties worth naming:

- **`dekSource` is written once and never rewritten.** Step 5 only creates the table; later
  logins mutate `device`/`users`/conflict fields. That is the *"decided ONCE per device"* rule
  (#2113) made structural rather than remembered.
- **`unwrapDek` failure hard-fails only in 3b — the no-device-DEK case.** 3b is exactly
  `auth-store.dek.test.ts:151-161`'s world (its `beforeEach` clears `localStorage`, so no
  device table exists) and the rethrow reaches `login.tsx:154-157` → `AUTH.UNLOCK_FAILED`,
  satisfying `at-rest-encryption-errors/spec.md:21-33` unchanged. When a device DEK **does**
  exist, a stale roster wrap is no longer fatal (step 4's `catch`) — it means "your password
  changed elsewhere", and step 5 refreshes the user's device-table wrap under the current
  password. That is #2113's out-of-band recovery, now implementable.
- **Step 3a's dead end.** Device table with wraps, but none for this user *and* the device
  `CryptoKey` is gone. Minting a fresh DEK would orphan existing ciphertext; proceeding with no
  DEK reproduces the uncaught `MissingDataKeyError`. So: `DekUnwrapError` → `AUTH.UNLOCK_FAILED`,
  login refused. Precondition is narrow (IndexedDB evicted while `localStorage` survived — a
  full site-data clear removes both together and yields a clean slate) and the outcome is
  strictly better than today's uncaught crash. Must be spec'd, not discovered.

### Password-change re-wrap

`profile/routes/change-password.tsx`, between line 25 (POST) and line 28 (`logout()`, which
clears the DEK at `auth-store.ts:361`):

```ts
await profileHttpService.changePassword(user.id, payload);
try {
  const { rewrapDeviceDekForPassword } = await import('~/shared/lib/offline/dek-provisioning');
  await rewrapDeviceDekForPassword(user.login, payload.newPassword);
} catch { /* non-fatal: the password IS already changed; the device wrap still recovers the DEK */ }
logout();
```

`rewrapDeviceDekForPassword` **replaces** `users[login]` — it does not add. Leaving the old entry
would let the old password unwrap the DEK forever. Swallowing follows the established doctrine
for post-success side effects (`entity-migration.ts:15-18`, `auth-store.ts:311-316`): failing a
password change that the server already committed is the worse outcome.

---

## §6. Failure modes

| # | Situation | Code does | User sees |
|---|---|---|---|
| F1 | IndexedDB absent/blocked/`SecurityError` (private browsing), device has no prior encrypted state | `getOrCreateDeviceKey()` → `null`; DEK still minted, `table.device` stays `null`, password wrap written | Nothing. Session normal, data encrypted. Next reload asks for the password (`hasDeviceDekWrap()` true via `users`) — i.e. today's UX |
| F2 | IndexedDB open hangs (`blocked` by another tab) | 3 s timeout → `null` → F1 | Nothing; ≤3 s added to one loader |
| F3 | `VersionError` (DB opened at a higher version elsewhere) | `null` → F1 | Nothing |
| F4 | Device `CryptoKey` gone, wrap table intact, user HAS a password wrap | Bootstrap leaves DEK `null` → `hasDeviceDekWrap()` true → `needsUnlock` true → `/login?unlock=1`; login step 3a unwraps `users[login]`; step 5 re-mints the device wrap | `AUTH.UNLOCK_REQUIRED` banner, types password, back to normal. **This is the NEW E2E test** |
| F5 | Device `CryptoKey` gone AND no password wrap for this user (§5 3a) | `DekUnwrapError` → login refused | `AUTH.UNLOCK_FAILED` (existing copy) |
| F6 | Device wrap ciphertext corrupt (GCM tag fails) | `unwrapDekFromDevice` → `DekUnwrapError`, swallowed by bootstrap → DEK `null` → F4 | `AUTH.UNLOCK_REQUIRED`, password recovers |
| F7 | Wrap table corrupt / not JSON / wrong shape | `readDeviceDekTable()` → `null` (shape guard, same discipline as `roster-store.ts:60-69,126-138`); `hasDeviceDekWrap()` false | Falls back to the pre-change roster behaviour exactly. Data encrypted under the lost DEK is unrecoverable — the table IS the recovery material; this is the accepted single point of failure, and the reason it is shape-guarded rather than trusted |
| F8 | Roster arrives later with different DEK bytes (D6) | Keep the device DEK; write `conflictDetectedAt`/`conflictStoreId`; `console.error` with a fixed marker; **no swap, no block** | Nothing (see OQ-2). Re-key is the deferred follow-up |
| F9 | Roster wrap stale (password changed elsewhere), device DEK present | Step 4 `catch`; step 5 refreshes `users[login]` | Nothing — login succeeds. Deliberate relaxation of today's hard fail, valid ONLY when a device DEK exists |
| F10 | Storage quota exceeded writing the table | Step 5 is wrapped; DEK stays in memory for this session | Nothing this session; next reload behaves as F1 |
| F11 | Marked value read with no DEK (bootstrap failed, gate bypassed) | `MissingDataKeyError` (`entity-crypto.ts:88-91`) — unchanged, still a programming-error guard | Should be unreachable; §3's proof is what makes that claim, and the F4 gate is the net |

---

## §7. Test strategy per seam (strict TDD — the first failing test)

**The IndexedDB dependency decision, which blocks work unit 1**: add
**`fake-indexeddb` as a devDependency**, imported **per-test-file** (`import 'fake-indexeddb/auto';`
as the first line), **NOT** in `vitest.setup.ts`.

Rationale: jsdom does not implement IndexedDB (`vitest.config.ts:17`), and the repo has zero
IndexedDB usage and no such dep (`package.json:39-60`, grep-verified). A hand-rolled fake would
test the fake. But a global setup import changes the environment of every existing test file for
the benefit of two — and vitest isolates per file by default (no `pool`/`isolate` override in
`vitest.config.ts`), so a per-file import has literally zero blast radius. **Both** halves of the
prompt's question are used: `fake-indexeddb` for `device-key-store`'s own tests, and the
`getDeviceKey(): Promise<CryptoKey | null>` seam so every higher layer tests the `null` and
non-`null` branches with a plain module mock and no IndexedDB at all. WebCrypto already works
under this jsdom setup (`offline/offline-crypto.ts` + its KAT), so only IndexedDB was missing.

⚠️ `fake-indexeddb` requires a global `structuredClone`. Present in Node ≥17, but whether
vitest's jsdom environment exposes it here is **NOT VERIFIED** — `sdd-tasks` must make that the
first assertion of work unit 1, with `globalThis.structuredClone = (await import('node:worker_threads'))`-style
polyfilling as the documented fallback.

| Seam | First failing test | Notes |
|---|---|---|
| `device-key-store` | `getOrCreateDeviceKey()` twice returns the **same** key, and `key.extractable === false` | `import 'fake-indexeddb/auto'`. Then: `crypto.subtle.exportKey('raw', key)` **rejects** — the non-extractability proof, not an assertion about a flag |
| `device-key-store` | with `globalThis.indexedDB` deleted, `getOrCreateDeviceKey()` resolves `null` and does not throw | The F1 contract |
| `device-key-store` | a never-settling `open()` stub resolves `null` within the timeout | F2. Use fake timers; this test is the white-screen guard |
| `device-dek-table` | `readDeviceDekTable()` returns `null` for absent / non-JSON / wrong-shape values; `hasDeviceDekWrap()` false for each | Mirrors `roster-store.test.ts:186-196` |
| `device-dek-table` | **structural purity**: every `import` line in the file is `import type` | Copy of `roster-store.purity.test.ts:48-60`. Protects `entity-crypto`'s static-import cost |
| `dek-bootstrap` | device wrap present + device key present → `getDek()` non-null with the exact original bytes | Real WebCrypto + `fake-indexeddb`, no crypto mocks — same "prove it recovers the right bytes" bar as `auth-store.dek.test.ts:1-6` |
| `dek-bootstrap` | device key missing → `getDek()` stays `null`, no throw | F4 half 1 |
| `dek-bootstrap` | called twice concurrently → `open` observed once | The single-flight memo |
| `dek-unwrap` (mint) | **round trip**: `unwrapDek(pwd, await wrapDekWithPassword(pwd, dek))` returns `dek` byte-for-byte | D3 — the anti-drift assertion |
| `dek-unwrap` (mint) | mint against the frozen KAT salt/IV reproduces the KAT's `wrappedDek` exactly | Extends `dek-unwrap.kat.test.ts` rather than duplicating it. Pins the mint to the **backend's** vector, not to our own unwrap |
| `entity-crypto` | *(authorized #2, red-first)* with a device DEK set, `encryptEntity` → `enc:v1:` with **no roster**; and with `formatVersion:1` | Rewrite of `entity-crypto.test.ts:70-87` |
| `entity-crypto` | no DEK **and** no device table **and** no roster → plaintext, no throw | The re-scoped passthrough |
| `unlock-gate` | device table with a device wrap + no DEK → `needsUnlock` **true** even with no roster | New row; the nine existing rows must still pass unedited |
| `entity-migration` | local-DEK device (`setDek(dek,'s1')`, **no roster**) → the `products` key becomes `enc:v1:` | Today this is a no-op; that is the RED |
| `dek-provisioning` | no roster, no table → `getDek()` non-null, `dekSource:'local'`, `users[login]` present, and `unwrapDek(password, users[login])` returns those same bytes | Q2's whole contract in one test |
| `dek-provisioning` | roster wrap present, no table → adopts the **roster's** bytes, `dekSource:'roster'` | The once-per-device source rule |
| `dek-provisioning` | device DEK X + roster yielding Y≠X → `getDek()` still X, `conflictDetectedAt` set, no throw | D6 |
| `dek-provisioning` | device DEK X + roster wrap that fails to unwrap → resolves, `users[login]` refreshed | F9, and the explicit boundary against 11.4 |
| `dek-provisioning` | table with wraps but none for this login, no device key → rejects `DekUnwrapError` | F5 |
| `auth-store` | *(authorized #3, red-first)* `login()` with no roster → `getDek()` non-null | Rewrite of `auth-store.dek.test.ts:140-149` |
| `auth-store` | `loginOffline()` on a v1 roster → `getDek()` non-null | The offline twin. **Lives in `auth-store.offline.test.ts` (a NEW test), never in `offline-auth-service.test.ts`** — that is D4's whole purpose |
| `loaders` | `authLoader` does **not** resolve before `getDek()` is non-null | The §3 ordering guarantee, asserted not assumed: a deferred `getDeviceKey` stub, then assert the DEK is set at the moment the loader promise settles |
| `loaders` | `guestOnlyLoader` bootstraps **before** calling `resolveUserHomePath` | Spy on the product service; assert `getDek()` non-null when it is first called |
| `routes.ts` | the set of route module paths **outside** the `app-layout` block equals a frozen list of 7 | Cheap structural guard: adding a public route fails and forces a human to re-run §3's proof |
| E2E | *(authorized #1)* T10 inverted: after `page.reload()` stay on `/sales/products`, no `AUTH.UNLOCK_REQUIRED`, seeded product still renders, raw key still `enc:v1:`; keep `expectOnlyKnownTelemetry` + `expectNoLoginAttempt` | Rendering the decrypted product is the same-DEK proof; "no prompt appeared" alone is not |
| E2E | **NEW**: `indexedDB.deleteDatabase('lizoft-device-key')` (leaving `localStorage` intact) → reload → `/login?unlock=1` → password → back in, data readable | F4. Do **not** fold into T10 — the unlock path must not vanish with it |

### Existing tests audited against this design (none authorized, all stay green)

`roster-store.test.ts:199-230` (D2) · `roster-store.purity.test.ts` (D2) ·
`unlock-gate.test.ts` all 9 rows (§4) · `entity-migration.test.ts` all 4 suites (§4) ·
`entity-crypto.test.ts:108-121` (§4) · the six `*.crypto.test.ts` plaintext-mode tests (§4) ·
`offline-auth-service.test.ts:98` **and** `:216-222` (D4) · `data-key-store.test.ts` (D5) ·
`auth-store.dek.test.ts:151-161` = 11.4 (D1 + §5 3b) · `auth-store.test.ts:253-259` ·
`auth-store.offline.test.ts` (asserts hydration/roster survival, never `getDek()`).

⚠️ `entity-migration.test.ts:62` keeps a test *name* that says *"the guard itself reading the
roster key…"* after the guard stops reading the roster. Prose drift, zero assertion change.
**Not touched** — renaming it would be an unauthorized test edit.

⚠️ `auth-store.dek.test.ts` gains one extra PBKDF2 at 210 000 iterations per login (step 5's
mint) on top of the two it already runs. `sdd-tasks` should measure the file's wall time.

---

## §8. Rollback

Delivery is commits-only on the change branch; nothing is pushed or merged, so rollback never
touches shared history.

- **Slice A** (device key store + wrap table, unwired): `git revert`. Clean delete, zero runtime
  references, zero behaviour change.
- **Slice B** (the flip): `git revert` restores roster gating. **DATA-AFFECTING after adoption.**
  A device is *adopted* iff `localStorage['lizoft.device-dek']` exists. On an adopted device the
  reverted build cannot read its own `enc:v1:` values — `decryptEntity` throws
  `MissingDataKeyError` on a marked value with no DEK (`entity-crypto.ts:88-91`), and the reverted
  build has no way to obtain a locally-minted DEK. **There is no in-app downgrade path**, because
  the decrypt-and-rewrite pass is explicitly out of scope. The only recovery on an adopted device
  is clearing site data for the origin, which discards offline data never synced to the backend.
  Bounded, named, and the honest limit of this rollback.
- **Slice C** (E2E + re-wrap seam): revertible only **together with** B — T10's original assertion
  fails against B.
- **Before RE-applying after a revert**: delete BOTH `localStorage['lizoft.device-dek']` and the
  IndexedDB database `lizoft-device-key` on every affected device. Otherwise the surviving device
  wrap is adopted as authoritative on the next login while any data written under the roster DEK
  during the reverted window becomes unreadable — a self-inflicted F8 with no detection, since
  step 3's device branch short-circuits before any roster comparison.
- Stale IndexedDB entries left by a revert are inert (nothing reads them) but are exactly what
  makes the previous bullet mandatory.

---

## §9. Open questions (genuine user forks only)

- **OQ-1 — `offline-auth-service.test.ts:98` is safe under D4, but only because provisioning
  moved to `auth-store`.** If a reviewer would rather see DEK provisioning inside
  `authenticateOffline` (the "obvious" location), that test — `expect(getDek()).toBeNull()`
  after a v1-roster offline login — inverts and needs authorization. **My recommendation is D4
  as designed: no authorization needed, better layering, one fewer modified file.** Raised only
  because the placement is not arbitrary and a future reader will wonder.
- **OQ-2 — should a detected DEK conflict (F8) show the user anything?** D6 ships detection as a
  durable record plus `console.error`, with no UI, because the only remediation is the deferred
  re-key pass. If the user wants a visible signal now, it needs new Spanish copy and a placement
  decision — both product calls, both outside what design should invent.

---

## §10. Accepted consequences to write into the spec (so nobody "fixes" them back)

1. **The device wrap ends protection against another person at the same computer.** It protects
   only against the storage being copied off the machine. Accepted for a shared POS (#2113).
2. **The XSS half of the agreed threat model is unimplemented until the sibling `csp-hardening`
   change ships.** Zero CSP exists today (grep-verified; only prose at
   `frontend-react/docs/prd/auth.md:672`). This change must not be reported as "the encryption
   story is done".
3. **One DEK per device covers every store that device touches.** `dekStoreId` records only the
   store the DEK was first bound to and is used solely to scope the eager migration pass. Cold,
   never-rewritten data belonging to a *second* store on the same device stays plaintext until
   first written — the same residual that exists today, not a new one.
4. **Losing the wrap table without losing the encrypted data is unrecoverable (F7).** The table
   IS the key material. This is why it is shape-guarded and why Q2's password wrap exists.
