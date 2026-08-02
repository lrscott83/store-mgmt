# Apply progress: at-rest-encryption-frontend

Artifact store: hybrid. Engram topic key: `sdd/at-rest-encryption-frontend/apply-progress`.
Branch: `feat/at-rest-encryption-frontend`, cut from `main` (clean apart from the two
dependency files: `apps/web-store-pos/package.json`, `pnpm-lock.yaml`).

**Batches A (WU0-4), B (WU5-10), C (WU12 then WU11), D (WU13), and E (WU14) are ALL DONE.**
This is the FINAL apply batch of the whole change — 21 commits total on the branch. Only
WU3.3 (real-backend KAT interop) remains outstanding, and it is independent of WU13/WU14 and
was explicitly out of scope for every batch so far. This file merges Batch D+E's new record
(appended at the end, after Batch C) onto the prior file. Nothing from Batches A/B/C's record
was altered or removed.

---

## @noble/ciphers version correction (confirmed)

tasks.md 0.2 names `1.3.0`; the actually installed and pinned version is **`2.2.0`** (exact
pin, no caret, zero transitive deps — already done before this batch by the user). The v2 API
was confirmed by reading the installed package's own `.d.ts` files and `package.json`
`exports` map, not assumed from the plan:

- `package.json` `exports` requires the literal subpath `./aes.js` — **the `.js` extension is
  mandatory**, `@noble/ciphers/aes` (no extension) is NOT a valid import in v2.
- `gcm(key, nonce)` from `@noble/ciphers/aes.js` returns a **synchronous, single-use** `Cipher`
  (`{ encrypt(pt): Uint8Array, decrypt(ctWithTag): Uint8Array }`). No `await` needed.
- `decrypt()` throws `Error('aes/gcm: invalid ghash tag')` on tag mismatch — confirmed by
  direct probe, used as the pinned throw behavior in the aes-gcm KAT.
- Cross-checked byte-for-byte against Node's built-in `crypto.createCipheriv('aes-256-gcm', ...)`
  for the same fixed key/iv/plaintext — `gcm(key,iv).encrypt(pt)` produces the exact same
  `ct‖tag` bytes Node produces. This is the interop proof for the AES-GCM layer itself (not the
  DEK-wrap KAT, which is still fixture-pending — see WU3.3 below).

## Work units completed

### WU1 — base64 + AES-GCM primitives — commit `189dbdb`
- `storage/base64.ts` — `base64FromBytes`/`bytesFromBase64`, deliberately duplicated from
  `offline-crypto.ts` (not imported), per design correction 3.
- `storage/aes-gcm.ts` — the ONE AES-GCM module in the app (`aesGcmEncrypt`/`aesGcmDecrypt`,
  `AES_GCM_IV_BYTES=12`, `AES_GCM_TAG_BYTES=16`), over `@noble/ciphers/aes.js`'s `gcm()`.
- RED evidence: `base64.test.ts` and `aes-gcm.test.ts` both failed with
  `Failed to resolve import` (module did not exist) before the GREEN implementation — confirmed
  by direct `npx vitest run` before writing the source files.
- Fixed KAT vector (key=32×0x01, iv=12×0x02, plaintext=`"known plaintext value 123"`)
  cross-generated via Node's `crypto.createCipheriv('aes-256-gcm', ...)` and independently
  verified to decrypt correctly through `@noble/ciphers`'s `gcm()` before being embedded in the
  test file — this is real interop evidence for the AES-GCM primitive itself.
- Checklist item confirmed: `rg -l '@noble/ciphers'` across `apps/` and `packages/` returns
  exactly one file (`storage/aes-gcm.ts`).
- Test count: 155→157 files, 2196→2203 tests.

### WU2 — getRawRoster + isEncryptionProvisioned — commit `f27b9bd`
- `roster-types.ts` — added optional `wrappedDek?`/`wrapSalt?`/`wrapIv?` on
  `OfflineRosterUser`. `formatVersion` left as `number` (not narrowed), per design correction 7.
- `roster-store.ts` — added `getRawRoster()` (no `now` param, expiry-ignoring, never throws) and
  `isEncryptionProvisioned()` (sits on `getRawRoster()`, never calls `getRoster()`).
  `getRoster(now)` refactored to `getRawRoster()` + one expiry comparison.
