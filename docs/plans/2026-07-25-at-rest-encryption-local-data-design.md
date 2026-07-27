# At-rest encryption of local business data — design

**Date:** 2026-07-25
**App:** `frontend-react/apps/web-store-pos` (React PWA) + `SMCA.WebApi` (.NET 8 backend)
**Status:** Design approved, ready for implementation planning
**Depends on:** offline-auth roster bundle (`docs/plans/2026-07-25-offline-auth-{backend,frontend}-plan.md`) — this feature is built ON TOP of it and MUST ship after (or together with) it.

---

## 1. Goal

Encrypt all local business data at rest in the web-store-pos PWA so that a `localStorage` dump, an XSS exfiltration of stored values, or a device backup cannot read the store's business data in plaintext.

Today every business entity is persisted as plaintext JSON in `localStorage` through six per-entity services. There is no encryption on the business-data path (the only crypto in the app is the zip.js AES used for the manual sync import/export).

## 2. Threat model

**Protects against (in scope):**

- Someone who obtains the device storage while the app is **locked** (not unlocked in memory): stolen/lost phone, `localStorage` dump, device backup, offline forensic extraction. They find ciphertext, not plaintext.
- XSS or a malicious script that reads `localStorage` values **while no session key is in memory** (e.g. before unlock).

**Does NOT protect against (explicit non-goals):**

- A live, unlocked, compromised running app. While the app is unlocked the data-encryption key (DEK) is in memory; an attacker with code execution in that context (active XSS during an unlocked session) can read decrypted data. Encrypting at rest cannot defend the running process — that is a different problem (CSP, XSS hardening).
- Backend compromise. The backend already holds all business data in plaintext; this feature does not change the backend's trust position.

**The governing law:** in a browser/PWA there is **no secure keystore**. Encrypting at rest only helps if the key is **not stored next to the data**. The DEK must live **only in memory**, reconstructed each session from a secret the user types, and never persisted. Anything else is obfuscation, not encryption.

## 3. The core problem and the solution

The business data is **shared** by all users of a store, but each user has their **own** password. You cannot encrypt the data under one user's password — the other users could not decrypt it.

**Solution: envelope encryption.**

1. A single random **Data Encryption Key (DEK)** per store encrypts all business data.
2. The DEK is delivered to each user **wrapped** (encrypted) under a key derived from **that user's password** (the KEK — Key Encryption Key). The roster carries, per user, an encrypted copy of the **same** DEK.
3. Any store user types their password → derives their KEK → unwraps the DEK → decrypts the shared data.

This reconciles "one shared dataset" with "per-user secret", and natively supports both device modes:

- **Shared device** — several users of the same store on one phone. Each has their own wrapped-DEK entry in the roster; each unlocks the same DEK with their own password.
- **One device per user** — same mechanism; the roster on each device still contains the wrapped DEK for its user(s).

### Who wraps the DEK — the backend bridge

The wrapping is done **server-side**, at roster-export time, without the backend ever seeing a plaintext password. The backend already stores, per user, `User.Password = Base64(SHA256(utf8(password)))` (unsalted, 1 round — `SMCA.WebApi/Services/HashPasswordService.cs:11-20`). The offline-auth design already uses this exact string as the PBKDF2 input for the login verifier. We reuse the same input to derive each user's **KEK** and wrap the store DEK. The client reconstructs the identical KEK from the typed password (`PBKDF2(Base64(SHA256(password)), …)`) and unwraps the DEK.

Because the backend must be able to wrap the DEK for every user, the backend must **know** the DEK. It therefore generates and **stores one random DEK per store** (see §4.1). This is acceptable under the threat model: the backend already has all the plaintext data.

## 4. Backend design (SMCA.WebApi, .NET 8)

All additions follow the existing conventions verified in code: MediatR `IQuery`/`IQueryHandler` returning `ResponseResult<T>`, thin controllers, DTOs as `sealed class` with settable props (small value shapes as positional `records`), default camelCase JSON (no custom policy), crypto via the built-in static `Rfc2898DeriveBytes.Pbkdf2` / `AesGcm` / `RandomNumberGenerator` (net8, no new package).

### 4.1 Per-store DEK (derived, no schema change)

**Decision (refined during planning): the DEK is DERIVED, not stored.** This avoids an EF migration and keeps the backend stateless for this feature, while still being cryptographically sound (KMS-style derivation from a high-entropy server secret).

