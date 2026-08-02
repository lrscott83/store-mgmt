# Proposal: at-rest-encryption-frontend

Close the client half of at-rest encryption so that business data in `localStorage` is ciphertext on
provisioned devices — without breaking the app on devices that never import a roster.

Artifact store: hybrid. Engram topic key: `sdd/at-rest-encryption-frontend/proposal`.
Factual basis: `openspec/changes/at-rest-encryption-frontend/explore.md` (engram obs #1748).
Technical basis: `docs/plans/2026-07-25-at-rest-encryption-local-data-design.md`.

## Intent

The backend shipped at-rest encryption end-to-end: `ExportOfflineRosterQuery.cs:33` emits
`FormatVersion = 2` and every roster user now carries `wrappedDek`/`wrapSalt`/`wrapIv`. The frontend
implements **none** of it — and the failure is silent, not loud. Import a real v2 bundle into the app
today and `hasValidShape()` (`roster-store.ts:60-69`) never inspects `formatVersion`; the bundle is
persisted verbatim, the three wrap fields ride along as inert JSON keys, offline login succeeds using
only `user.verifier`, and every product, order, inventory row, expense and sale-credit keeps being
written as **plaintext**. No rejection, no crash, no banner. The app looks correct while delivering
zero at-rest protection, which is strictly worse than a hard failure: it manufactures confidence.
Anyone reasoning "the backend shipped, so encryption is on" is wrong, and nothing in ordinary QA will
tell them. This change makes the client honor the DEK the backend already wraps for it, and makes the
absence of encryption an explicit, tested, first-class mode rather than an accident.

## Scope

### In scope

| Area | Work |
|------|------|
| Roster typing | `roster-types.ts` — add `wrappedDek`/`wrapSalt`/`wrapIv`, tighten `formatVersion` |
| Mode predicate | `roster-store.ts` — add `isEncryptionProvisioned()` (expiry-independent, see Approach) |
| Key unwrap | `offline-crypto.ts` — add `unwrapDek` + `DekUnwrapError`, reusing `sha256Base64`/`pbkdf2Base64` verbatim |
| DEK runtime | new `data-key-store.ts` — in-memory only `setDek`/`getDek`/`clearDek` |
| Entity crypto | new `entity-crypto.ts` — `encryptEntity`/`decryptEntity`, `enc:v1:` envelope, `MissingDataKeyError` |
| Migration | new `entity-migration.ts` — one-time plaintext→ciphertext pass (decision below) |
| Auth wiring | `auth-store.ts` (online login unwrap, `clearDek()` on logout), `offline-auth-service.ts` (offline unwrap) |
| Unlock gate | `loaders.ts` (`needsUnlock`), `login.tsx` (error mapping) |
| Six seams | `product-repository.ts`, `product-category-repository.ts`, `inventory-offline-service.ts`, `order-offline-service.ts`, `expense-offline-service.ts`, `sale-credit-offline-service.ts` — 3 call sites each |
| Dependency | `@noble/ciphers` added to `apps/web-store-pos/package.json` (verdict below) |
| Stale comments | `roster-http-service.ts:4-12` and `roster-export-panel.tsx:11-19` claim the export endpoint "does not exist server-side yet". `StoreUsersController.cs:41-45` implements exactly that route. Correct the comments — this change owns them. |
| Fixtures | The 11 `formatVersion: 1` fixture sites become **plaintext-mode regression tests** (see Decision 1) |

### Out of scope

- **Any backend change.** The backend is read-only source of truth and already delivered.
- Roster export UX beyond deleting the two stale comments. No new buttons, no new flows.
- A new passphrase/master-password screen. The existing login screen IS the unlock gate.
- Key rotation, re-wrap on password change, multi-store DEK caching, IndexedDB migration.
- Encrypting anything outside the six business entities (auth token, roster bundle, UI prefs).
- Converting the six services to async. Explicitly rejected — see the dependency verdict.

## Ratified decisions

### Decision 1 — `formatVersion < 2` means "encryption not provisioned"

No hard v1/v2 cutover and no duplicated code branch. A v1 bundle (or no bundle at all) puts the app in
**plaintext mode**, where login, reads, writes and the unlock gate behave *exactly* as they do today
and **no error is ever raised**. This is the design's `isEncryptionProvisioned()` predicate (§5.4.1).

Consequence: the 11 existing `formatVersion: 1` fixtures are not obsolete — they are promoted to
regression tests that pin plaintext mode. They stay, and v2 fixtures are added alongside them.

### Decision 2 — encryption is OPTIONAL, and its absence must never break anything

Standing hard constraint (engram obs #1549). The app must work with offline-auth **and** with
online-auth when the roster file is never imported.

| Situation | `encryptEntity` behavior |
|-----------|--------------------------|
| Not encryption-provisioned (no bundle, or v1) | returns the plaintext unchanged, **never throws** |
| Provisioned, DEK present in memory | returns `enc:v1:` ciphertext |
| Provisioned, DEK absent | throws `MissingDataKeyError` — a state the unlock gate should have prevented |

`MissingDataKeyError` exists for the third row only. Every requirement written in the spec phase must
survive the "roster never imported" path, and every task must be tested on that path, not only on the
happy provisioned path.

## Approach

### Two predicates, two different questions

They are NOT the same predicate and must not be collapsed.

| Predicate | Question it answers | Honors bundle expiry? |
|-----------|--------------------|-----------------------|
| `isRosterProvisioned()` (exists, `roster-store.ts:144`) | can this device authenticate offline **right now**? | **Yes** — delegates to `getRoster()`, which returns `null` past `expiresAt` |
| `isEncryptionProvisioned()` (new) | are the bytes on disk supposed to be ciphertext? | **No** — reads the stored bundle raw, ignoring `expiresAt` |

The asymmetry is load-bearing. `getRoster()` nulls out an expired bundle. If encryption reused it, the
day a bundle expired the app would conclude "plaintext mode" and the next write would **overwrite
ciphertext with plaintext it can no longer read** — silent data destruction. An expired bundle means
"authenticate online again"; it never means "your data is plaintext." So `isEncryptionProvisioned()`
and the DEK unwrap both need a raw roster read that bypasses the expiry gate — a small new accessor in
`roster-store.ts`, not a reuse of `getRoster`. Deriving the flag from memory instead of `localStorage`
is equally wrong: after a cold boot it would read `false` on a provisioned device.

### Where the DEK lives

In memory only, in `data-key-store.ts` — never `localStorage`, never `sessionStorage`, never a cookie.
Persisting it would defeat the entire threat model (a storage dump would yield both key and ciphertext).

| Event | DEK action |
|-------|-----------|
| Online login (`auth-store.login`) — the only place the raw password is in scope | `unwrapDek(password, myRosterEntry)` → `setDek` |
| Offline login (`authenticateOffline`) | same unwrap, after the existing verifier check |
| Logout | `clearDek()` |
| Tab close / reload | gone implicitly; the unlock gate re-acquires it |

### Unlock gate reuses the existing login screen

`needsUnlock(user) = getDek() === null AND the local roster has a formatVersion >= 2 entry with a
wrappedDek for this user`. When true, the loader routes to `/login`; the user re-enters **their own
password**, the normal login flow runs, and the DEK unwrap is a side effect of it. No new screen, no
second secret to remember.

Critical corollary: `guestOnlyLoader` must bounce already-authenticated visitors using
`!needsUnlock(user)`, **not** `getDek() !== null`. Gating on the DEK alone would strand every
online-auth-only user on the login screen forever, since their DEK is `null` by design. That is the
optional-encryption constraint biting at the routing layer.

### Crypto contract — must match the backend byte-for-byte

| Parameter | Value | Backend source |
|-----------|-------|----------------|
| DEK derivation | HKDF-SHA256, ikm = master secret, salt = null, info = `storeId.ToString("D")`, 32 bytes | `StoreDataKeyProvider.cs:17-21` |
| KEK input | `Base64(SHA256(password))` — the **stored hash**, NOT the raw password | `StoreKeyWrapService.cs` param `storedPasswordHash` |
| KEK derivation | PBKDF2-HMAC-SHA256, 210000 iterations, 32-byte output | `StoreKeyWrapService.cs:15-41` |
| Wrap AEAD | AES-GCM, 12-byte IV, 16-byte tag, layout `ciphertext ‖ tag`, all Base64 | `StoreKeyWrapService.cs:15-41` |

The frontend already implements the first two steps of the KEK chain: `sha256Base64`
(`offline-crypto.ts:40-44`) and `pbkdf2Base64` (`offline-crypto.ts:51-74`) are exported and reusable
**verbatim** — they are the same chain offline-auth already uses for the verifier. Only the final
AES-GCM unwrap is new code.

### Entity envelope

`encryptEntity` writes `enc:v1:` + Base64(iv ‖ ciphertext ‖ tag). `decryptEntity` returns any value
**without** that marker unchanged. The marker is what makes both backward compatibility and migration
idempotent, and it is the reason a half-finished migration can never corrupt data.

## Migration of already-stored plaintext — DECISION

Devices in the field already hold plaintext at the six storage keys. This is real user data, so the
policy is explicit:

**Eager one-time pass at first unlock, plus a permanent read-side passthrough.**

1. `decryptEntity` returns unmarked values unchanged, **permanently** — not as a migration window.
   This alone keeps the app working the instant the update lands, before any DEK exists.
2. Immediately after the first successful `setDek` on a provisioned device, run a one-time pass over
   the six entity keys **scoped to the current `storeId`**, reading each value and re-writing it
   through the encrypting write seam. Values already carrying `enc:v1:` are skipped, so the pass is
   idempotent and safe to re-run.
3. The pass **must not** run when `isEncryptionProvisioned()` is false, and a failure inside it must
   **not** block login — it degrades to "still plaintext", never to "cannot log in".

Why eager and not lazy-on-write-only: writes already re-encrypt whatever they touch, so lazy migration
converts hot data for free. But cold data never converts. A product catalog that is read constantly and
edited twice a year would sit in plaintext on disk **indefinitely** on a device the user believes is
encrypted — the exact silent-false-confidence failure this whole change exists to eliminate. Lazy
migration would fix the symptom and preserve the disease.

Why the read passthrough is permanent rather than removed after the pass: it is what makes the eager
pass **safe to fail**. If the pass dies halfway (quota, corrupt value, interrupted tab), some keys are
ciphertext and some are plaintext, and the app must read both without a special case. Removing the
passthrough later would turn a partially-migrated device into a bricked device.

## Risks

| Risk | Mitigation |
|------|-----------|
| **Parameter drift is silent data loss, not an error.** If the frontend PBKDF2/AES-GCM parameters diverge from the backend by even one field, `unwrapDek` fails in a path deliberately designed to look like "wrong password" — no alarm, and any data written under a wrong DEK is unrecoverable. | Commit **known-answer tests** using a real backend-generated `wrappedDek`/`wrapSalt`/`wrapIv` triple with its expected DEK, following the KAT convention already established in `offline-crypto.ts:1-14` ("a KAT break must fail a test, never lock out a user silently"). A parameter change must break a test, not a user. |
| **No forcing function.** The silent-no-op means nothing pushes this gap to be noticed; the app looks fine without the work and ordinary QA will not surface it. | Add an explicit assertion test per seam: with a v2 roster and a DEK set, the raw `localStorage` value MUST carry the `enc:v1:` marker. A regression to plaintext then fails a test instead of shipping quietly. |
| **Expiry/encryption predicate confusion** could overwrite ciphertext with plaintext (see Approach). | `isEncryptionProvisioned()` reads the roster raw; a dedicated test covers "bundle expired → still encrypted mode". |
| **New third-party crypto dependency** (`@noble/ciphers`). | Pin an exact version, no caret. `@noble/*` is the audited, dependency-free, widely-vetted family already standard in this space. Record the license/audit note at apply time. |
| **`guestOnlyLoader` stranding online-auth users** on `/login` forever. | Ratified above: gate on `!needsUnlock(user)`, never on `getDek() !== null`. Test the online-auth-no-roster path explicitly. |
| **Scope size** (~18 production touches + 12-15 test files under strict TDD). | Decompose in `sdd-tasks` into independently-committable slices; delivery is commits-only on `feat/at-rest-encryption-frontend`, so slice size is a review-clarity concern, not a PR-budget one. |

## `@noble/ciphers` verdict — JUSTIFIED, with a refinement

**Add it.** This is not inertia from the plan document; the evidence holds up.

`crypto.subtle` is Promise-only. The six seams are strictly synchronous and were ported 1:1 from
Angular: `setProductsLocalStorage(products: Map<string, Product>): void`,
`getProductsFromLocalStorage(): Map<string, Product>`, `getProductsJson(): string | null`
(`product-repository.ts:385-423`), called from synchronous constructors and methods at eight sites in
that one file alone. Making them async would cascade through six services, their call sites, and every
existing test — a contract change across the codebase, justified by nothing but a library choice, and
buying zero security. Under this repo's standing rule that a migrated surface does not change shape
without a reason, that is the wrong trade. A synchronous AES-GCM primitive is the correct answer.

**Refinement for the design phase:** the plan uses `@noble/ciphers` for entity crypto and
`crypto.subtle` for the DEK unwrap, giving the frontend *two* AES-GCM implementations and therefore two
independent chances to get the 16-byte tag or the `ct ‖ tag` layout wrong — against a backend where
that drift is silent. Recommend a **single** AES-GCM implementation (noble) for both entity crypto and
the unwrap, keeping `crypto.subtle` for PBKDF2 only, where `pbkdf2Base64` is already KAT-pinned and
reused verbatim. `sdd-design` should confirm or override this.

## Open questions

**None blocking.** Both decisions the exploration flagged as open are ratified above (backward-compat
policy, ownership of the stale comments), the migration policy is decided, and the dependency question
is answered on evidence. The one item deliberately deferred to `sdd-design` — one AES-GCM
implementation or two — is a refinement with a stated default, not a blocker.

## Next step

`sdd-spec` and `sdd-design` can run in parallel from this proposal.
