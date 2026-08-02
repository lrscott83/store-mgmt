# Apply progress: at-rest-encryption-frontend

Artifact store: hybrid. Engram topic key: `sdd/at-rest-encryption-frontend/apply-progress`.
Branch: `feat/at-rest-encryption-frontend`, cut from `main` (clean apart from the two
dependency files: `apps/web-store-pos/package.json`, `pnpm-lock.yaml`).

**Batch A (WU0-4) + Batch B (WU5-10) are DONE.** WU11-14 are NOT started. This file merges
Batch A's original record (unchanged below, WU0-4 sections) with Batch B's new record (WU5-10
section added after WU4). Nothing from Batch A's record was altered or removed.

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

## Next

`sdd-apply` again for Batch C (WU12 then WU11 — the unlock gate landing first as an inert gate,
then auth wiring, the FIRST real behavior change) once WU3.3's real-backend KAT vector has
landed, since that batch is where the unwrap path goes live and depends on the KAT being
backend-proven, not just node-transcribed. WU3.3 remains the hard gate before `sdd-verify` runs
on the full change; it has not been attempted in either batch so far.