- A single high-entropy server secret lives in configuration under `StoreEncryption:MasterSecret`, following the existing secret-config pattern (`Jwt:SecretKey`, read via `IConfiguration`).
- Per store: `dek = HKDF-SHA256(ikm = utf8(masterSecret), salt = null, info = utf8(storeId), length = 32)` via the net8 built-in `HKDF`.
- Derivation is deterministic, so the DEK is **stable per store by construction** — previously-encrypted device data stays readable across re-provisions, with no persisted state and no `Store` column.
- No DEK rotation in v1 (rotating the master secret would invalidate all device ciphertext for every store; out of scope).

Alternative considered and rejected: a stored random DEK in a new `Store.DataEncryptionKey` Base64 column — sound, but requires an EF migration and mutable state for no security gain over derivation.

### 4.2 DEK-wrap crypto service

New `IStoreKeyWrapService` + `StoreKeyWrapService` (mirrors the planned `IOfflineVerifierService` shape). One method:

```
WrappedDekResult WrapDek(string storedPasswordHash, byte[] dek)
```

Behavior:

- `wrapSalt = RandomNumberGenerator.GetBytes(16)`.
- `kek = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(storedPasswordHash), wrapSalt, 210_000, HashAlgorithmName.SHA256, 32)` — same iteration count, hash, and input convention as the offline verifier, but its **own** salt (the KEK derivation is independent of the login verifier hash).
- `wrapIv = RandomNumberGenerator.GetBytes(12)`.
- `wrappedDek = AES-GCM encrypt(dek)` under `kek`/`wrapIv`, tag appended.
- Returns `WrappedDekResult(string WrappedDek, string WrapSalt, string WrapIv)` — all Base64. (The 16-byte GCM tag is concatenated to the ciphertext, or carried as a separate `WrapTag` Base64 field — implementation detail for the plan; concatenating tag to ciphertext is simplest.)

Register `AddScoped` in `Program.cs` next to `IHashPasswordService` / `IOfflineVerifierService`.

### 4.3 Roster bundle extension

Extend the offline roster the export handler already builds. Add three fields per user and bump the format version:

- `OfflineRosterUserDto` gains `string WrappedDek`, `string WrapSalt`, `string WrapIv` (alongside the existing `Verifier`).
- `OfflineRosterDto.FormatVersion` bumps `1 → 2`.

In the `ExportOfflineRosterQueryHandler`, after loading the store's DEK (generate-and-persist if absent), for each user call `_storeKeyWrap.WrapDek(user.Password, dek)` and attach the three fields. Everything else in the handler is unchanged (permission assembly, verifier, anti-replay metadata).

Backward/forward compatibility: a `formatVersion: 2` bundle is a strict superset of `1`. A client that supports encryption requires `>= 2`; the field additions do not break the offline-auth login path.

## 5. Frontend design (web-store-pos)

New modules live under `app/shared/lib/offline/` (same home as the offline-auth modules) and a small entity-crypto helper under `app/shared/lib/storage/`. Conventions followed: plain `export class`/const-object services, constructor injection of `storeId`, `~/` import alias, `crypto.randomUUID`, error classes with `readonly name` + `Object.setPrototypeOf`.

### 5.1 The synchronous-crypto constraint (key architectural decision)

The six persistence services expose **fully synchronous** read/write seams — `getXFromLocalStorage(): Map|Array` and `setXLocalStorage(...)` — called synchronously from many call sites (e.g. `product-repository.ts:411-423`, `order-offline-service.ts:591-603`). Web Crypto (`crypto.subtle`) is **asynchronous**. Making the twelve seams async would ripple through every caller — an unacceptable blast radius.

**Decision:** use a **synchronous** AES-GCM primitive for the per-entity encrypt/decrypt so the twelve seams stay synchronous, and use async `crypto.subtle` only for the **one-time DEK unwrap at unlock** (which already happens in the async login flow). The recommended primitive is `@noble/ciphers` (`gcm`) — audited, tiny, synchronous, works in browser and jsdom. (Alternative considered and rejected: rearchitect the six services to async — too large a change for no security benefit.)

Rationale: at-rest encryption is about what is **serialized to `localStorage`**. Keeping `localStorage` **always ciphertext** (encrypt on every write, decrypt on every read, with the DEK held in memory) is strictly stronger than a "decrypt-all-at-unlock into plaintext localStorage" scheme, which would leave plaintext on disk for the whole session.

### 5.2 In-memory data-key store

