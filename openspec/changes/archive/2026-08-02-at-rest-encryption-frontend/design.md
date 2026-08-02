# Design: at-rest-encryption-frontend

Make `localStorage` business data ciphertext on encryption-provisioned devices, and make the
*absence* of encryption an explicit, tested mode — without changing one byte of behavior on a device
that never imported a roster.

Artifact store: hybrid. Engram topic key: `sdd/at-rest-encryption-frontend/design`.
Inputs: `proposal.md` (obs #1749), `explore.md` (obs #1748),
`docs/plans/2026-07-25-at-rest-encryption-local-data-design.md`.
Delivery: commits-only on `feat/at-rest-encryption-frontend`, cut from `main`. No PRs.

---

## 1. The architecture in one page

Envelope encryption with a **frontend-owned marker** and a **memory-only key**.

```
password ──sha256Base64──▶ preHash ──pbkdf2Base64(wrapSalt, 210k)──▶ KEK
                                                                     │
                              roster entry {wrappedDek, wrapIv} ─────┤
                                                                     ▼
                                                          aesGcmDecrypt ──▶ DEK (32B, memory only)
                                                                                  │
   JSON.stringify(entity) ──▶ encryptEntity ──▶ "enc:v1:" + b64(iv‖ct‖tag) ──▶ localStorage
   JSON.parse(entity)     ◀── decryptEntity ◀── (marker present? decrypt : passthrough)
```

Three structural decisions carry the whole design:

| Decision | Why it is structural, not stylistic |
|---|---|
| **One AES-GCM module** (`storage/aes-gcm.ts`) used by BOTH the DEK unwrap and entity crypto | Ratified decision 3. Making it one *module* — not one *convention* — means the 16-byte tag and the `ct‖tag` layout physically cannot diverge between the two callers. |
| **`getDek()` is checked FIRST in `encryptEntity`** | A non-null DEK proves provisioning by construction (it can only come from a v2 unwrap). So the hot path never reads the roster. And `decryptEntity` dispatches on the marker before anything else, so the unprovisioned hot path costs one `String.startsWith`. Optional encryption becomes free, not merely correct. |
| **The DEK is a module-level `let`, never persisted** | The entire threat model. A storage dump that yields both key and ciphertext is obfuscation, not encryption. Consequence: the DEK does not survive reload → the unlock gate exists → §4. |

### Layout warning, stated up front

There are **two** byte layouts and they are deliberately different:

| Blob | Layout | Owner |
|---|---|---|
| `wrappedDek` (roster) | `ct ‖ tag`, with `wrapIv` carried in a **separate** Base64 field | Backend wire format (`StoreKeyWrapService.cs`) — not ours to change |
| Entity envelope | `enc:v1:` + Base64(`iv ‖ ct ‖ tag`) — self-contained | Frontend-owned |

Both funnel through the *same* `aesGcmDecrypt(key, iv, ctWithTag)`. The envelope reader splits `iv`
off first and hands the rest to the identical primitive. This is exactly the drift the "one
implementation" decision was meant to prevent, so it is named here rather than discovered at apply
time.

---

## 2. Module map

New modules are in **bold**. Arrows are static-import direction.

```
storage/base64.ts            (zero imports)                                   ◀── leaf
storage/data-key-store.ts    (zero imports)                                   ◀── leaf
storage/aes-gcm.ts           → base64? no; → @noble/ciphers/aes               ◀── leaf + dep
offline/roster-types.ts      (type-only)
offline/roster-store.ts      (import type ONLY — purity contract D1 preserved)
offline/offline-crypto.ts    (zero imports — UNTOUCHED by this change)

storage/entity-crypto.ts     → aes-gcm, base64, data-key-store, roster-store
storage/entity-migration.ts  → entity-crypto, roster-store, storage-keys
offline/dek-unwrap.ts        → offline-crypto, aes-gcm, base64
offline/unlock-gate.ts       → data-key-store, roster-store

stores/auth-store.ts         → data-key-store (STATIC, legal: not offline/)
                             → dek-unwrap, roster-store, entity-migration (DYNAMIC import only)
offline/offline-auth-service.ts → dek-unwrap, data-key-store, entity-migration (static, already offline/)
auth/routes/loaders.ts       → unlock-gate (DYNAMIC import)
auth/routes/login.tsx        → err.name dispatch only (D4: no static offline import)
6 seam files                 → entity-crypto (static)
```

| File | Status | Owns |
|---|---|---|
| **`app/shared/lib/storage/base64.ts`** | new | `base64FromBytes` / `bytesFromBase64`. Deliberately duplicates the 12 private lines in `offline-crypto.ts` — see §9 correction 3. |
| **`app/shared/lib/storage/aes-gcm.ts`** | new | The ONLY AES-GCM in the app. `aesGcmEncrypt(key, iv, pt)` / `aesGcmDecrypt(key, iv, ctWithTag)` over `gcm()` from `@noble/ciphers/aes`. Exports `AES_GCM_IV_BYTES = 12`, `AES_GCM_TAG_BYTES = 16`. |
| **`app/shared/lib/storage/data-key-store.ts`** | new | `setDek(bytes, storeId)` / `getDek()` / `getDekStoreId()` / `clearDek()`. Two module-level `let`s. No imports, no storage, no crypto. |
| **`app/shared/lib/storage/entity-crypto.ts`** | new | `ENTITY_ENVELOPE_PREFIX = 'enc:v1:'`, `isEncrypted`, `encryptEntity`, `decryptEntity`, `MissingDataKeyError`. |
| **`app/shared/lib/storage/entity-migration.ts`** | new | `runEntityMigration(): void` — the eager, byte-preserving, idempotent pass. |
| **`app/shared/lib/offline/dek-unwrap.ts`** | new | `unwrapDek(password, entry)`, `DekUnwrapError`, `DEK_WRAP_ITERATIONS = 210_000`. |
| **`app/shared/lib/offline/unlock-gate.ts`** | new | `needsUnlock(user)`. |
| `offline/roster-types.ts` | modified | +3 **optional** wrap fields. `formatVersion` stays `number` (§9 correction 7). |
| `offline/roster-store.ts` | modified | +`getRawRoster()`, +`isEncryptionProvisioned()`; `getRoster()` refactored to sit on top of `getRawRoster()`. |
| `stores/auth-store.ts` | modified | `login` unwraps + fires migration; `logout` calls `clearDek()`. |
| `offline/offline-auth-service.ts` | modified | `authenticateOffline` unwraps + fires migration after the verifier check. |
| `auth/routes/loaders.ts` | modified | Unlock gate in `authLoader` + `guestOnlyLoader` — **only these two** (§9 correction 8). |
| `auth/routes/login.tsx` | modified | `?unlock=1` banner + `DekUnwrapError` → `AUTH.UNLOCK_FAILED`. |
| `shared/lib/i18n/es.ts` | modified | 2 new Spanish keys. |
| 6 seam files | modified | 16 call sites (§3). |
| `http/roster-http-service.ts`, `management/users/components/roster-export-panel.tsx` | modified | Delete the stale "endpoint does not exist server-side yet" comments. |
| `apps/web-store-pos/package.json` | modified | `@noble/ciphers`, exact pin, no caret. |

### Why `data-key-store.ts` lives in `storage/`, not `offline/`

`auth-store.logout()` is **synchronous** and must call `clearDek()`, so a dynamic import is not an
option — it needs a static one. But `auth-store.ts` carries an explicit design contract (D6,
`auth-store.ts:189-193`): *zero static `offline/` imports*, because the module is evaluated on every
page load. Placing the key store under `storage/` makes the static import legal **by construction**
rather than by exemption, and it is a genuine zero-import leaf so the D6 rationale ("would drag
crypto + localStorage offline modules") does not apply to it.

---

## 3. The seam boundary — one rule, 16 call sites

**The rule (uniform, no exceptions):**

- `decryptEntity` is applied **immediately at the `getItem` boundary** — before any sentinel
  comparison (`!== '{}'`), before any `||` fallback, before `JSON.parse`.
- `encryptEntity` is applied **immediately at the `setItem` boundary** — after `JSON.stringify`.

Getting that order wrong is a silent behavior change: the `'{}'` / `'[]'` sentinels in four of the
six services would end up compared against ciphertext.

| Entity | Encrypt (1) | Decrypt (1-2) | Total |
|---|---|---|---|
| Products (`sales/lib/repositories/product-repository.ts`) | `setProductsLocalStorage` :390 | `getProductsFromLocalStorage` :411, `getProductsJson` :385 | 3 |
| Categories (`sales/lib/repositories/product-category-repository.ts`) | `setProductCategoriesLocalStorage` :219 | `getProductCategoriesFromLocalStorage` :229, `getCategoriesJson` :203 | 3 |
| Inventory (`inventory/lib/services/inventory-offline-service.ts`) | `setInventoriesLocalStorage` :897 | `getInventoriesFromLocalStorage` :937, `getInventoryEntriesJson` :925 | 3 |
| Orders (`sales/lib/services/order-offline-service.ts`) | `setOrdersLocalStorage` :571 | `getOrdersFromLocalStorage` :594, `getOrdersJson` :566 | 3 |
| Expenses (`expenses/lib/services/expense-offline-service.ts`) | `setExpensesLocalStorage` :252 | `getExpensesFromLocalStorage` :274 | **2** |
| Sale-credits (`sales/lib/services/sale-credit-offline-service.ts`) | `setSaleCreditsLocalStorage` :366 | `getSaleCreditsFromLocalStorage` :389 | **2** |

**16 total = 6 encrypt + 10 decrypt.** Not 18 — expenses and sale-credits have no raw `getXJson`
getter (§9 correction 1). Storage keys are `StorageKeys.entityKey(name, storeId)` for exactly
`products | product-categories | inventory-entries | orders | expenses | saleCredits`; a repo-wide
grep confirms **nothing else** reads those keys, so the six services are a closed seam.

`decryptEntity(stored: string | null): string | null` — `null` in, `null` out, so
`decryptEntity(getItem(k)) || '[]'` preserves each service's exact fallback semantics.

### The auto-init trap (checked, and it holds)

Every read seam is `try { getItem → parse } catch { /* ignore */ }` followed by an auto-init write
**outside** the try. Verified at all six sites. So on a provisioned device with no DEK:
`decryptEntity` throws inside the try → swallowed → auto-init calls `encryptEntity` → which **also**
throws `MissingDataKeyError`, and that one is outside the try and propagates. The user's ciphertext
is never overwritten with an empty container. This is load-bearing: it is the reason the missing-DEK
guard fails loudly instead of destroying data, and any refactor that moves the auto-init write
inside the try breaks it.

The residual case — DEK present, ciphertext corrupt — degrades exactly like today's corrupt-JSON
path (auto-init overwrites). That is existing 1:1-Angular behavior applied to already-unreadable
data; noted, not changed.

### Sync export/import is unaffected by design

`data-serializer-service.ts:171-178` consumes `getCategoriesJson` / `getProductsJson` /
`getInventoryEntriesJson`. Because those are decrypt seams, the export continues to produce
**plaintext JSON inside the existing AES zip** — the sync file format is byte-identical. Sync import
writes through the same `setXLocalStorage` methods, so imported data is encrypted at rest for free.

---

## 4. Trap 1 — the expiry-independent roster read

**The failure being prevented:** `getRoster()` returns `null` past `expiresAt`. If encryption reused
it, the day a bundle expired the device would conclude "plaintext mode" and the very next write
would overwrite ciphertext it can no longer read. Expired means *"authenticate online again"*; it
never means *"your data is plaintext."*

**Resolution — one raw reader, one expiry gate layered on top**, both in `roster-store.ts`:

```ts
/** Raw stored bundle. Shape-guarded (D3), expiry-IGNORING. Never throws. */
export function getRawRoster(): OfflineRosterBundle | null {
  const raw = localStorage.getItem(ROSTER_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  return hasValidShape(parsed) ? parsed : null;
}

/** UNCHANGED CONTRACT — now expressed as "raw read + expiry gate". */
export function getRoster(now: number = Date.now()): OfflineRosterBundle | null {
  const bundle = getRawRoster();
  if (!bundle || bundle.expiresAt <= now) return null;
  return bundle;
}

/** Are the bytes on disk supposed to be ciphertext? Expiry is irrelevant here. */
export function isEncryptionProvisioned(): boolean {
  const bundle = getRawRoster();
  return !!bundle && bundle.formatVersion >= 2 && bundle.users.some((u) => !!u.wrappedDek);
}
```

| Property | Value |
|---|---|
| Name | `getRawRoster()` |
| Home | `app/shared/lib/offline/roster-store.ts` |
| Contract | Never throws. Returns the shape-guarded bundle **regardless of `expiresAt`**, or `null` if absent/corrupt/malformed. No `now` parameter — taking one would invite reintroducing the expiry check. |
| Relation to `getRoster` | `getRoster` is now *defined as* `getRawRoster` + one expiry comparison. The asymmetry is structural (one gate, one place), not two parallel readers that can drift. |
| Purity | Adds no imports → `roster-store.purity.test.ts` (behavioral + structural) stays green unchanged. |
| Callers | `isEncryptionProvisioned()`, `needsUnlock()`, and both DEK-unwrap wire points. Never a seam. |

**Explicitly rejected:** caching the predicate in memory. Not because caching is slow-path wrong,
but because the invalidation surface (import / clear / another tab) is a silent-data-loss surface,
and the hot path is already free (§1, `getDek()` checked first). If profiling later demands it, the
cache belongs *inside* `roster-store.ts` so the purity contract survives.

---

## 5. Trap 2 — the unlock gate, and the four combinations

**The failure being prevented:** gating on `getDek() !== null` strands every online-auth-only user.
Their DEK is `null` by design, forever. `authLoader` would bounce them to `/login`, they would log
in, land home, and `authLoader` would bounce them again — an infinite loop for the *majority* of
users, caused by a feature they never enabled.

### Where it lands — exactly two loaders

`app/shared/components/app-layout.tsx:17` sets `clientLoader = authLoader`, and that layout wraps
**every** authenticated route. React Router runs the parent layout loader for all nested routes, so
`authLoader` is already the single chokepoint. `public-app-layout` (help/tutorial) deliberately does
not use it and stays reachable while locked.

```ts
// loaders.ts — new helper, sits beside denyAccess()
async function unlockGate(user: UserModel): Promise<Response | null> {
  const { needsUnlock } = await import('~/shared/lib/offline/unlock-gate');
  // NOTE: redirect WITHOUT logout(). The session and the roster must survive so
  // the re-login can complete offline on a provisioned device.
  return needsUnlock(user) ? redirect('/login?unlock=1') : null;
}

export async function authLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) return denyAccess();
  return unlockGate(user);                       // ← insertion point, after the auth check
}

export async function guestOnlyLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (isAuthenticated && user) {
    const { needsUnlock } = await import('~/shared/lib/offline/unlock-gate');
    if (needsUnlock(user)) return null;          // ← RENDER the login form. Do NOT bounce.
    preloadHeavyChunks();
    return redirect(await resolveUserHomePath(user));
  }
  return null;
}
```

Dynamic import, mirroring the established `login.tsx:93` pattern (D1/D4) — `loaders.ts` keeps zero
static `offline/` imports.

### `needsUnlock` — per USER, not per device

```ts
// offline/unlock-gate.ts
export function needsUnlock(user: { login: string } | null): boolean {
  if (!user) return false;
  if (getDek() !== null) return false;
  const bundle = getRawRoster();                        // expiry-IGNORING
  if (!bundle || bundle.formatVersion < 2) return false;
  const entry = bundle.users.find((u) => u.login === user.login);
  return !!entry?.wrappedDek && !!entry.wrapSalt && !!entry.wrapIv;
}
```

Per-user matters: a v2 roster that does not contain *this* login gives this user nothing to unwrap.
Gating on device-level provisioning would strand them just as thoroughly as gating on the DEK. The
non-empty checks matter too — the backend defaults the three fields to `""`, not `null`.

### The four combinations of `guestOnlyLoader`

| Roster provisioned **for this user** | DEK in memory | `needsUnlock` | `guestOnlyLoader` | Why |
|---|---|---|---|---|
| No (no bundle / v1 / user absent) | null | `false` | redirect to home | **The majority case.** Online-auth-only users. Byte-for-byte today's behavior. |
| No | present | `false` | redirect to home | Only reachable if the roster was cleared after an unlock. Already unlocked; nothing to gate. |
| **Yes** | **null** | **`true`** | **return `null` → render the login form** | This IS the unlock screen. Bouncing here is the loop. |
| Yes | present | `false` | redirect to home | Unlocked. Normal authenticated visitor at `/login`. |

And `authLoader`: unauthenticated → `denyAccess()` (unchanged); authenticated + `needsUnlock` false
→ `null` (unchanged); authenticated + `needsUnlock` true → `redirect('/login?unlock=1')` **with no
logout**.

### The gate never needs connectivity

`login.tsx:94` picks the auth path with `isRosterProvisioned()` (expiry-honoring):

- valid bundle → `loginOffline` → `authenticateOffline` → unwrap → `setDek`. Works with no network.
- expired bundle → online `login` → unwrap from `getRawRoster()` → `setDek`. Requires network, which
  is precisely what "expired" means.

---

## 6. The crypto path, end to end

Diff this table against `StoreKeyWrapService.cs` and `StoreDataKeyProvider.cs` line by line.

| # | Step | Exact parameters | Frontend code | Backend source |
|---|---|---|---|---|
| 0 | DEK derivation | HKDF-SHA256, ikm = UTF8(masterSecret), salt = `null`, info = UTF8(`storeId.ToString("D")`), 32 bytes | **none — server-side only** | `StoreDataKeyProvider.cs:17-21` |
| 1 | Pre-hash | `Base64(SHA256(UTF8(password)))` — a **Base64 STRING** | `sha256Base64(password)` (`offline-crypto.ts:40`, reused verbatim) | `HashPasswordService.cs:11-20` |
| 2 | KEK | PBKDF2-HMAC-SHA256 over **UTF8 bytes of that Base64 string**, salt = `bytesFromBase64(wrapSalt)` (16B), **210 000** iterations, 32-byte output | `pbkdf2Base64(preHash, wrapSalt, DEK_WRAP_ITERATIONS)` (`offline-crypto.ts:51`, reused verbatim) | `StoreKeyWrapService.cs:15-41`, param `storedPasswordHash` |
| 3 | Unwrap | AES-256-GCM, iv = `bytesFromBase64(wrapIv)` (12B), input = `bytesFromBase64(wrappedDek)` (48B = 32 ct + 16 tag), tag = 16B, layout `ct‖tag` | `aesGcmDecrypt(kek, iv, wrapped)` | `new AesGcm(kek, 16)` |
| 4 | Assert | `dek.length === 32`, else `DekUnwrapError` | `dek-unwrap.ts` | — |

Two things that bite:

1. **Step 2's input is the Base64 STRING, not the raw password and not the digest bytes.**
   `pbkdf2Base64` does `new TextEncoder().encode(input)` — UTF-8 bytes of the Base64 text. That
   matches `Encoding.UTF8.GetBytes(su.User.Password)` exactly. Passing raw bytes instead produces a
   different KEK and a failure that looks like a wrong password.
2. **The wrap's iteration count is NOT on the wire.** `verifier.iterations` travels per user in the
   bundle and can be rotated server-side; the *wrap* has no such field — the backend hardcodes
   `210_000`. So `DEK_WRAP_ITERATIONS = 210_000` is a frontend constant with **zero wire
   protection**. It is the single most drift-prone parameter in this change and the KAT is its only
   defense.

```ts
// offline/dek-unwrap.ts
export const DEK_WRAP_ITERATIONS = 210_000; // StoreKeyWrapService.cs:15-41 — NOT carried on the
                                            // wire, unlike verifier.iterations. Pinned by KAT.
export async function unwrapDek(
  password: string,
  entry: { wrappedDek: string; wrapSalt: string; wrapIv: string },
): Promise<Uint8Array> { /* steps 1-4 above; any throw → DekUnwrapError */ }
```

### Known-answer-vector strategy

| | |
|---|---|
| **Source (preferred)** | A one-off .NET runner against the real `StoreKeyWrapService` / `StoreDataKeyProvider`, printing Base64 of `storedPasswordHash`, `wrapSalt`, `wrapIv`, `wrappedDek` and the expected `dek`, for a fixed known password. This is the only artifact that *proves interop*. |
| **Source (fallback)** | If the backend cannot be run at apply time: derive the vector with Node's `crypto` (`pbkdf2Sync` + `createCipheriv('aes-256-gcm')`) transcribed directly from `StoreKeyWrapService.cs`. **This pins frontend regressions but does NOT prove interop** — it is the same reading of the spec, twice. The fixture MUST carry a `"provenance": "node-transcription"` field so nobody later mistakes it for a backend vector. |
| **Committed at** | `app/shared/lib/offline/__tests__/__fixtures__/dek-kat.json`, with a header block naming the generator command and the backend commit SHA it was produced from. |
| **What fails on drift** | Iteration count, hash algorithm, key length, tag length, `ct‖tag` order, UTF-8-of-Base64 vs raw-bytes input — every one of them breaks `dek-unwrap.kat.test.ts`. Following the convention already stated at `offline-crypto.ts:1-14`: *a KAT break must fail a test, never lock out a user silently.* |
| **Second KAT** | A frozen `enc:v1:` sample + fixed DEK + expected plaintext, in `entity-crypto.kat.test.ts`. Entity ciphertext has no interop partner, but a value written by today's code must be readable by every future version — this pins the envelope layout across releases. |

---

## 7. Ciphertext envelope on disk

```
enc:v1:<base64( iv(12) ‖ ciphertext(n) ‖ tag(16) )>
```

| Question | Answer |
|---|---|
| How does `decryptEntity` distinguish marked from unmarked? | `stored.startsWith('enc:v1:')`. Nothing else. |
| Why is that safe? | Every stored value is `JSON.stringify(...)` output — it begins with `[` or `{`, or is the literal sentinel `'{}'` / `'[]'`. The byte sequence `enc:` cannot begin a JSON document, so a false positive is impossible by construction, not by luck. |
| Why is the distinction **permanent**, not a migration window? | It is what makes the eager pass **safe to fail**. A pass killed by quota or a closed tab leaves some keys ciphertext and some plaintext; the app must read both with no special case. Removing the passthrough later would turn a partially-migrated device into a bricked device. It is also what keeps the app working the instant the update lands, before any DEK exists. |
| Future formats? | `enc:v2:` etc. The reader dispatches on the version segment; `v1` decoding is never removed. |
| Size cost | Base64 of `n + 28` bytes plus a 7-char prefix ≈ **1.34× the plaintext**. Real against the ~5 MB `localStorage` cap — see §11. |

```ts
export const ENTITY_ENVELOPE_PREFIX = 'enc:v1:';

export function encryptEntity(plaintext: string): string {
  const dek = getDek();
  if (dek !== null) { /* iv = crypto.getRandomValues(12); marker + b64(iv‖ct‖tag) */ }
  if (!isEncryptionProvisioned()) return plaintext;   // PLAINTEXT MODE — never throws
  throw new MissingDataKeyError();                    // provisioned but locked (gate should prevent)
}

export function decryptEntity(stored: string | null): string | null {
  if (stored === null) return null;
  if (!stored.startsWith(ENTITY_ENVELOPE_PREFIX)) return stored;  // permanent passthrough
  const dek = getDek();
  if (dek === null) throw new MissingDataKeyError();
  return utf8(aesGcmDecrypt(dek, iv, ctWithTag));                 // GCM failure propagates
}
```

Note the ordering in `encryptEntity`: DEK check first (free), roster read only on the locked path.
That is what makes the "roster never imported" path cost one function call and zero storage reads.

---

## 8. The eager migration pass

```ts
// storage/entity-migration.ts
const ENTITY_NAMES = ['products','product-categories','inventory-entries','orders','expenses','saleCredits'];
export function runEntityMigration(): void { /* see contract below */ }
```

| Property | Contract |
|---|---|
| **When** | Called explicitly immediately after a successful `setDek(...)`, in **both** login paths, inside `try { runEntityMigration(); } catch { /* swallow */ }`. Not a side effect of `setDek` — an explicit exported function is directly testable and keeps `setDek` a pure setter. |
| **Guard** | Returns immediately if `!isEncryptionProvisioned()`. |
| **Scope** | `storeId = getRawRoster()!.storeId` — the **roster's** store, NOT `user.selectedStoreId` (§9 correction 6). The roster's store is the store the DEK actually belongs to, so the pass can never mass-encrypt a foreign store's keys. |
| **Byte-preserving** | Raw `getItem(key)` → skip if `null` or already `isEncrypted(...)` → `setItem(key, encryptEntity(raw))`. It **never parses**. It must NOT route through the service write seams (§9 correction 5). |
| **Idempotent** | The `enc:v1:` skip. Running it twice, or ten times, is a no-op. |
| **Absent keys** | Skipped — the pass never *creates* a key. An entity the user never touched stays absent instead of gaining an encrypted empty container. |
| **Partial failure** | Per-key `try/catch`. A failure on one key does not abort the remaining five. |
| **Quota exceeded** | `setItem` is atomic per key: if it throws, the previous plaintext value survives intact. The device is left mixed, and the permanent passthrough reads it. Next unlock retries. |
| **Tab closed mid-pass** | Identical to partial failure. Keys already converted stay converted; the rest convert on the next unlock. |
| **Never blocks login** | The call site swallows everything. Worst case degrades to "still plaintext" — never to "cannot log in". This is a direct consequence of ratified decision 2. |

**Why eager and not lazy-on-write:** writes already re-encrypt whatever they touch, so lazy migration
converts hot data for free — but cold data never converts. A product catalog read constantly and
edited twice a year would sit in plaintext **indefinitely** on a device the user believes is
encrypted. That is the exact silent-false-confidence failure this whole change exists to eliminate;
lazy would fix the symptom and preserve the disease.

---

## 9. Corrections to the proposal / exploration

Ten items. Each costs nothing here and would have cost a rework in `sdd-tasks` or `sdd-apply`.

| # | Claim | Correction | Evidence |
|---|---|---|---|
| 1 | "SIX seams × **3 call sites** each" (≈18) | **16**: 6 encrypt + 10 decrypt. Expenses and sale-credits have **2** each — no raw `getXJson` getter exists for them. | `rg localStorage.(set\|get)Item` across the six files |
| 2 | "All twelve seam locations still exist at the SAME line numbers" | True for products/categories/inventory/expenses. **Orders drifted +3** (563/568/591 → 566/571/594) and **sale-credits drifted −11** (377/400 → 366/389). The explore only spot-checked `product-repository.ts`. | direct read |
| 3 | "`offline-crypto.ts` — add `unwrapDek` + `DekUnwrapError`" | `offline-crypto.ts` is **NOT modified at all**. It declares itself a *zero-import leaf module (design D1)* and its behavior is KAT-pinned for the live offline-auth path. `unwrapDek` goes in a new `offline/dek-unwrap.ts` that imports it. Base64 helpers are duplicated into `storage/base64.ts` (12 lines) rather than exported from it — the correct price for not touching a KAT-pinned crypto module on a change whose whole risk is crypto drift. | `offline-crypto.ts:1-14` |
| 4 | `data-key-store.ts` under `offline/` | Moved to `storage/`. `auth-store.logout()` is sync and needs `clearDek()` via a **static** import, but `auth-store.ts` contracts D6: zero static `offline/` imports. `storage/` makes it legal by construction. | `auth-store.ts:189-193` |
| 5 | Migration "re-writing each value **through the encrypting write seam**" | **Must not.** Those seams apply date revival, `isCredit`/`paymentType` backfills (`order-offline-service.ts:590-592`) and auto-init-on-unparsable — they **mutate business data**. The pass does raw `getItem → encryptEntity → setItem` and never parses. | read seams, all six |
| 6 | Migration "scoped to the current `storeId`" | Scoped to **`getRawRoster().storeId`**. A super-admin whose `selectedStoreId` differs from the roster's store would otherwise have another store's keys mass-encrypted under a DEK that does not belong to them. | `StorageKeys.entityKey` |
| 7 | "tighten `formatVersion`" to `1 \| 2` | **Do not.** `deserializeRoster` casts (`JSON.parse(text) as OfflineRosterBundle`) with no runtime check, so a future v3 bundle would be mis-typed as `1\|2`. Keep `number`; gate on `>= 2`. The three wrap fields are **optional** (`wrappedDek?: string`) — required would be a lie for v1 and would break all 11 existing fixtures. | `roster-serializer.ts` |
| 8 | Unlock gate "in `loaders.ts`" (implying every loader) | Exactly **two** functions: `authLoader` and `guestOnlyLoader`. `app-layout.tsx:17` sets `clientLoader = authLoader` and React Router runs the parent layout loader for every authenticated route. Sprinkling it through the other five loaders would be redundant and would create five places to get it wrong. | `app-layout.tsx:17`, `routes.ts:34` |
| 9 | Crypto contract table lists PBKDF2 iterations as a parameter | Worth escalating: `verifier.iterations` travels **on the wire** per user, but the **wrap's** 210 000 does **not** — it is hardcoded on both sides with zero protocol protection. This is the highest-drift-risk constant in the change. | `StoreKeyWrapService.cs:15-41` vs `OfflineVerifierDto` |
| 10 | (unstated) online-path unwrap failure handling | A `DekUnwrapError` on the **online** path must **fail the login**, not be swallowed. Swallowing leaves the user authenticated with no DEK on a provisioned device → `needsUnlock` true → `authLoader` bounces to `/login` → login "succeeds" → bounce again. Infinite loop. Legitimate cause: the user changed their password after the roster was exported. | §5 + §10 |

Everything else in the proposal survives contact with the code unchanged, including both ratified
decisions, the two-predicate split, the eager-migration verdict, and the `@noble/ciphers` verdict.

---

## 10. Error taxonomy

| Error | Home | Thrown when | User sees | i18n |
|---|---|---|---|---|
| `DekUnwrapError` | `offline/dek-unwrap.ts` | AES-GCM tag rejection during unwrap: wrong password, roster wrapped under an older password, parameter drift, tampered bundle. Also `dek.length !== 32`. | Login form, red banner | **new** `AUTH.UNLOCK_FAILED` |
| `MissingDataKeyError` | `storage/entity-crypto.ts` | Provisioned + DEK absent, on `encryptEntity`; or a marked value on `decryptEntity` with no DEK. | Nothing — it is a programming-error guard, not a user path. The unlock gate precedes every data screen. | **none, deliberately** |
| (GCM failure inside `decryptEntity`) | propagates raw | Corrupt/tampered ciphertext with a valid DEK | Read seams swallow it into their existing auto-init path (identical to today's corrupt-JSON behavior) | none |

**Where `DekUnwrapError` is raised and mapped:**

- **Offline path** (`authenticateOffline`): the verifier has already passed, so the password *is*
  the roster's password. A failure here means parameter drift or a corrupt bundle. Throw; the
  existing `offlineErrorMessageId(err)` dispatcher in `login.tsx:33-43` gains one `err.name` case
  (D4 convention — dispatch by name, never `instanceof`, so `login.tsx` keeps zero static offline
  imports).
- **Online path** (`auth-store.login`): unwrap runs after the successful `/me` hydration, inside a
  `try`. On `DekUnwrapError`, **rethrow** (correction 10). `login.tsx`'s online `catch` gains a
  `name === 'DekUnwrapError'` branch mapping to the same key. If the roster carries no entry for
  this login, or the device is not encryption-provisioned, the unwrap is **skipped entirely** — no
  error, plaintext mode.

**New Spanish copy** (`app/shared/lib/i18n/es.ts`, the repo's single locale — blanket text-parity
rule, Rioplatense voseo matching the surrounding `AUTH.*` block):

```ts
'AUTH.UNLOCK_REQUIRED': 'Ingresá tu contraseña para desbloquear los datos de este dispositivo.',
'AUTH.UNLOCK_FAILED': 'No se pudieron desbloquear los datos de este dispositivo. Si cambiaste tu contraseña, pedí una nueva activación.',
```

`AUTH.UNLOCK_REQUIRED` renders as an amber banner on `/login` when `?unlock=1` is present (same
slot as the existing `AUTH.OFFLINE_LOGIN` banner). Without it, a user who merely reloaded is thrown
back to a bare login screen with no explanation — which reads as a bug.

---

## 11. DEK state lifecycle

`storage/data-key-store.ts` holds two module-level `let`s. Nothing else in the app holds the DEK.

| Point | Action |
|---|---|
| Module evaluation | `dek = null`, `dekStoreId = null` |
| `auth-store.login` — success, encryption-provisioned, roster entry found for this login | `setDek(await unwrapDek(password, entry), bundle.storeId)` then `runEntityMigration()` |
| `authenticateOffline` — after the verifier check passes, before `toUserModel` | same |
| `auth-store.logout()` | `clearDek()` (sync, static import) |
| Idle lock — 1 h, **offline sessions only** (`app-layout.tsx:54,58`) | fires `logout()` → `clearDek()` |
| `getUserByToken()` cold boot | **never sets a DEK** — no password in scope. This is the reason the gate exists. |
| Tab close / reload / crash | Gone. Not persisted anywhere. |
| Another tab | Separate JS realm, separate DEK. Each tab unlocks independently. |

**Does the DEK survive a page reload? No — and that is the point.** Consequences, stated plainly:

- **Provisioned device, reload:** `getDek()` is `null`, `needsUnlock` is `true`, `authLoader`
  redirects to `/login?unlock=1` **without logging out**. The user re-enters their own password; the
  normal login flow runs (offline if the bundle is valid, online if expired); the unwrap is a side
  effect; `navigate(resolveUserHomePath(user))` re-runs `authLoader`, which now passes. **Every
  reload on a provisioned device costs one password entry.** That is the accepted price of a
  browser having no secure keystore, and it is the design's central UX tradeoff.
- **Unprovisioned device, reload:** `isEncryptionProvisioned()` is `false`, `needsUnlock` is
  `false`, the cold-boot restore at `auth-store.ts:70-84` is untouched. Byte-for-byte today.

**Known limitation (named, not fixed in v1):** an owner/super-admin who switches `selectedStoreId`
to a store *not* covered by the roster will write that store's entities encrypted under the roster
store's DEK. It stays readable as long as the roster is not replaced. `dekStoreId` is recorded for
observability and the migration pass is scoped to `bundle.storeId` so the pass itself can never
touch a foreign store. Full per-store DEK caching is explicitly out of scope.

---

## 12. TDD plan

Strict TDD is ACTIVE. Every module below starts with the named failing test. `crypto.subtle` is
confirmed working under jsdom with no polyfill (`offline-crypto.test.ts` already exercises
`digest`/`importKey`/`deriveBits` in the passing suite); `@noble/ciphers` is pure JS and needs none.

| Module | First failing test asserts |
|---|---|
| `storage/base64.ts` | `bytesFromBase64(base64FromBytes(bytes))` round-trips a fixed 48-byte vector including `0x00` and `0xFF`. |
| `storage/aes-gcm.ts` | `aesGcmDecrypt` on a **fixed** key/iv/`ct‖tag` triple returns the expected plaintext bytes, and flipping one byte of the tag **throws**. Tag-length and layout are pinned here, once, for both callers. |
| `storage/data-key-store.ts` | `getDek()` is `null` before any `setDek`; returns the exact bytes after; is `null` again after `clearDek()`. |
| `offline/dek-unwrap.ts` | **KAT**: `unwrapDek(knownPassword, fixtureEntry)` equals the fixture's expected 32-byte DEK. Then: wrong password → `DekUnwrapError`; `DEK_WRAP_ITERATIONS` changed → KAT fails. |
| `offline/roster-store.ts` | `getRawRoster()` returns a bundle whose `expiresAt` is in the past **while `getRoster()` returns null for the same bytes**. Plus: `isEncryptionProvisioned()` stays `true` for that expired bundle. This is the single test that pins trap 1. |
| `storage/entity-crypto.ts` | `decryptEntity('[{"a":1}]')` returns it unchanged (no marker). Then: v2 roster + DEK → output starts with `enc:v1:` and round-trips; **no roster + no DEK → `encryptEntity` returns input unchanged and does NOT throw** (the optional-encryption MUST); v2 roster + no DEK → `MissingDataKeyError`; `decryptEntity(null)` → `null`. |
| `storage/entity-migration.ts` | Seed one plaintext key + one already-`enc:v1:` key, set DEK, run → the plaintext key is now marked and decrypts to the **identical original string** (byte-preserving), the marked key is untouched. Run twice → identical result. Then: `isEncryptionProvisioned()` false → no writes at all; a `setItem` that throws on key 3 does not prevent keys 4-6 from converting. |
| `offline/unlock-gate.ts` | All four rows of the §5 table, as four cases. The **`false` for the no-roster + no-DEK row is the regression test for the stranding bug**. |
| `auth/routes/loaders.ts` | `guestOnlyLoader` with an authenticated online-auth-only user and no roster → returns a redirect (not `null`). Then: v2 roster for this login + no DEK → returns `null`. `authLoader` in that same state → redirects to `/login?unlock=1` **and `useAuthStore.getState().user` is still non-null** (no logout). |
| `stores/auth-store.ts` | With a v2 roster seeded and `authHttpService` mocked, `login(user, pass)` leaves `getDek() !== null`. Then: `logout()` → `getDek() === null`. Then: **no roster seeded → `login` succeeds and `getDek()` is `null`, no throw** (the online-auth-only MUST). Then: roster wrapped under a different password → `login` rejects with a `DekUnwrapError`-named error. |
| `offline/offline-auth-service.ts` | v2 roster → `authenticateOffline` leaves `getDek() !== null`; **v1 roster → succeeds exactly as today and `getDek()` stays `null`** (the 11 existing fixtures become this regression). |
| each of the 6 seams (`*.crypto.test.ts`) | With a v2 roster + DEK: write, then read `localStorage.getItem(StorageKeys.entityKey(name, storeId))` **directly** and assert it starts with `enc:v1:`; then read through the service and assert the object round-trips with Map/date revival intact. Then the plaintext-mode twin: no roster → the raw stored value is plain JSON, identical to today. |
| `login.tsx` | `?unlock=1` renders the `AUTH.UNLOCK_REQUIRED` banner; a thrown `{name:'DekUnwrapError'}` renders `AUTH.UNLOCK_FAILED`. |

**Observability flags** — two things are not observable by default, and here is how they are made so:

1. **The DEK's absence of persistence.** A test can prove `getDek()` returns bytes, but "it is never
   written to storage" is a negative. Assert it directly: after `setDek`, iterate
   `Object.keys(localStorage)` and `sessionStorage` and assert **no** value contains the Base64 of
   the DEK. That converts the core threat-model claim into a test.
2. **Migration timing relative to login.** Because `runEntityMigration` is an explicitly exported
   function called from the login paths (rather than a hidden side effect of `setDek`), it is
   directly callable in tests and its call from `login` is observable by seeding a plaintext key and
   asserting it is marked after `login` resolves.

Everything else — `needsUnlock`, `isEncryptionProvisioned`, `encryptEntity`, `decryptEntity` — is a
pure function of `localStorage` + module state and needs no seams.

**Gates**, run from `frontend-react/`: `pnpm typecheck` (5 tasks), `pnpm test`, `pnpm lint`
(4 packages; `--max-warnings=0` is baked into each package script — do **not** pass it at the turbo
root, turbo does not forward it). `fd`/`eza` are unavailable in this shell; use
`rg --files --glob '<pattern>'`.

---

## 13. Work-unit spine (preview for `sdd-tasks`)

Each row is independently committable and leaves the app green. Delivery is commits-only on
`feat/at-rest-encryption-frontend`.

| WU | Content | Depends on | Behavior change on any device |
|---|---|---|---|
| 1 | `@noble/ciphers` exact pin + `storage/base64.ts` + `storage/aes-gcm.ts` + its fixed-vector test | — | none (dead code) |
| 2 | `roster-types.ts` +3 optional fields; `roster-store.ts` `getRawRoster()` + `isEncryptionProvisioned()`; `getRoster()` refactored on top; expired-bundle test; purity test still green | — | none |
| 3 | `offline/dek-unwrap.ts` + `DekUnwrapError` + **the KAT fixture** | 1, 2 | none |
| 4 | `storage/data-key-store.ts` + `storage/entity-crypto.ts` + envelope KAT | 1, 2 | none |
| 5-10 | **One seam per commit**: products → categories → inventory → orders → expenses → sale-credits, each with its `.crypto.test.ts` | 4 | **none** — no DEK is ever set until WU11, so every seam is a proven no-op in plaintext mode. This is the safety property that makes six independent commits worth it. |
| 11 | Auth wiring: `auth-store.login` unwrap + rethrow, `authenticateOffline` unwrap, `logout → clearDek` | 3, 4 | **first behavior change.** Encryption goes live on provisioned devices. |
| 12 | `offline/unlock-gate.ts` + `authLoader`/`guestOnlyLoader` + `login.tsx` banner & error mapping + 2 i18n keys | 11 | reload on a provisioned device now asks for the password |
| 13 | `storage/entity-migration.ts` + fire-and-forget wiring into both login paths | 11 | cold data converts on provisioned devices |
| 14 | v2 fixtures alongside the 11 v1 ones; delete the stale "endpoint does not exist" comments in `roster-http-service.ts:4-12` and `roster-export-panel.tsx:11-19` | — | none |

**Ordering constraints that matter:** WU11 must not land before WU12, or a provisioned device gains
ciphertext with no unlock gate — the one intermediate state that produces `MissingDataKeyError` in
normal use. If they cannot be committed together, WU12 first (an inert gate: `needsUnlock` is always
`false` while nothing ever sets a DEK), then WU11. WU13 may land any time after WU11.

---

## Checklist for the reviewer

- [ ] `isEncryptionProvisioned()` never calls `getRoster()`; `getRawRoster()` has no `now` parameter.
- [ ] `guestOnlyLoader` returns `null` (renders the form) when `needsUnlock` is true, and redirects
      home in the other three combinations.
- [ ] `authLoader`'s unlock redirect does **not** call `logout()`.
- [ ] `encryptEntity` checks `getDek()` **before** `isEncryptionProvisioned()`.
- [ ] `decryptEntity` is applied before every `!== '{}'` comparison and every `||` fallback.
- [ ] The migration pass never calls `JSON.parse` and never routes through a service write seam.
- [ ] Exactly one module imports `@noble/ciphers`.
- [ ] `offline-crypto.ts` has zero diff.
- [ ] Every new test file has a "roster never imported" case.

## Next step

`sdd-tasks`, once `sdd-spec` has also landed. The §13 spine is the intended task skeleton; §9 is the
list of proposal statements that must NOT be transcribed into the spec verbatim.
