# Exploration: at-rest-encryption-frontend — backend delivery audit + frontend gap

Artifact store: hybrid. Engram topic key: `sdd/at-rest-encryption-frontend/explore` (obs #1748).
Everything below was verified against real code. Where a plan document and the code disagreed,
the code wins and the stale claim is named.

## Current State

### 1. Wire truth — CONFIRMED, plan matches code exactly

`backend/src/Application/Dtos/Management/StoreUsers/OfflineRosterDto.cs` (whole bundle):
`BundleId: string`, `IssuedAt: long`, `ExpiresAt: long`, `FormatVersion: int`, `StoreId: Guid`,
`Users: List<OfflineRosterUserDto>`.

`OfflineRosterUserDto.cs:5-22`: `Id: Guid`, `Login/FullName: string`, `IsActive: bool`, `Roles`,
`FeatureIds: List<int>`, `StoreModuleIds: List<int>`, `IsSuperAdmin/IsOwnerAdmin/IsReSeller: bool`,
`SelectedStoreId: Guid`, `Verifier: OfflineVerifierDto`, then (added by the backend change)
`WrappedDek: string = ""`, `WrapSalt: string = ""`, `WrapIv: string = ""`. Default camelCase JSON →
`wrappedDek`, `wrapSalt`, `wrapIv`, never null (default `""`).

`ExportOfflineRosterQuery.cs:33` — `private const int FormatVersion = 2;`, used at line 135. The
handler at line 79 calls `_storeDataKeyProvider.GetDek(query.StoreId)` ONCE, then inside the
per-user loop (line 102) calls `_storeKeyWrapService.WrapDek(su.User.Password, dek)` — DEK loaded
once, wrapped N times. Controller: `StoreUsersController.cs:41-45`,
`GET /v1/storeusers/{storeId}/offline-roster` — the endpoint EXISTS and is wired to the query.

Backend claim is TRUE end-to-end.

### 2. Crypto contract — CONFIRMED, exact parameters

`StoreDataKeyProvider.cs:17-21`:
`dek = HKDF.DeriveKey(SHA256, ikm=UTF8(masterSecret), outputLength=32, salt=null, info=UTF8(storeId.ToString("D")))`.
Deterministic per store, config key `StoreEncryption:MasterSecret` (appsettings.json). No EF
migration, no persisted DEK.

`StoreKeyWrapService.cs:15-41`:
- `wrapSalt` = 16 random bytes, `wrapIv` = 12 random bytes
- `kek = Rfc2898DeriveBytes.Pbkdf2(UTF8(su.User.Password), wrapSalt, 210_000, SHA256, 32)`, where
  `su.User.Password` is the ALREADY-STORED `Base64(SHA256(password))` hash, not the raw password
  (confirmed by the parameter name `storedPasswordHash`)
- AEAD: `new AesGcm(kek, 16)` (16-byte tag), `wrapped = ciphertext ‖ tag` (48 bytes for a 32-byte
  DEK), all three outputs Base64

The frontend wrapping input is therefore NOT the raw password. It must replicate the existing
offline-auth chain: `preHash = Base64(SHA256(password))` (already implemented as `sha256Base64`,
`offline-crypto.ts:40-44`) then `PBKDF2(preHash, wrapSalt, 210000)` (already implemented as
`pbkdf2Base64`, `offline-crypto.ts:51-74`, exported). Both helpers are reusable verbatim. Only
`crypto.subtle.importKey('raw', kekBits, 'AES-GCM', ...)` + `crypto.subtle.decrypt` is new code.

### 3. Frontend inventory — at-rest encryption is 0% implemented client-side

- `roster-types.ts:12-25` — `OfflineRosterUser` has NO `wrappedDek`/`wrapSalt`/`wrapIv`.
  `OfflineRosterBundle:31` declares `formatVersion: number` (untyped literal, not `1 | 2`).
- `roster-store.ts:60-69` — `hasValidShape()` checks only `bundleId`/`issuedAt`/`expiresAt`/`users`.
  It NEVER checks `formatVersion`. A v2 bundle passes identically to a v1 bundle. No
  `isEncryptionProvisioned()` exists anywhere.
- `offline-crypto.ts` — has `sha256Base64`, `pbkdf2Base64`, `verifyOfflinePassword` only. No
  `unwrapDek`, no `DekUnwrapError`.
- `offline-auth-service.ts:85-118` (`authenticateOffline`) — reads only `user.verifier`; never
  touches the wrap fields. No DEK step anywhere in the login flow.
- `auth-store.ts` `login`/`getUserByToken` — no DEK unwrap, no `setDek`/`clearDek`. Zero hits
  across all of `frontend-react/` for
  `setDek|getDek|clearDek|MissingDataKeyError|unwrapDek|isEncryptionProvisioned|entity-crypto|needsUnlock`.
- `roster-serializer.ts` — `serializeRoster`/`deserializeRoster` do a bare
  `JSON.stringify` / `JSON.parse` round-trip through an AES-encrypted zip (password =
  `master + storeId`, unrelated to DEK wrapping). Because JS does not strip unknown JSON
  properties, a v2 bundle's three wrap fields survive the round-trip intact as inert extra keys.
- `roster-http-service.ts:4-12` and `roster-export-panel.tsx:11-19` carry a STALE comment:
  *"`GET /v1/storeusers/{storeId}/offline-roster` does not exist server-side yet (§7a, 0%
  implemented)"*. FALSE today — `StoreUsersController.cs:41-45` implements exactly that route. It
  is a doc comment, not a runtime guard, so nothing breaks; it should be corrected as part of this
  change.