New `app/shared/lib/offline/data-key-store.ts`: a module-level singleton holding the raw DEK bytes **in memory only**. `setDek(bytes)`, `getDek(): Uint8Array | null`, `clearDek()`. Never touches `localStorage`/`sessionStorage`. Cleared on logout and on idle-lock.

### 5.3 DEK unwrap on login

Extend `offline-crypto.ts` with `unwrapDek(password, { wrappedDek, wrapSalt, wrapIv })`:

- `kek = pbkdf2(sha256Base64(password), wrapSalt, 210_000)` via `crypto.subtle` (matches backend byte-for-byte).
- Import `kek` as an AES-GCM key; decrypt `wrappedDek` with `wrapIv` → raw DEK bytes.
- Returns the DEK bytes; on failure throws (wrong password / tampered data).

Wire points (both funnel through `auth-store.setUser`, which is the shared hydration seam):

- **Online login** (`auth-store.login`, the only place the plaintext password is in scope): after a successful login, find the current user's entry in the locally-stored roster, `unwrapDek(password, entry)`, `setDek(...)`, then proceed with the existing `setUser` hydration.
- **Offline login** (`loginOffline`, from the offline-auth plan): same — the password is in scope in `authenticateOffline`; unwrap and `setDek` before hydrating.

### 5.4 Login screen as the unlock gate

The DEK lives only in memory, so it is absent whenever memory was cleared: after **1h idle** (offline-auth idle-lock) **and** after a **full app close/kill/reboot**. Today the cold-boot path (`auth-store.ts:69-83`) restores a valid session **without** asking for a password — which would leave a valid session with no DEK and undecryptable data.

**Decision (approved):** reuse the **existing login screen** as the single unlock gate. On startup, if there is a valid session that **needs unlocking**, route to the normal login screen and require the user to authenticate again with their **own** password. Re-authenticating runs the §5.3 unwrap and restores the DEK. Same screen, same user password — the only change is that a valid-session cold boot now requires this re-auth instead of silently restoring. No new password, no new screen, no "master".

Concretely, the auth gate/loader treats a session as needing unlock — showing login while keeping the roster and session intact so login can complete offline — when:

```
needsUnlock(user) = getDek() === null AND the local roster has a formatVersion >= 2 entry with a wrappedDek for this user
```

The second condition is essential: gating on `getDek() === null` **alone would deadlock** any store that has no encrypted roster yet (legacy or not-yet-provisioned) — the gate would show login, but login could never produce a DEK (nothing to unwrap), looping forever. Requiring a `formatVersion >= 2` roster entry means the gate only engages once encryption is actually provisioned, and non-provisioned stores keep working unchanged until their first encrypted roster arrives.

`guestOnlyLoader` must use the **same** predicate inverted (`!needsUnlock(user)`) to decide whether to bounce an already-authenticated visitor away from `/login`. Gating that bounce on `getDek() !== null` instead would strand an online-auth-only user on the login screen forever, since their DEK is null by design.

### 5.4.1 The roster file decides the mode — before any credential is checked

**Requirement (2026-07-27, user directive).** The app must work in both worlds, and which world it is in is decided by **one question asked before authentication begins**: *does this device have the roster file imported?*

```
roster file imported      →  OFFLINE authentication against that file
                             (regardless of connectivity)
                          →  DEK unwrapped at every login
                          →  business entities ENCRYPTED at rest

no roster file imported   →  ONLINE authentication, EXACTLY as today:
                             POST /login, 35-day session, /me hydration
                          →  no DEK
                          →  localStorage PLAINTEXT, as today
```

This is a **mode switch, not a fallback**. A provisioned device with perfect internet still authenticates against the file. Connectivity is not what selects the mode — it only matters inside the online branch, where it already does today (the `AUTH.OFFLINE_LOGIN` banner).

The unprovisioned case is not a degraded path to be tolerated: it is the default state of every device today and after every fresh install, and it must stay byte-for-byte what shipped before this feature.

**Why this ordering matters for encryption:** because the file decides *before* credentials are evaluated, a provisioned device unwraps the DEK on every single login. The broken intermediate state — *authenticated, store data already ciphertext, no DEK in memory* — cannot be reached through the normal flow. The `MissingDataKeyError` paths are defense-in-depth, not routine branches. And a user who is not in the roster simply cannot log in on that device: offline auth rejects them like a wrong password. Ordinary behavior, no special handling.

Two predicates implement this, and they are **deliberately not the same**:

```
isRosterProvisioned()     = a VALID (non-expired) bundle exists
                            → decides the AUTHENTICATION MODE

isEncryptionProvisioned() = a bundle exists IGNORING expiresAt
                            AND formatVersion >= 2
                            AND at least one entry carries a wrappedDek
                            → decides whether DATA ON DISK IS CIPHERTEXT
```