- RED evidence:
  - `roster-types.test.ts` — RED captured via `npx tsc --noEmit` (TS2353/TS2339: `wrappedDek`
    does not exist on `OfflineRosterUser`/`Partial<OfflineRosterUser>`) BEFORE the type edit —
    this is a type-only requirement, so the correct RED signal is the compiler, not vitest
    (which doesn't type-check via esbuild transform). GREEN confirmed both via `tsc --noEmit`
    (exit 0) and `vitest run` (2/2 passing).
  - `roster-store.test.ts` additions — 6 new tests, all failed with
    `TypeError: (0, getRawRoster) is not a function` / `isEncryptionProvisioned is not a
    function` before implementation; GREEN after.
- `roster-store.purity.test.ts` re-run and stays green (2/2) — no new imports were added to
  `roster-store.ts`, confirmed both by the purity test's own structural assertion and manual
  review of the diff.
- Test count: 157→158 files, 2203→2211 tests.

### WU3 — dek-unwrap + node-transcribed KAT (fallback fixture) — commit `327d5fb`
- `offline/dek-unwrap.ts` — `unwrapDek(password, entry)`, `DekUnwrapError`,
  `DEK_WRAP_ITERATIONS = 210_000` (comment cites `StoreKeyWrapService.cs:15-41` and that the
  constant is NOT wire-protected). Implements design §6 steps 1-4 exactly: `sha256Base64` →
  `pbkdf2Base64(preHash, wrapSalt, 210_000)` → `aesGcmDecrypt(kek, wrapIv, wrappedDek)` →
  assert `dek.length === 32`. All failures uniformly rethrown as `DekUnwrapError`.
- **`dek-kat.json` fixture — provenance `"node-transcription"`, header states verbatim it does
  NOT prove backend interop.** Generated by transcribing the algorithm into Node's built-in
  `crypto` module (`pbkdf2Sync` + `createCipheriv('aes-256-gcm')`), for a fixed password
  (`"correct horse battery staple"`), fixed 16-byte wrapSalt, fixed 12-byte wrapIv, and a fixed
  32-byte expected DEK (all bytes `0x33`).
- **Extra verification performed** (beyond what the task strictly required, because crypto
  drift is the highest risk in this change): before writing the vitest test, the fixture was
  independently round-tripped through the ACTUAL frontend stack in a throwaway Node script
  (`crypto.subtle` for PBKDF2/SHA-256 exactly as `offline-crypto.ts` does it, `@noble/ciphers`
  for the AES-GCM unwrap) — confirmed `preHash`, `kek`, and the recovered `dek` all match the
  fixture's expected values byte-for-byte. This proves the fixture is internally consistent and
  that `unwrapDek`'s real implementation (not just the fixture generator) recovers the correct
  DEK — it does NOT prove the backend would produce this same `wrappedDek` for this password
  (that requires WU3.3).
- RED evidence: `dek-unwrap.kat.test.ts` failed with `Failed to resolve import "../dek-unwrap"`
  before the module existed. GREEN: 4/4 tests pass, including the wrong-password rejection and
  an iteration-count-drift test (derives a KEK with `DEK_WRAP_ITERATIONS + 1` and confirms the
  mismatched KEK cannot open the fixture's `wrappedDek` — `DEK_WRAP_ITERATIONS` itself is a
  `const`, not reassignable at runtime by design, so drift is simulated this way rather than by
  mutating the export).
- Test count: 158→159 files, 2211→2215 tests.

### WU4 — data-key-store + entity-crypto — commit `c858dc1`
- `storage/data-key-store.ts` — `setDek`/`getDek`/`getDekStoreId`/`clearDek`, two module-level
  `let`s, zero imports. Lives under `storage/` (not `offline/`) per design correction 4.
- `storage/entity-crypto.ts` — `ENTITY_ENVELOPE_PREFIX = 'enc:v1:'`, `isEncrypted`,
  `encryptEntity`, `decryptEntity`, `MissingDataKeyError`. `encryptEntity` checks `getDek()`
  FIRST, then `isEncryptionProvisioned()`, then throws — matching the checklist gate order.
  `decryptEntity` dispatches on the marker before anything else.
- RED evidence:
  - `data-key-store.test.ts` — failed with `Failed to resolve import` before the module
    existed; 3/3 pass after. The 4th test (task 4.2, negative/observability: no storage key
    ever carries the Base64 DEK) was added and PASSED IMMEDIATELY, as task 4.2 itself flags as
    expected given a correctly memory-only 4.1 — no defect found, kept as a regression guard.
  - `entity-crypto.test.ts` — failed with `Failed to resolve import` before the module existed;
    8/8 pass after, covering: `decryptEntity(null)` → null; unmarked passthrough; `isEncrypted`;
    no-roster encrypt-unchanged-no-throw (hard constraint); v1-roster encrypt-unchanged-no-throw;
    DEK-present round-trip; provisioned-but-locked `encryptEntity` throws
    `MissingDataKeyError`; marked-value-no-DEK `decryptEntity` throws `MissingDataKeyError`.
  - `entity-crypto.kat.test.ts` (task 4.7, second KAT) — a frozen `enc:v1:` sample (fixed DEK
    all `0x99`, fixed IV all `0x44`, fixed JSON plaintext) generated via a throwaway Node script
    using the real `@noble/ciphers` `gcm()` call, then decrypted through the real
    `decryptEntity`. Passed immediately (1/1) — envelope-layout stability regression test, not
    a discovery task, exactly as design §6 describes it ("no interop partner needed").
- Test count: 159→162 files, 2215→2228 tests.

## Gate numbers — before and after Batch A

| Gate | Baseline (before WU0) | After WU4 (end of Batch A) |
|---|---|---|
| `pnpm typecheck` | 5/5 tasks | 5/5 tasks |
| `pnpm test` (web-store-pos) | 155 files / 2196 tests | 162 files / 2228 tests |
| `pnpm test` (domain + web-common, cached) | 95/95, 11/11 | unchanged (95/95, 11/11 — no files touched in those packages) |
| `pnpm lint` | 4/4 packages | 4/4 packages |

Net for Batch A: **+32 tests, +7 test files**, zero regressions, zero behavior change on any
device (WU1-4 are all dead code / pure functions with no call sites wired in yet — matches the
design's own "Behavior change on any device: none" for WU1-4).

## Explicitly NOT done after Batch A (carried into Batch B's scope where applicable)

- **WU3.3 — real-backend KAT interop vector.** Deferred per the task prompt: requires bringing
  up the real .NET backend and running a one-off harness against
  `StoreKeyWrapService`/`StoreDataKeyProvider`, which has not been arranged. `dek-kat.json`
  currently carries `"provenance": "node-transcription"` and its header states in plain text
  that it does NOT prove backend interop. **This is a hard gate before `sdd-verify` runs on the
  full change** (per design §6 and tasks.md 3.3) — it must be swapped for a genuine
  `"provenance": "dotnet-backend"` vector with a backend commit SHA before this change is
  verify-ready. **STILL NOT attempted as of end of Batch B** — no backend was started; out of
  scope for both batches so far.
- ~~WU5-10 — the six entity seams~~ — **DONE in Batch B, see below.**
- **WU11 — auth wiring** (first behavior change: login/logout unwrap+clear DEK). Not started.
- **WU12 — unlock gate** (`authLoader`/`guestOnlyLoader`, must land before/with WU11). Not
  started.
- **WU13 — eager entity migration pass.** Not started.
- **WU14 — v2 fixtures alongside the 11 existing v1 fixtures + stale-comment cleanup.** Not
  started.

## Deviations from tasks.md / design.md (Batch A)

None beyond the corrected `@noble/ciphers` version (1.3.0 in the plan → 2.2.0 actually
installed, v2 API), which was explicitly called out as expected/allowed in the apply prompt.
Every module map path, function signature, ordering constraint (DEK-first in `encryptEntity`,
marker-first in `decryptEntity`, `getRawRoster` with no `now` param never calling `getRoster`)
and file location (`data-key-store.ts` under `storage/`, base64 duplicated not imported,
`offline-crypto.ts` untouched) from design.md §1-§7 survived contact with the code unchanged.

## Commits (Batch A, in order)

1. `189dbdb` — `feat(storage): add base64 and AES-GCM primitives`
2. `f27b9bd` — `feat(offline): add getRawRoster and isEncryptionProvisioned`
3. `327d5fb` — `feat(offline): add dek-unwrap with node-transcribed KAT`
4. `c858dc1` — `feat(storage): add data-key-store and entity-crypto`

---

## Batch B (WU5-10) — the six entity seams

**Scope**: wire `encryptEntity`/`decryptEntity` into the 16 call sites across the six
business-entity storage classes: `product-repository.ts`, `product-category-repository.ts`,
`inventory-offline-service.ts`, `order-offline-service.ts`, `expense-offline-service.ts`,
`sale-credit-offline-service.ts`. No DEK is ever set until WU11, so this batch is a proven no-op
in plaintext mode on every device — the whole point of six independent, small commits.

### Call-site count — confirmed by reading each file directly, not by line number

Design's corrected count (16, not the proposal/explore's 18) held with **zero further drift**:

| File | Seams | Sites (read live from the file) |
|---|---|---|
| `product-repository.ts` | 3 | `getProductsJson` (raw getter), `setProductsLocalStorage` (write), `getProductsFromLocalStorage` (read, try-wrapped) |
| `product-category-repository.ts` | 3 | `getCategoriesJson`, `setProductCategoriesLocalStorage`, `getProductCategoriesFromLocalStorage` |
| `inventory-offline-service.ts` | 3 | `getInventoryEntriesJson` (Angular-parity `\|\| '{}'` fallback, NOT `'[]'`), `setInventoriesLocalStorage`, `getInventoriesFromLocalStorage` |
| `order-offline-service.ts` | 3 | `getOrdersJson` (Angular-parity `\|\| '[]'` fallback), `setOrdersLocalStorage`, `getOrdersFromLocalStorage` |
| `expense-offline-service.ts` | 2 | `setExpensesLocalStorage`, `getExpensesFromLocalStorage` — **no raw `getXJson` getter exists for expenses**, confirmed by reading the whole file |
| `sale-credit-offline-service.ts` | 2 | `setSaleCreditsLocalStorage`, `getSaleCreditsFromLocalStorage` — **no raw `getXJson` getter exists for sale-credits either** |
| **Total** | **16** | 6 encrypt (write) + 10 decrypt (read/raw-getter) |

All six auto-init writes (the `setXLocalStorage` call after a caught parse/decrypt failure)
were confirmed to already sit OUTSIDE their read method's `try`/`catch` — none needed to move.
This is what makes the locked-read trap resolve correctly: a locked read's `decryptEntity` throw
is swallowed inside the `try`, falls through to the auto-init `setXLocalStorage` call OUTSIDE
the `try`, which calls `encryptEntity` on an empty container — and THAT throws too (provisioned
+ no DEK), propagating out uncaught. The existing ciphertext is never touched.

### Work units completed

For each of the six, one `.crypto.test.ts` file was written FIRST (RED), covering three cases
against the REAL service classes (no mocking of the encryption layer):
1. plaintext-mode twin (no roster provisioned) — write/read raw `localStorage` value directly,
   byte-identical to pre-change behavior (this case passes immediately even before the seam is
   wired — expected, it's a permanent regression guard, not a discovery case).
2. provisioned + unlocked (`importRoster` a v2 bundle + `setDek` directly, no login flow —
   auth wiring is WU11) — write through the service, raw stored value starts with `enc:v1:`,
   then read back through the service and confirm the round-trip.
3. locked-read trap (v2 roster imported, `clearDek()` called after writing real ciphertext) —
   the service's normal read throws `MissingDataKeyError`, and the raw ciphertext at that
   storage key is BYTE-IDENTICAL before and after the failed read attempt.

Cases 2 and 3 were the true RED cases for every seam (case 1 passed trivially before the code
change, as predicted) — confirmed via `npx vitest run <file>` before writing any encrypt/decrypt
call, in every one of the six files.

- **products — commit `9abd1b9`**: `product-repository.ts`. Needed a real category (via
  `ProductCategoryRepository.addProductCategoryData`, a public method) as test scaffolding
  since `addProductData` guards on category existence before persisting.
- **product-categories — commit `d4f94ea`**: `product-category-repository.ts`. Straightforward,
  same shape as products.
- **inventory-entries — commit `1439e93`**: `inventory-offline-service.ts`. Test scaffolding
  needed a real product (via a seeded `ProductRepository`) since `createInventoryEntry` guards
  on product existence. Confirmed the `getInventoryEntriesJson` `\|\| '{}'` fallback still fires
  correctly: `decryptEntity(null)` returns `null`, so `null \|\| '{}'` is unchanged.
- **orders — commit `d1554dc`**: `order-offline-service.ts`. Test used `discountFromInvantory:
  false` on the cart product and `isCredit: false` on `createOrder` to keep the inventory-
  deduction and sale-credit-creation cascades (real, unmocked `InventoryOfflineService`/
  `SaleCreditOfflineService` instances constructed internally by `OrderOfflineService`) out of
  scope — this seam test only asserts the orders storage key itself, not the cascades.
- **expenses — commit `bc74356`**: `expense-offline-service.ts`. Only 2 seams (no `getXJson`),
  confirmed by reading the full file before writing the test.
- **sale-credits — commit `5aaa354`**: `sale-credit-offline-service.ts`. Only 2 seams, same
  confirmation. This is the sixth and last seam — all 16 call sites are now wired.

### Gate numbers — before and after Batch B

| Gate | Baseline (end of Batch A) | After WU10 (end of Batch B) |
|---|---|---|
| `pnpm typecheck` | 5/5 tasks | 5/5 tasks |
| `pnpm test` (web-store-pos) | 162 files / 2228 tests | 168 files / 2246 tests |
| `pnpm test` (domain + web-common, cached) | 95/95, 11/11 | unchanged (95/95, 11/11) |
| `pnpm lint` | 4/4 packages | 4/4 packages |

Net for Batch B: **+18 tests, +6 test files** (3 tests × 6 seam files), zero regressions, zero
behavior change on any device (no DEK is ever set until WU11 — every seam is a proven no-op in
plaintext mode, matching the design's own "Behavior change: NONE" classification for WU5-10).

### Deviations from tasks.md / design.md (Batch B)

**None.** Every seam location, the uniform seam rule (decrypt before sentinel/`\|\|`/parse,
encrypt after `stringify`), the auto-init-outside-try invariant, and the 16-site count all
survived contact with the code exactly as design.md predicted. No line-number drift was found
beyond what design.md had already corrected (orders +3, sale-credits −11 vs. explore's original
claim) — this batch located every call site by reading the file, not by trusting cached line
numbers, per the apply instructions, and found the design's own numbers already accurate.

### Commits (Batch B, in order)

5. `9abd1b9` — `feat(sales): apply entity encryption seam to products`
6. `d4f94ea` — `feat(sales): apply entity encryption seam to product-categories`
7. `1439e93` — `feat(inventory): apply entity encryption seam to inventory-entries`
8. `d1554dc` — `feat(sales): apply entity encryption seam to orders`
9. `bc74356` — `feat(expenses): apply entity encryption seam to expenses`
10. `5aaa354` — `feat(sales): apply entity encryption seam to sale-credits`

## Batch C (WU12 then WU11) — the unlock gate + auth wiring, FIRST real behavior change

**Ordering honored exactly as design/tasks specify: WU12 committed first (inert gate — nothing
sets a DEK yet, so `needsUnlock` is always `false` at that commit), then WU11 (the commit that
actually starts producing ciphertext on provisioned devices).** WU3.3 (real-backend KAT) was
explicitly out of scope for this batch per the apply instructions that launched it — it remains
unattempted and is still the hard gate before `sdd-verify` on the full change (see below).

### WU12 — unlock gate — commit `ba6335b`

- `offline/unlock-gate.ts` (new) — `needsUnlock(user)`: `false` for a null user; `false` if
  `getDek() !== null`; else expiry-ignoring `getRawRoster()` read, `false` if no bundle or
  `formatVersion < 2`; else looks up this user's `login` in `bundle.users` and requires
  **non-empty** `wrappedDek`/`wrapSalt`/`wrapIv` (the backend defaults these to `""`, not `null`).
- `auth/routes/loaders.ts` — added `unlockGate(user)` helper (dynamic import of `unlock-gate.ts`,
  D1/D4 convention preserved — zero static `offline/` imports in this file) wired into exactly
  the two loaders design §5 names:
  - `authLoader`: authenticated + `needsUnlock` → `redirect('/login?unlock=1')`, **no `logout()`
    call** — session and roster survive so the re-login can complete offline.
  - `guestOnlyLoader`: authenticated + `needsUnlock` → returns `null` (renders the login form)
    **before** calling `resolveUserHomePath` — that call reads business-entity storage seams that
    throw `MissingDataKeyError` while locked, so the check had to precede it. This was proven, not
    assumed: the RED run for this case failed with a REAL `MissingDataKeyError` propagating out of
    `ProductCategoryRepository.getProductCategoriesFromLocalStorage` via
    `resolveUserHomePath` → `hasAnyAvailableToSaleProduct`, i.e. the locked-read trap itself firing
    because the gate didn't exist yet — direct evidence the ordering in the design is load-bearing,
    not decorative.
- `auth/routes/login.tsx` — `?unlock=1` (via `useSearchParams`, same pattern as `register.tsx`)
  renders `AUTH.UNLOCK_REQUIRED`; **two** separate `DekUnwrapError` dispatch sites (not one, per
  the existing code shape): `offlineErrorMessageId` gained one `name === 'DekUnwrapError'` case for
  the offline path, and the online path's `catch` block gained its own explicit
  `err.name === 'DekUnwrapError'` check (checked first, before the `loginRejectionDescription`/
  status-code branches) since the online path has no shared dispatcher function to extend.
- `shared/lib/i18n/es.ts` — `AUTH.UNLOCK_REQUIRED` / `AUTH.UNLOCK_FAILED`, copied verbatim from
  the spec's ratified-copy table.
- RED evidence: `unlock-gate.test.ts` (new, 9 cases) failed on `Failed to resolve import` before
  the module existed. `loaders.test.ts`'s new "unlock gate" describe block (6 new cases) failed
  for two different real reasons — the `MissingDataKeyError` propagation described above for the
  locked-`guestOnlyLoader` case, and a plain `expected null to be an instance of Response` for the
  locked-`authLoader` case (it returned `null`, unchanged, before the gate existed). `login.test.tsx`'s
  new "unlock gate banner" describe block (3 new cases) failed on missing banner text / missing
  failure text before the `?unlock=1` read and the `err.name` branch existed.
- Gates: `pnpm typecheck` 5/5, `pnpm test` 169 files / 2264 tests (+1 file, +18 tests: 9
  `unlock-gate.test.ts` + 6 `loaders.test.ts` + 3 `login.test.tsx`), `pnpm lint` 4/4.

### WU11 — auth wiring — commit `2929ad4`

- `stores/auth-store.ts` — added a **static** import of `setDek`/`clearDek` from
  `storage/data-key-store` (legal by design D6: that module is a genuine zero-import leaf under
  `storage/`, not `offline/`). `login()`: after the existing `get().getUserByToken()` hydration,
  dynamically imports `getRawRoster` (`offline/roster-store`) and looks up `bundle.users` by
  `user.login` (the hydrated user's login, matching what `needsUnlock` itself checks against — not
  the raw `email` submit-form parameter, since those can differ for some auth flows even though
  they're the same value in the common case). If a non-empty wrap entry exists, dynamically imports
  `unwrapDek` (`offline/dek-unwrap`) and calls `setDek(dek, bundle.storeId)`. **Not** wrapped in a
  swallowing try/catch beyond the existing outer `catch (err) { set(...); throw err; }`, which
  already rethrows — so a `DekUnwrapError` here fails the `login()` promise exactly as the errors
  spec requires. `logout()` now calls `clearDek()` unconditionally (before the existing
  `AUTH_MODEL`-only clear's `set()` call) — this transitively covers the offline 1h idle-lock too,
  since `app-layout.tsx`'s idle timer already calls `useAuthStore.getState().logout()` and needed
  no separate wiring; confirmed by reading `app-layout.tsx`, not assumed.
- `offline/offline-auth-service.ts` — added **static** imports of `unwrapDek` and `setDek` (legal:
  this file already lives under `offline/`, D6 doesn't apply here). `authenticateOffline` unwraps
  immediately after the existing `isActive` check (verifier already confirmed the password is
  correct at that point) and before `toUserModel`, using the SAME `bundle` the function already
  held from its one `getRoster()` read — no second roster read introduced.
- RED evidence, both files use REAL wrap fixtures (not mocks) built with the identical crypto path
  `unwrapDek` itself uses (`sha256Base64` → `pbkdf2Base64` → `aesGcmEncrypt`), so a passing test
  proves the wiring recovers the actual correct DEK, not merely that some function was invoked:
  - `auth-store.dek.test.ts` (new file, 3 cases: 11.1 non-null DEK after online login with a
    real wrap entry for this login — RED failed on `expected null not to be null`; 11.3 no-roster
    login still resolves, DEK stays null — **passed immediately on first run, as task 11.3 itself
    flags as expected given a correct 11.1 guard**, no code defect, kept as the majority-case
    regression guard; 11.4 wrapped-under-a-different-password login rejects with a
    `DekUnwrapError`-named error — RED failed because the promise resolved instead of rejecting).
    Gotcha found and fixed while writing this file: an initial version used `vi.resetModules()` +
    a freshly re-imported `auth-store`, which silently created a SEPARATE
    `storage/data-key-store.ts` module instance from the one the test file's own top-level
    `getDek()` import observed — assertions read a permanently-empty DEK slot and 11.1 failed even
    after the GREEN implementation was correct. Fixed by dropping `resetModules()` and using the
    same statically-imported `useAuthStore` singleton the production code shares (mirroring how
    `login()` already dynamically imports `authHttpService` at call time, so `vi.doMock` still
    intercepts it without needing a fresh module registry).
  - `offline-auth-service.test.ts` — added `expect(getDek()).toBeNull()` to the existing v1
    happy-path test (this is the regression assertion 11.5 names for all 11 pre-existing v1
    fixtures in the file — none needed a code change) + a new describe block with a real v2 wrap
    fixture asserting `getDek()` is non-null and equals the expected bytes after a successful
    offline login.
- Gates: `pnpm typecheck` 5/5, `pnpm test` 170 files / 2269 tests (+1 file, +5 tests: 3
  `auth-store.dek.test.ts` + 1 `auth-store.test.ts` logout case + 1 `offline-auth-service.test.ts`
  v2 case), `pnpm lint` 4/4.

### The four roster×DEK combinations after this batch (all four directly tested)

| Roster provisioned for this user | DEK in memory | `needsUnlock` | Pinned by |
|---|---|---|---|
| No | null | `false` (majority case) | `unlock-gate.test.ts` row 1 + `loaders.test.ts` "majority case" (both loaders) |
| No | present (rare: roster cleared post-unlock) | `false` | `unlock-gate.test.ts` row 2 |
| **Yes** | **null** | **`true`** | `unlock-gate.test.ts` row 3 + `loaders.test.ts` "locked provisioned" (both loaders) — this is the one that was proven to matter via the real `MissingDataKeyError` RED failure above |
| Yes | present | `false` | `unlock-gate.test.ts` row 4 + `loaders.test.ts` "unlocked provisioned" (both loaders) |

### Reload path (design §11) — confirmed, not just asserted in isolation

The DEK is module-level-only in `data-key-store.ts` (already true since WU4) and nothing in this
batch persists it anywhere. On a provisioned device: reload → `getDek()` is `null` →
`needsUnlock` is `true` → `authLoader` redirects to `/login?unlock=1` **without** calling
`logout()` (asserted directly in `loaders.test.ts` via a `logoutSpy` that must NOT be called) →
user re-enters their password → the normal login flow (offline if the local bundle is valid,
online if expired) unwraps the DEK as a side effect via WU11's wiring → `authLoader` passes on the
next run. On an unprovisioned device, `isEncryptionProvisioned()` stays `false` so `needsUnlock`
stays `false` and the reload path is byte-for-byte unchanged (pinned by the "majority case"
rows above, which are the same assertions that existed before this batch).

### Deviations from tasks.md / design.md (Batch C)

**One, both already anticipated by the plan itself, not new drift:**

1. `guestOnlyLoader`'s RED evidence for the locked-provisioned case was a genuinely thrown
   `MissingDataKeyError` from deep inside `resolveUserHomePath`, not a clean assertion failure —
   tasks.md 12.2 predicted the shape of this case but not that the RED run would surface the trap
   itself firing. Treated as confirming evidence for the design's own ordering requirement, not a
   deviation from it — no design/task text needed correction.
2. `login.tsx`'s `DekUnwrapError` dispatch needed TWO separate code sites (`offlineErrorMessageId`
   for the offline path, a new explicit branch in the online `catch` block) rather than the single
   "one `err.name` dispatch case added" tasks.md 12.4 describes — because the online path in the
   existing code has no shared dispatcher function to extend, unlike the offline path. Functionally
   identical outcome (`AUTH.UNLOCK_FAILED` on both paths), just two edit sites instead of one.

No other module map path, function signature, ordering constraint, or file location deviated from
design.md §5/§10/§11.

## Explicitly NOT done after Batch C

- **WU3.3 — real-backend KAT interop vector.** Still not attempted (out of scope for this batch
  per its own launch instructions). `dek-kat.json` still carries `"provenance":
  "node-transcription"`. **Still the hard gate before `sdd-verify` runs on the full change** — the
  unwrap path is now LIVE in production code (WU11), which makes this gate more load-bearing than
  when it was deferred during Batches A/B, not less.
- **WU13 — eager entity migration pass.** Not started. Depends on WU11 (now landed) — unblocked,
  next in sequence.
- **WU14 — v2 fixtures alongside the 11 existing v1 fixtures + stale-comment cleanup.** Not
  started. Depends on WU11-13 landing first (fixtures should reflect the final shape) — WU13 still
  pending.

## Batch D (WU13) — eager entity migration pass

### WU13 — commit `b8df07c`

- `storage/entity-migration.ts` (new) — `runEntityMigration()`: guard-returns immediately when
  `isEncryptionProvisioned()` is false (zero entity-key reads/writes — the guard's own
  `getRawRoster()` read of the roster key is unavoidable and is not an entity read). Scoped to
  `getRawRoster()!.storeId`, never `selectedStoreId` — the module never references a `user`
  object at all (grepped, zero hits, satisfying the checklist gate directly rather than by
  inspection alone). Iterates the same six entity names in WU5-10's landing order (products →
  product-categories → inventory-entries → orders → expenses → saleCredits) via
  `StorageKeys.entityKey(name, storeId)`, raw `getItem` → skip if `null` or already `enc:v1:` →
  `setItem(key, encryptEntity(raw))`. Never `JSON.parse`s, never calls a service's
  `setXLocalStorage`. Each key wrapped in its own `try/catch` for per-key isolation.
- Wired into both login paths immediately after `setDek`, inside `try {} catch {}`:
  - `stores/auth-store.ts` `login()` — dynamic `import('../storage/entity-migration')` (D6: this
    file must stay at zero static `offline/`-adjacent imports; the dynamic-import convention
    already used for `dek-unwrap`/`roster-store` in WU11 extends naturally here).
  - `offline/offline-auth-service.ts` `authenticateOffline` — static import (file already lives
    under `offline/`, no D6 constraint, matching the existing static imports of `unwrapDek`/`setDek`
    from WU11).
- RED evidence: `entity-migration.test.ts` (new, 4 tests covering 13.1-13.4) failed on
  `Failed to resolve import "../entity-migration"` before the module existed (confirmed by
  temporarily moving the just-written implementation aside and re-running, then restoring it —
  the implementation was drafted before the test file in this session, so RED was confirmed
  retroactively by this move-aside/restore technique rather than a natural pre-implementation
  RED). The two wiring tests (13.6, one added to `auth-store.dek.test.ts`, one added to
  `offline-auth-service.test.ts`) were each RED-confirmed properly: the wiring block was
  temporarily reverted in each production file, the specific new test re-run and observed to
  fail with `expected false to be true` (the entity key was never marked), then the wiring was
  restored and the test re-run GREEN.
- **13.1's exact assertion needed one correction while writing it**: the spec scenario says
  "no localStorage key is read or written" for the unprovisioned guard, but
  `isEncryptionProvisioned()` itself necessarily reads the roster key (`lizoft.offline-roster`)
  to decide the guard — that read is unavoidable and is not what the spec's guarantee is
  protecting. The test was written scoped to the six ENTITY keys specifically (asserts zero
  entity-key `getItem` calls and zero `setItem` calls of any kind), which is the guarantee that
  actually matters: an unprovisioned device's business data is never touched.
- **Partial-failure behavior, pinned by test**: `entity-migration.test.ts`'s "partial failure is
  per-key isolated" test seeds all six real entity keys with plaintext, makes `setItem` throw for
  the third key only (`inventory-entries`, via a `Storage.prototype.setItem` spy that
  conditionally throws and otherwise delegates to a captured reference to the real
  implementation), runs migration, and asserts: the other five keys ARE converted to `enc:v1:`,
  the third key's value is byte-identical to its original plaintext (not corrupted, not
  partially written — `setItem` is atomic per key), and `runEntityMigration()` itself does not
  throw (per-key `try/catch` swallows it). A device interrupted mid-pass (quota exceeded, tab
  closed) is therefore always fully readable via `decryptEntity`'s permanent passthrough; the
  next successful unlock retries whatever didn't convert.
- 13.5 (documented, not independently tested): a failure inside migration not failing login is
  covered by construction — both call sites wrap the call in `try {} catch {}` — and by 13.3's
  per-key isolation test, which is the load-bearing proof that the swallow behavior actually
  matters at the loop level. No separate "migration throws, login still resolves" integration
  test was added; flagged here rather than silently treated as done.
- Gates: `pnpm typecheck` 5/5, `pnpm test` **171 files / 2275 tests** (+1 file, +6 tests: 4
  `entity-migration.test.ts` + 1 `auth-store.dek.test.ts` wiring case + 1
  `offline-auth-service.test.ts` wiring case), `pnpm lint` 4/4.

### Deviations from tasks.md / design.md (Batch D)

**None in the implementation.** One process deviation, self-corrected: the module was drafted
before its test file in this session (reversed from the strict RED-first ordering used in every
prior batch); RED was still captured and verified (by moving the finished module aside, running
the test suite, confirming the right failure reason, then restoring it) before GREEN was
accepted, so the letter of strict TDD's RED-then-GREEN discipline holds even though the drafting
order was not literal top-to-bottom RED-first. Flagged for transparency, not hidden.

## Batch E (WU14) — v2 fixtures + stale comment cleanup

### WU14 — commit `042c139`

- Added a `formatVersion: 2` regression-coverage twin at each of the 9 files tasks.md 14.1 names
  (`roster-serializer.test.ts`, `auth-store.offline.test.ts`, `roster-store.test.ts` ×2,
  `offline-auth-service.test.ts`, `provision.test.tsx`, `login.offline.e2e.test.tsx` ×2,
  `roster-http-service.test.ts`, `roster-export-panel.test.tsx`) — **10 sites by direct count
  against the task's own file list**, not 11 as its headline number states; the discrepancy is in
  tasks.md's own arithmetic (the list as written sums to 10), not a site that was missed — no
  additional v1-fixture site exists beyond these 10, confirmed by grepping every
  `formatVersion: 1` occurrence in `apps/web-store-pos/app` and accounting for each hit (the
  files NOT in this task's list — `entity-crypto.test.ts`, `unlock-gate.test.ts`,
  `roster-types.test.ts` — already carry both v1 AND v2 coverage from WU2/WU4/WU12 and are
  correctly excluded from this "pre-existing fixture" list).
- Every v2 twin **passed on first run** — no defect surfaced in any earlier WU. Per the task's own
  instruction ("flag any fixture where adding the v2 variant surfaces an actual failure — that is
  a real defect"), this is recorded as a clean pass, not silently skipped.
- All 11 pre-existing `formatVersion: 1` fixtures are byte-for-byte untouched — they remain the
  permanent plaintext-mode regression tests per the ratified "formatVersion < 2 means encryption
  not provisioned, behaves exactly as today" decision.
- `roster-http-service.ts` and `roster-export-panel.tsx` — deleted the stale "does not exist
  server-side yet" doc comments. **Verified live before editing** (per the apply instruction not
  to trust cached line numbers): `rg -n "offline-roster"
  backend/src/SMCA.WebApi/Controllers/v1/StoreUsersController.cs` confirms
  `[HttpGet("{storeId}/offline-roster")]` at line 41 — the route exists and is implemented.
- Gates: `pnpm typecheck` 5/5, `pnpm test` **171 files / 2285 tests** (+0 files, +10 tests — all
  new tests added to existing files, no new test files), `pnpm lint` 4/4.

### Deviations from tasks.md / design.md (Batch E)

**None**, aside from the "10 vs 11" arithmetic note above, which is a discrepancy in tasks.md's
own headline count versus its own file list, not a deviation in what was implemented.

## Gate numbers — full change, cumulative

| Gate | Baseline (before WU0) | End of Batch C | End of Batch D (WU13) | End of Batch E (WU14, FINAL) |
|---|---|---|---|---|
| `pnpm typecheck` | 5/5 tasks | 5/5 tasks | 5/5 tasks | 5/5 tasks |
| `pnpm test` (web-store-pos) | 155 files / 2196 tests | 170 files / 2269 tests | 171 files / 2275 tests | 171 files / 2285 tests |
| `pnpm test` (domain + web-common) | 95/95, 11/11 | unchanged | unchanged | unchanged |
| `pnpm lint` | 4/4 packages | 4/4 packages | 4/4 packages | 4/4 packages |

Net across the WHOLE change: **+16 test files, +89 tests**, zero regressions at any batch
boundary.

## Commits (Batch D+E, in order)

11. `b8df07c` — `feat(storage): add eager entity migration wired into login paths`
12. `042c139` — `test(offline): add v2 fixtures alongside v1, correct stale endpoint comments`

(Commits 1-10 are Batches A-C, listed in their own sections above.)

## Outstanding across the WHOLE change (as of end of Batch E)

- **WU3.3 — real-backend KAT interop vector.** STILL NOT attempted in any batch. `dek-kat.json`
  still carries `"provenance": "node-transcription"` with a header stating in plain text that it
  does NOT prove backend interop. **This remains the single hard gate before `sdd-verify` can run
  on this change** — everything else in the WU spine (WU0-14) is now implemented and gated GREEN.
  Requires bringing up the real .NET backend and running a one-off harness against
  `StoreKeyWrapService`/`StoreDataKeyProvider` for the same fixed password used in the existing
  fixture, then replacing the fixture's `provenance` label with `"dotnet-backend"` plus the
  backend commit SHA, and confirming `dek-unwrap.kat.test.ts` passes unmodified against the new
  fixture. This cannot be completed by an agent alone in this sandbox (no .NET runtime available).
- No other task in the WU0-14 spine remains open.

## Next

`sdd-verify` cannot run cleanly until WU3.3 lands (it is the change's own hard gate, not a
verify-phase invention). If verify is run anyway, expect it to flag WU3.3 as the sole
CRITICAL/blocking item — everything else in tasks.md is `[x]`. Once a genuine backend-exported
KAT vector is committed, this change is verify-ready and the SDD pipeline can proceed to
`sdd-verify` → `sdd-archive`.

---

## ARCHIVE ADDENDUM (orchestrator, 2026-08-02)

`sdd-verify` was run and returned **BLOCKED — 1 CRITICAL** exactly as this file predicted: WU3.3's
KAT fixture still carries `"provenance": "node-transcription"`, not a genuine backend-exported
vector. The orchestrator reviewed the CRITICAL against the code directly and **overrode it
deliberately** to proceed to archive. See
`openspec/changes/archive/2026-08-02-at-rest-encryption-frontend/archive-report.md` for the full
override rationale, the code evidence bounding the residual risk, and the cross-reference to
`docs/plans/2026-08-02-offline-roster-dek-interop-backend-plan.md` (commit `414a78e`), which now
owns closing WU3.3 on the backend side.