- `@noble/ciphers` is NOT in `frontend-react/apps/web-store-pos/package.json:15-37`.
- All twelve read/write seam locations named in the plan (e.g. `product-repository.ts`
  `setProductsLocalStorage`/`getProductsFromLocalStorage`/`getProductsJson` at 390/411/385) still
  exist at the SAME line numbers. The plan's file/line references are current.

### 4. Failure mode today — silent no-op

Import a real `formatVersion: 2` bundle into the current frontend right now: `importRoster()` →
`hasValidShape()` passes (formatVersion never checked) → the bundle, including the three wrap
fields, is written to `localStorage` verbatim. Offline login succeeds normally using only
`user.verifier`. The user is authenticated, the app runs, and ALL business data (products,
inventory, orders, expenses, sale-credits, categories) continues to be written and read as
PLAINTEXT in `localStorage`.

No rejection, no crash, no degraded banner. It silently appears to work while providing zero
at-rest protection. This is the worst of the three possible failure modes, because it gives a false
sense of security to anyone who assumes "the backend shipped, so encryption is on."

### 5. `needsUnlock` — does not exist

Zero hits anywhere in `frontend-react/`. No gate of any kind exists today.

Intended UX per `docs/plans/2026-07-25-at-rest-encryption-local-data-design.md` §5.4: reuse the
EXISTING login screen as the unlock gate. The user re-enters their OWN password (not a new master
password or passphrase), which re-runs the normal login flow and, as a side effect, unwraps the DEK
via `unwrapDek(password, rosterEntry)`. No new screen is proposed.
`needsUnlock(user) = getDek() === null AND the local roster has a formatVersion >= 2 entry with
wrappedDek for this user`. Documented decision, not yet implemented.

### 6. Backward compatibility — OPEN, not answered by any artifact

The archived `offline-auth-frontend` change
(`openspec/changes/archive/2026-07-29-offline-auth-frontend/specs/offline-roster-bundle/spec.md`)
contains ZERO mentions of `formatVersion` or backward-compat handling — it was written before the
backend bumped to v2 and never anticipated a version gate.

The backend (`ExportOfflineRosterQuery.cs:135`) ALWAYS emits `FormatVersion = 2`; no code path
emits v1 anymore. The only "v1" surface left is the 11 frontend test fixtures hardcoding
`formatVersion: 1`, which exist to test current pre-encryption behavior.

The question for the proposal: does the frontend need an explicit v1-vs-v2 branch (plaintext mode
vs encrypted mode, per the design's two predicates `isRosterProvisioned()` /
`isEncryptionProvisioned()`), or can it always treat `formatVersion < 2` as "not
encryption-provisioned"? The design already proposes the latter at §5.4.1. That answer is coherent
and should be ratified explicitly — not adopted silently.

### 7. HARD CONSTRAINT (engram obs #1549) — compatible, not yet enforced

Requirement: the app must work with BOTH offline-auth and online-auth when the roster file is NOT
imported. Offline-auth — and by extension at-rest encryption — is strictly OPTIONAL, and its
absence must never break or block the app.

The design doc encodes this as a first-class constraint. §5.4.1 "Two modes, decided by that
predicate" states plaintext mode (`isEncryptionProvisioned() === false`) means login, writes,
reads, unlock gate and missing-DEK all behave EXACTLY as today, with no error ever raised.
`encryptEntity` is specified to return plaintext unchanged (never throw) when
`isEncryptionProvisioned()` is false — throwing `MissingDataKeyError` only when the device IS
provisioned but has no DEK.

Today the constraint is trivially satisfied because no encryption code exists. It must be carried
into the spec as a MUST requirement, and every task MUST be tested on the "roster never imported"
path, not only the "roster imported" path.

### 8. Test surface