Bundle expiry is a session concern; it says nothing about the bytes already written to `localStorage`. If encryption honored the expiry gate, the day a bundle expired the app would conclude "plaintext mode" and overwrite ciphertext with plaintext — destroying the data. So an expired bundle means *"authenticate online again"*, never *"your data is plaintext"*; the DEK unwrap and `needsUnlock` both read the roster raw, so an online login after expiry still restores the key.

| | Plaintext mode (`false`) | Encrypted mode (`true`) |
|---|---|---|
| Login | online only, unchanged | online or offline, both unwrap the DEK |
| Writes | plaintext, as today | `enc:v1:` ciphertext |
| Reads | passthrough | decrypt |
| Unlock gate | inactive | active |
| Missing DEK | not an error | `MissingDataKeyError` |

Deriving the flag from memory instead of `localStorage` is **wrong**: after a cold boot the flag would read `false` on a provisioned device and the next write would silently overwrite ciphertext with plaintext.

Corollary for §5.5: `encryptEntity` must NOT throw merely because the DEK is absent. It throws only when the DEK is absent **and** `isEncryptionProvisioned()` is true — a state the unlock gate should already have prevented.

### 5.5 Entity-crypto helper and the twelve seams

New `app/shared/lib/storage/entity-crypto.ts`:

- `encryptEntity(plaintext: string): string` — `iv = randomBytes(12)`, `ct = aesGcmEncrypt(dek, iv, utf8(plaintext))`, returns a marked envelope string `enc:v1:` + Base64(iv ‖ ct ‖ tag). Synchronous (noble). With no DEK in memory: returns the plaintext untouched when `isEncryptionProvisioned()` is false (§5.4.1 plaintext mode), throws `MissingDataKeyError` when it is true.
- `decryptEntity(stored: string): string` — if the value carries the `enc:v1:` marker, decrypt and return the plaintext JSON; if it does **not** carry the marker, return it unchanged (legacy plaintext — see §5.6 migration).
- `isEncrypted(stored): boolean` — marker check.

The twelve chokepoints (one read + one write per entity) each get a single call inserted, preserving the existing shapes (Map-as-entries vs plain array) and date/Map revival — the crypto layer only transforms the **stored string**, not the parsed object:

| Entity | Write seam (encrypt before `setItem`) | Read seam (decrypt after `getItem`) |
|---|---|---|
| Products | `setProductsLocalStorage` (`product-repository.ts:390`) | `getProductsFromLocalStorage` (`:411`) + raw `getProductsJson` (`:385`) |
| Categories | `setProductCategoriesLocalStorage` (`product-category-repository.ts:219`) | `getProductCategoriesFromLocalStorage` (`:229`) + `getCategoriesJson` (`:203`) |
| Inventory | `setInventoriesLocalStorage` (`inventory-offline-service.ts:897`) | `getInventoriesFromLocalStorage` (`:937`) + `getInventoryEntriesJson` (`:925`) |
| Orders | `setOrdersLocalStorage` (`order-offline-service.ts:568`) | `getOrdersFromLocalStorage` (`:591`) + `getOrdersJson` (`:563`) |
| Expenses | `setExpensesLocalStorage` (`expense-offline-service.ts:252`) | `getExpensesFromLocalStorage` (`:274`) |
| Sale-credits | `setSaleCreditsLocalStorage` (`sale-credit-offline-service.ts:377`) | `getSaleCreditsFromLocalStorage` (`:400`) |

The raw-string getters (`getXJson`, used by the sync export path) must decrypt to plaintext JSON so the export continues to produce plaintext-inside-an-encrypted-zip (unchanged sync file format). The sync **import** writes through the same `setXLocalStorage` methods, so imported data is encrypted at rest automatically — no separate change.

Note the existing **auto-init-on-empty** behavior (a read of a missing/empty key writes back an empty container): those writes now go through `encryptEntity` too, which is fine — an empty Map/array gets encrypted like any other value.

### 5.6 Migration of existing plaintext data

Devices already in the field hold plaintext at the six keys. Migration is transparent and idempotent, driven by the `enc:v1:` marker:

- On read, an unmarked (legacy plaintext) value is returned as-is by `decryptEntity`, so the app keeps working immediately after the update even before the DEK exists.
- Once the DEK is available (post-unlock), a lightweight one-time pass re-writes each of the six keys through the encrypting write seam, converting plaintext → ciphertext in place. Running twice is harmless (already-encrypted values are skipped via `isEncrypted`).