- `crypto.subtle` works under the existing vitest/jsdom setup with NO polyfill. `vitest.config.ts`
  uses `environment: 'jsdom'`; `vitest.setup.ts` polyfills only `Blob.prototype.arrayBuffer/.text`
  for zip.js. The existing `app/shared/lib/offline/__tests__/offline-crypto.test.ts` already
  exercises `crypto.subtle.digest`/`importKey`/`deriveBits` in the passing suite.
  `unwrapDek`'s added `importKey(..., 'AES-GCM', ...)` / `decrypt` needs no new shim.
- 11 fixture sites hardcode `formatVersion: 1`: `roster-serializer.test.ts:10`,
  `auth-store.offline.test.ts:18`, `roster-store.test.ts:22,129`, `offline-auth-service.test.ts:29`,
  `provision.test.tsx:16`, `login.offline.e2e.test.tsx:122,175`, `roster-http-service.test.ts:22`,
  `roster-export-panel.test.tsx:62`. Each needs either a parallel v2 fixture or an update, per the
  backward-compat decision.
- `@noble/ciphers` is not yet a dependency — the first apply batch needs a `pnpm install`.
- No existing test for `entity-crypto.ts`, `data-key-store.ts`, `unwrapDek`, or per-seam crypto
  round-trips. All net-new.

### 9. Scope estimate

New: `data-key-store.ts`, `entity-crypto.ts`, `entity-migration.ts` (+3 test files).
Modified: `roster-types.ts` (+3 fields), `roster-store.ts` (+`isEncryptionProvisioned`),
`offline-crypto.ts` (+`unwrapDek`/`DekUnwrapError`), `package.json` (+1 dep), `auth-store.ts`
(login/logout wiring), `offline-auth-service.ts` (unwrap wiring), `loaders.ts` (unlock gate),
`login.tsx` (error mapping), plus SIX seam files each touched at 3 call sites
(`product-repository.ts`, `product-category-repository.ts`, `inventory-offline-service.ts`,
`order-offline-service.ts`, `expense-offline-service.ts`, `sale-credit-offline-service.ts`), each
with a new `.crypto.test.ts`.

Rough count: ~18 production touches + 12-15 test files. With strict TDD active this is comfortably
multi-PR-sized; the plan already decomposes it into ~12+ independently-committable tasks.

## Affected Areas

- `app/shared/lib/offline/roster-types.ts` — add 3 fields, tighten `formatVersion` typing
- `app/shared/lib/offline/roster-store.ts` — add `isEncryptionProvisioned()`
- `app/shared/lib/offline/offline-crypto.ts` — add `unwrapDek`/`DekUnwrapError`
- `app/shared/lib/offline/offline-auth-service.ts` — wire DEK unwrap into `authenticateOffline`
- `app/shared/lib/stores/auth-store.ts` — wire unwrap into online `login`, `clearDek()` on `logout`
- `app/shared/lib/http/roster-http-service.ts`, `app/management/users/components/roster-export-panel.tsx`
  — correct the stale "endpoint doesn't exist" comments
- 6 seam files under `app/sales/lib/repositories/`, `app/inventory/lib/services/`,
  `app/sales/lib/services/`, `app/expenses/lib/services/`
- `app/auth/routes/loaders.ts`, `app/auth/routes/login.tsx` — unlock gate + error mapping
- 11 existing fixture files hardcoding `formatVersion: 1`
- `package.json` — add `@noble/ciphers`

## Recommendation

Proceed to `sdd-propose` using `docs/plans/2026-07-25-at-rest-encryption-local-data-design.md` as
the primary technical basis: it is verified accurate against the real backend, its crypto
parameters match byte-for-byte, and its two-predicate approach already satisfies the hard
optional-offline-auth constraint. The frontend plan's task breakdown is also still valid (paths and
line numbers verified current) and can seed the tasks phase.

The proposal MUST explicitly ratify:
1. the v1→v2 backward-compat decision (no live v1 producer remains server-side, but test fixtures
   still assume v1), and
2. ownership of correcting the stale "endpoint doesn't exist" comments.

## Risks

- The silent-no-op failure mode means there is no forcing function pushing this gap to be fixed —
  the app looks fine without the work, so ordinary QA will not surface it.
- Backward-compat scope is unresolved and could change the size of the seam changes if a hard
  v1/v2 branch is required.
- `@noble/ciphers` is a NEW third-party crypto dependency — worth a deliberate license/audit note
  in the proposal. Not investigated here (out of scope for a read-only explore).
- KEK/DEK parameters must match the backend byte-for-byte. Drift is silent data-loss risk
  (undecryptable ciphertext), not a loud error, because the `unwrapDek` failure path is designed to
  look like "wrong password".

## Ready for Proposal

Yes. All nine mission questions are answered with file:line evidence. The one open item
(backward-compat policy) is a DECISION for the proposal phase, not a missing fact.