**Decision:** trigger the migration pass once, right after the DEK is set on first unlock, iterating the six entities for the current `storeId`.

### 5.7 What is NOT encrypted

Only the six business entities are in scope: products, categories, inventory, orders, expenses, sale-credits. Non-sensitive/auth keys stay as-is: `token`, `currentUser`, `AUTH_MODEL`, `language`, `lizoft.store-currency`, `lizoft.store-daily-usage-*`, and the offline-roster keys (`lizoft.offline-roster`, `lizoft.offline-roster-last`). The roster itself is already delivered as an AES-encrypted bundle by offline-auth; the wrapped DEK inside it is, by construction, useless without the user's password.

## 6. Data flow (end to end)

**Provisioning (owner/admin, online):** admin exports the roster → backend generates/loads the store DEK, wraps it per user under each user's KEK, returns `formatVersion: 2` bundle → admin device encrypts it to the roster file (offline-auth) → target device imports it.

**Unlock (any user, any session start where DEK is absent):** login screen → user types password → verify (online against backend, or offline against the roster verifier) → `unwrapDek(password, myRosterEntry)` → `setDek(bytes)` → (first time) run migration pass → app hydrates and can read/write encrypted data.

**Read:** service cache miss → `getItem` → `decryptEntity` → existing `JSON.parse` + Map/date revival → object.

**Write:** service mutates in-memory cache → serialize (Map-entries/array) → `encryptEntity` → `setItem`.

**Lock:** 1h idle OR full app close → DEK gone from memory → next start hits the unlock gate.

## 7. Error handling

- **Wrong password on unwrap:** AES-GCM authentication fails → surface as an auth failure on the login screen (same UX as a wrong-password login). Reuse the existing error classes convention (`readonly name`, `Object.setPrototypeOf`).
- **No DEK in memory when a read/write is attempted:** `entity-crypto` throws a clear `MissingDataKeyError`; the app should never reach a data operation without a DEK because the unlock gate precedes data screens — this error is a guard, not an expected path.
- **Tampered/corrupt ciphertext:** GCM tag verification fails → treat as corrupt; do not silently return garbage. Log and force re-provision/re-import.
- **`formatVersion < 2` roster on an encryption-capable client:** the wrapped-DEK fields are absent → cannot unlock encrypted data → require a fresh roster export. (Only relevant during the rollout overlap; a clear message is enough.)

## 8. Testing

Vitest + jsdom; `crypto.subtle` is available under jsdom (confirmed by the offline-auth plan; no mock). New tests co-located or under `__tests__/` per existing convention.

- **entity-crypto:** round-trip encrypt→decrypt with a fixed DEK; `enc:v1:` marker present on output; `decryptEntity` passes through unmarked legacy plaintext; tamper a byte → decrypt throws; throws when no DEK set.
- **DEK unwrap:** known-answer — wrap a DEK on the backend side (or a fixture) and unwrap on the client with the matching password; wrong password → throws. Verify the client KEK derivation matches the backend byte-for-byte (shared PBKDF2 params).
- **Seam integration:** for each of the six services, with a DEK set, write then read returns the same object (Map/date revival intact) and the raw `localStorage` value carries the `enc:v1:` marker (i.e. is NOT plaintext).
- **Migration:** seed a key with legacy plaintext, set DEK, run the pass, assert the stored value is now marked ciphertext and reads back equal; run the pass twice → idempotent.
- **Unlock gate:** valid session + no DEK → routed to login; after unlock, DEK present and data readable.
- **Backend:** `StoreKeyWrapService` produces distinct salts/ivs per call; DEK is stable across two exports for the same store; roster export returns `formatVersion: 2` with the three wrap fields populated per user.

## 9. Out of scope (v1)

- DEK rotation / re-keying.
- Encrypting the non-business keys listed in §5.7.
- Protecting an unlocked, running session (XSS hardening / CSP) — separate effort.
- Per-entity or field-level selective encryption — all six entities are encrypted wholesale.

## 10. Build order

1. Offline-auth (prerequisite) — backend + frontend roster bundle must exist first.
2. Backend: per-store DEK storage + `StoreKeyWrapService` + roster `formatVersion: 2` fields.
3. Frontend: `entity-crypto` + `data-key-store` + `unwrapDek` + the twelve seam insertions + unlock gate + migration pass.
4. Tests alongside each layer.
