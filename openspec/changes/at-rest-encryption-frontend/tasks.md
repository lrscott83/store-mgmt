# Tasks: at-rest-encryption-frontend

Artifact store: hybrid. Engram topic key: `sdd/at-rest-encryption-frontend/tasks`.
Inputs: `design.md` (obs #1750, HOW/authoritative), `specs/*/spec.md` (obs #1751, WHAT — 25
requirements / 60 scenarios), `proposal.md` (obs #1749), `explore.md` (obs #1748).

Delivery: commits-only on `feat/at-rest-encryption-frontend`, cut from the current branch's HEAD
(design says "cut from main" — confirm current branch IS main before cutting; if not, cut from
current HEAD per this repo's standing SDD-branch rule and note the deviation in the commit). No
PRs, no push. **One commit per work unit** (WU5-10 are six separate commits, not one).

Strict TDD is ACTIVE for every task that changes behavior: RED (named failing test) → GREEN
(minimal implementation) → REFACTOR. Gates per work unit, run from `frontend-react/`:
`pnpm typecheck` (5 tasks), `pnpm test`, `pnpm lint` (4 packages; `--max-warnings=0` is baked into
each package script — never pass it at the turbo root). Use `rg --files --glob '<pattern>'` for
discovery (`fd`/`eza` unavailable); never redirect a discovery command's stderr to `/dev/null`.

Requirement tags below use `[spec-file#Requirement short-name]` to trace each task to §WHAT.

---

## WU0 — Branch setup (sequential, prerequisite for everything)

- [x] 0.1 Confirm current branch state (`git status`, `git log --oneline -5`), then
      `git checkout -b feat/at-rest-encryption-frontend` from HEAD. No test — infra only.
      DONE: cut from `main` (clean apart from the two dependency files), not just HEAD.
- [x] 0.2 **HUMAN STEP (not an agent task):** run
      `pnpm add @noble/ciphers@1.3.0 --filter web-store-pos` (or the workspace-correct
      equivalent) from `frontend-react/`, exact pin, no caret. The agent must NOT run
      `pnpm install`. Verify `1.3.0` is still the current audited release before installing —
      this plan has no network access to confirm the latest version at write time; if a newer
      patch/minor exists, pin that instead and record the actual pinned version in the WU1 commit
      message.
      DONE (pre-batch, by the user): actual pinned version is **2.2.0**, not 1.3.0 — v2 API used
      throughout (subpath imports require the `.js` extension, e.g. `@noble/ciphers/aes.js`).

## WU1 — Base64 + AES-GCM primitives (dead code) — [entity-at-rest-encryption groundwork]

Depends on: WU0 (needs `@noble/ciphers` installed to import it, though the RED test for base64
does not).

- [x] 1.1 RED: `storage/base64.test.ts` — `bytesFromBase64(base64FromBytes(bytes))` round-trips a
      fixed 48-byte vector including `0x00` and `0xFF`.
      GREEN: `storage/base64.ts` — `base64FromBytes`/`bytesFromBase64`. Deliberately duplicates
      the 12 private lines in `offline-crypto.ts` (design correction 3) — do NOT import from or
      export to `offline-crypto.ts`.
- [x] 1.2 RED: `storage/aes-gcm.test.ts` — `aesGcmDecrypt` on a **fixed** key/iv/`ct‖tag` triple
      returns the expected plaintext bytes; flipping one byte of the tag throws.
      GREEN: `storage/aes-gcm.ts` — `aesGcmEncrypt`/`aesGcmDecrypt` over `gcm()` from
      `@noble/ciphers/aes`; exports `AES_GCM_IV_BYTES = 12`, `AES_GCM_TAG_BYTES = 16`.
      REFACTOR: confirm this is the only module in the app importing `@noble/ciphers` (checklist
      item).
- [x] 1.3 Gates: `pnpm typecheck`, `pnpm test`, `pnpm lint`. Commit:
      `feat(storage): add base64 and AES-GCM primitives`. Commit `189dbdb`.

## WU2 — Roster raw-read + provisioning predicate (dead code) — [offline-roster-bundle]

Depends on: — (independent of WU1).

- [x] 2.1 RED: `roster-types.test.ts` (or extend existing) — a bundle with the three wrap fields
      absent/empty still passes shape validation; a bundle with all three present and non-empty
      also passes. `[offline-roster-bundle#Bundle carries optional per-user wrap fields]`
      GREEN: `roster-types.ts` — add `wrappedDek?`/`wrapSalt?`/`wrapIv?` to the per-user type.
      `formatVersion` stays `number` — do NOT narrow to `1 | 2` (design correction 7).
- [x] 2.2 RED: `roster-store.test.ts` — `getRawRoster()` returns a bundle whose `expiresAt` is in
      the past, while `getRoster()` on the same stored bytes returns `null`.
      `[offline-roster-bundle#getRawRoster expiry-ignoring raw read]`
      GREEN: `roster-store.ts` — add `getRawRoster()` (no `now` param, never throws); refactor
      `getRoster()` to be `getRawRoster()` + one expiry comparison. Confirm
      `roster-store.purity.test.ts` stays green unchanged (no new imports added to the module).
- [x] 2.3 RED: `isEncryptionProvisioned()` stays `true` for that same expired v2 bundle; is
      `false` for a v1 bundle; is `false` with no bundle at all.
      `[offline-roster-bundle#isEncryptionProvisioned device-level predicate]`
      GREEN: `roster-store.ts` — add `isEncryptionProvisioned()` on top of `getRawRoster()`.
      Checklist gate: it must never call `getRoster()`.
- [x] 2.4 Gates + commit: `feat(offline): add getRawRoster and isEncryptionProvisioned`.
      Commit `f27b9bd`.

## WU3 — DEK unwrap + Known-Answer-Vector — [dek-lifecycle-and-unlock-gate groundwork]

Depends on: WU1 (`aes-gcm.ts`), WU2 is NOT a hard dependency but land after for narrative order.

- [x] 3.1 **RED (fallback fixture first, to not block on backend availability):** transcribe a KAT
      vector from `StoreKeyWrapService.cs` using Node's `crypto` (`pbkdf2Sync` +
      `createCipheriv('aes-256-gcm')`), fixed known password. Commit it as
      `offline/__tests__/__fixtures__/dek-kat.json` with a header block naming the generator
      command and `"provenance": "node-transcription"`. This fixture PINS regressions but does
      NOT prove interop — say so in the fixture header, verbatim.
      RED test: `dek-unwrap.kat.test.ts` — `unwrapDek(knownPassword, fixtureEntry)` equals the
      fixture's expected 32-byte DEK.
      GREEN: `offline/dek-unwrap.ts` — `unwrapDek`, `DekUnwrapError`,
      `DEK_WRAP_ITERATIONS = 210_000` (comment citing it is NOT wire-protected, per design §6).
      Then: wrong password → `DekUnwrapError`; mutate `DEK_WRAP_ITERATIONS` locally in a test →
      KAT fails (proves the constant is load-bearing).
- [x] 3.2 Gates + commit (fallback-fixture state):
      `feat(offline): add dek-unwrap with node-transcribed KAT`. Commit `327d5fb`.
- [ ] 3.3 **NOT DONE — DEFERRED, out of scope for this batch (Batch A).** **HARD GATE — real backend interop (flagged, not skippable before verify).** Bring up
      the real backend locally and run a one-off .NET harness against the actual
      `StoreKeyWrapService`/`StoreDataKeyProvider` for the SAME fixed password, printing Base64 of
      `storedPasswordHash`, `wrapSalt`, `wrapIv`, `wrappedDek`, and the expected `dek`. Replace (or
      add alongside, then delete the node one) the fixture with this output, re-labelled
      `"provenance": "dotnet-backend"`, header noting the backend commit SHA the harness ran
      against. Re-run `dek-unwrap.kat.test.ts` — it MUST still pass unmodified against the new
      fixture. **Definition of done for this task**: a genuine backend-exported v2 bundle fixture
      is committed, self-labelled with provenance and backend SHA, and the KAT test passes against
      it with zero code changes to `dek-unwrap.ts`. **This is the hard gate before `sdd-verify`
      runs on this change** — sequence it any time after 3.2, but do not treat the change as
      verify-ready until it is done. Setup cost is real (spinning up the backend) — do not let it
      block WU1/WU2/WU4 progress; run it in parallel with those.
      Commit (separate, small diff): `test(offline): replace KAT fixture with backend-exported vector`.

## WU4 — DEK runtime + entity envelope — [dek-lifecycle-and-unlock-gate + entity-at-rest-encryption]

Depends on: WU1 (`aes-gcm.ts`), WU2 (`isEncryptionProvisioned`).

- [x] 4.1 RED: `storage/data-key-store.test.ts` — `getDek()` is `null` before any `setDek`;
      returns the exact bytes after; is `null` again after `clearDek()`.
      `[dek-lifecycle-and-unlock-gate#DEK is memory-only]`
      GREEN: `storage/data-key-store.ts` — two module-level `let`s, `setDek`/`getDek`/
      `getDekStoreId`/`clearDek`. Zero imports.
- [x] 4.2 RED (negative/observability assertion): after `setDek`, iterate
      `Object.keys(localStorage)` and `sessionStorage` and assert none contains the Base64 form of
      the DEK bytes. `[dek-lifecycle-and-unlock-gate#No storage key ever carries the DEK]`
      GREEN: none needed if 4.1 is correctly memory-only — this test should already pass; if it
      doesn't, that's the defect this task exists to catch.
- [x] 4.3 RED: `storage/entity-crypto.test.ts` — `decryptEntity('[{"a":1}]')` returns it unchanged
      (no marker); `decryptEntity(null)` → `null`.
      `[entity-at-rest-encryption#decryptEntity permanent marker-based passthrough]`
      GREEN: `storage/entity-crypto.ts` — `ENTITY_ENVELOPE_PREFIX = 'enc:v1:'`, `isEncrypted`,
      `decryptEntity` skeleton (marker check first).
- [x] 4.4 RED: no roster + no DEK → `encryptEntity` returns input unchanged and does NOT throw
      (the optional-encryption MUST). `[entity-at-rest-encryption#Encryption absence permanent mode]`
      GREEN: `encryptEntity` — DEK check FIRST (checklist gate), then
      `isEncryptionProvisioned()` check, THEN throw.
- [x] 4.5 RED: v2 roster + DEK set → `encryptEntity` output starts with `enc:v1:` and
      `decryptEntity` round-trips it to the identical original string.
      `[entity-at-rest-encryption#encryptEntity DEK checked before roster state]`
      `[entity-at-rest-encryption#decryptEntity permanent marker-based passthrough]`
      GREEN: complete `encryptEntity`/`decryptEntity` AES-GCM paths, `MissingDataKeyError`.
- [x] 4.6 RED: v2 roster + no DEK → `encryptEntity` throws `MissingDataKeyError`; marked value +
      no DEK → `decryptEntity` throws `MissingDataKeyError`.
      `[entity-at-rest-encryption#encryptEntity DEK checked before roster state]`
      `[at-rest-encryption-errors#MissingDataKeyError programming-error guard]`
      GREEN: already covered by 4.4/4.5 branches — this task is the explicit test for the third
      branch; if it passes without a code change, that's expected (says so up front — flag,
      don't skip: this is the "throw" arm named in the design table and must be asserted, not
      inferred from the other two).
- [x] 4.7 Second KAT: `entity-crypto.kat.test.ts` — a frozen `enc:v1:` sample + fixed DEK + expected
      plaintext, committed as a fixture. Confirms envelope layout stability across releases (no
      interop partner needed — this one is frontend-only).
- [x] 4.8 Gates + commit: `feat(storage): add data-key-store and entity-crypto`.
      Commit `c858dc1`.

## WU5-10 — Six seams, one commit each — [entity-at-rest-encryption seam boundary]

Depends on: WU4. **Independently implementable in parallel** (six different files, no shared
state) but must land as **six separate sequential commits** per the work-unit-commits convention
— do not squash them. Each seam is a proven no-op in plaintext mode because no DEK exists until
WU11; that is what makes six small commits safe and worth doing individually rather than as one.

For EACH of the six (products, product-categories, inventory-entries, orders, expenses,
saleCredits), the same task shape:

- [x] 5.x RED: `<seam>.crypto.test.ts` — plaintext-mode twin FIRST: with no roster provisioned,
      write then read the raw stored value directly via `localStorage.getItem(...)` — it is plain
      JSON, byte-identical to pre-change behavior. `[entity-at-rest-encryption#Plaintext mode leaves raw value untouched]`
- [x] 5.x RED (same file, second case): with a v2 roster + DEK set (test seeds `setDek` directly,
      no login flow yet — auth wiring is WU11), write through the service, then read the raw
      stored value directly — it starts with `enc:v1:`; then read through the service — the object
      round-trips with Map/date revival intact. `[entity-at-rest-encryption#Ciphertext marker present on provisioned+unlocked write]`
      `[entity-at-rest-encryption#Seam boundary applies uniformly]`
- [x] 5.x RED (locked-read trap): provisioned device, no DEK, existing `enc:v1:` data at the key →
      the service's normal read fails loudly (propagated `MissingDataKeyError`), and the raw stored
      ciphertext is UNCHANGED after the read attempt — no auto-init overwrite.
      `[entity-at-rest-encryption#Locked read never destroys existing ciphertext]` — this is the
      auto-init-trap regression test named in design §3; it is the single highest-value assertion
      per seam and must not be skipped even though it "looks like" the same case as 5.x above.
      GREEN (all three, per seam): wrap the seam's write call in `encryptEntity` immediately after
      `JSON.stringify`; wrap every read call in `decryptEntity` immediately at the `getItem`
      boundary, before any sentinel comparison or `||` fallback. Verify the auto-init write stays
      OUTSIDE the read's try/catch (already true today — do not move it).
- [x] 5.x Gates + commit, one per seam:
  - [x] `feat(sales): apply entity encryption seam to products` — commit `9abd1b9`.
  - [x] `feat(sales): apply entity encryption seam to product-categories` — commit `d4f94ea`.
  - [x] `feat(inventory): apply entity encryption seam to inventory-entries` — commit `1439e93`.
  - [x] `feat(sales): apply entity encryption seam to orders` — commit `d1554dc`.
  - [x] `feat(expenses): apply entity encryption seam to expenses` — commit `bc74356`.
  - [x] `feat(sales): apply entity encryption seam to sale-credits` — commit `5aaa354`.

DONE (Batch B): all 16 call sites confirmed by reading each file directly (not by line number,
per apply instructions) — products 3, product-categories 3, inventory-entries 3, orders 3,
expenses 2, sale-credits 2 = 16, exactly matching design's corrected count with ZERO further
drift beyond what design already found. Each seam's `.crypto.test.ts` covers all three cases
(plaintext-mode twin, provisioned+unlocked round-trip, locked-read trap) against the REAL service
classes (no mocking of the encryption layer). All six auto-init writes confirmed to already sit
OUTSIDE their read's try/catch — none needed to move.

## WU11 — Auth wiring (FIRST behavior change) — [dek-lifecycle-and-unlock-gate acquisition/release]

Depends on: WU3, WU4. **Per design's ordering constraint, WU11 and WU12 must land in the same
commit, or WU12 first** — see WU12 note below; do not commit WU11 alone.

- [x] 11.1 RED: `auth-store.test.ts` — with a v2 roster seeded (for this login) and
      `authHttpService` mocked, online `login(login, password)` leaves `getDek() !== null`
      afterward. `[dek-lifecycle-and-unlock-gate#Online login sets the DEK]`
      GREEN: `auth-store.ts` — after successful `/me` hydration, unwrap via `unwrapDek` and
      `setDek(dek, bundle.storeId)`.
      DONE: `auth-store.dek.test.ts` (new file, real wrap fixture built with the same crypto path
      `unwrapDek` expects, not a mock).
- [x] 11.2 RED: `logout()` → `getDek() === null`.
      `[dek-lifecycle-and-unlock-gate#Logout clears the DEK]`
      GREEN: `auth-store.logout()` calls `clearDek()` (sync, static import from `storage/`).
      DONE: added to `auth-store.test.ts`'s existing `logout` describe block.
- [x] 11.3 RED: no roster seeded for this login → `login` still resolves successfully and
      `getDek()` stays `null`, no throw (the online-auth-only MUST — the majority case).
      `[dek-lifecycle-and-unlock-gate#Login with no roster entry leaves DEK null]`
      GREEN: unwrap is skipped entirely when there's no v2 entry for this login — confirm this is
      already true by construction from 11.1's guard, don't add a redundant branch.
      DONE: passed immediately as flagged (no defect) — kept as the majority-case regression guard.
- [x] 11.4 RED: roster entry wrapped under a different (older) password → `login` REJECTS with a
      `DekUnwrapError`-named error (must rethrow, not swallow).
      `[at-rest-encryption-errors#DekUnwrapError online path MUST fail login]`
      GREEN: unwrap call is NOT wrapped in a swallowing try/catch on the online path.
      DONE: real wrap-under-a-different-password fixture, asserts `rejects.toMatchObject({name:
      'DekUnwrapError'})` and `getDek()` stays null.
- [x] 11.5 RED: `offline-auth-service.test.ts` — v2 roster → `authenticateOffline` leaves
      `getDek() !== null`; v1 roster → succeeds exactly as today and `getDek()` stays `null` (the
      11 existing fixtures become this regression — confirm none of them need a code change, only
      an assertion added). `[dek-lifecycle-and-unlock-gate#Offline login sets the DEK]`
      GREEN: `authenticateOffline` — unwrap after the existing verifier check, before
      `toUserModel`.
      DONE: added `expect(getDek()).toBeNull()` to the existing v1 happy-path test (regression for
      all 11 v1 fixtures in the file) + a new v2 describe block with a real wrap fixture.
- [x] 11.6 Gates + commit (bundled with WU12 — see WU12.4):
      `feat(auth): unwrap and clear DEK on login/logout paths`. Commit `2929ad4`.

## WU12 — Unlock gate (must land with or before WU11) — [dek-lifecycle-and-unlock-gate gate]

**Ordering constraint from design (honored, not deviated): WU11 must not land as a standalone
commit before WU12 exists — a provisioned device would gain ciphertext with no gate, producing
`MissingDataKeyError` in normal use. Resolution used here: commit WU12 first as an inert gate
(`needsUnlock` is always `false` while nothing sets a DEK, since WU11 hasn't landed yet), THEN
commit WU11. This is cheaper than one giant combined commit and still satisfies the constraint.**

Depends on: WU2 (`getRawRoster`), WU4 (`getDek`).

- [x] 12.1 RED: `unlock-gate.test.ts` — all four rows of the §5 combinations table as four cases;
      the "no roster + no DEK → false" row is the explicit stranding-bug regression.
      `[dek-lifecycle-and-unlock-gate#needsUnlock per-user all four combinations]`
      GREEN: `offline/unlock-gate.ts` — `needsUnlock(user)`.
      DONE: `unlock-gate.test.ts` (new file, 9 cases — 4 rows + null-user + no-entry-for-login +
      v1-roster + empty-string-wrap-fields + expiry-ignoring).
- [x] 12.2 RED: `loaders.test.ts` — `guestOnlyLoader` with an authenticated online-auth-only user
      and no roster → returns a redirect (majority case, unchanged). Then: v2 roster for this
      login + no DEK → returns `null` (renders the form, does NOT bounce).
      `[dek-lifecycle-and-unlock-gate#guestOnlyLoader renders unlock form]`
      GREEN: `guestOnlyLoader` gates on `!needsUnlock(user)`, dynamic import.
      DONE: RED failure was the locked-read trap itself firing (real `MissingDataKeyError` thrown
      from `resolveUserHomePath`'s category-repository read) — proof the check had to precede it.
- [x] 12.3 RED: `authLoader` in the locked-provisioned state → redirects to `/login?unlock=1` AND
      `useAuthStore.getState().user` is still non-null (no logout called).
      `[dek-lifecycle-and-unlock-gate#authLoader redirects without logging out]`
      GREEN: `authLoader` — `unlockGate(user)` helper, dynamic import, no `logout()` call.
- [x] 12.4 RED: `login.tsx.test.tsx` — `?unlock=1` renders `AUTH.UNLOCK_REQUIRED`; a thrown
      `{name: 'DekUnwrapError'}` (either path) renders `AUTH.UNLOCK_FAILED`.
      `[at-rest-encryption-errors#unlock banner and failure copy exact strings]`
      GREEN: `login.tsx` — one `err.name` dispatch case added (no static offline import — D4
      convention preserved); `i18n/es.ts` — add the two exact Spanish keys verbatim from the spec
      table.
      DONE: two dispatch sites, not one — `offlineErrorMessageId` (offline path) AND a new
      explicit `err.name === 'DekUnwrapError'` branch in the online catch (the online path has no
      shared dispatcher function, per the existing code shape).
- [x] 12.5 Gates + commit, WU12 first: `feat(auth): add unlock gate to authLoader and guestOnlyLoader`.
      Commit `ba6335b`. Then WU11's commit (11.6) immediately after, same apply session:
      `feat(auth): unwrap and clear DEK on login/logout paths`. Commit `2929ad4`.

## WU13 — Eager migration pass — [entity-migration]

Depends on: WU4 (`entity-crypto`), WU11 (fires after a successful `setDek`). May land any time
after WU11 (design explicit).

- [ ] 13.1 RED: `entity-migration.test.ts` — `isEncryptionProvisioned()` false → `runEntityMigration()`
      reads/writes NOTHING. `[entity-migration#Migration runs only when provisioned]`
      GREEN: `storage/entity-migration.ts` — guard clause first line.
- [ ] 13.2 RED: seed one plaintext key + one already-`enc:v1:` key, set DEK, run → plaintext key is
      now marked and decrypts to the identical original string (byte-preserving); the already-marked
      key is untouched. Run twice → identical result (idempotent — no second `setItem`).
      `[entity-migration#byte-preserving never routes through service write seams]`
      `[entity-migration#idempotent and skips absent keys]`
      GREEN: `runEntityMigration` — raw `getItem` → skip if `null` or `isEncrypted` → `setItem`
      via `encryptEntity` alone. Never `JSON.parse`. Never call a service's `setXLocalStorage`.
- [ ] 13.3 RED: a `setItem` that throws on key 3 of 6 does not prevent keys 4-6 from converting;
      key 3's original plaintext survives unchanged. `[entity-migration#partial failure per-key isolated]`
      GREEN: per-key `try/catch` inside the loop.
- [ ] 13.4 RED: scope test — v2 roster scoped to store A, `selectedStoreId` is store B → only store
      A's keys touched, store B's untouched. `[entity-migration#scoped to roster store not active store]`
      GREEN: `storeId = getRawRoster()!.storeId` — NOT `user.selectedStoreId` (design correction 6).
      Checklist gate: confirm no read of `selectedStoreId` anywhere in this module.
- [ ] 13.5 RED: a failure inside migration does not fail login (wired into the caller test, not the
      migration module itself) — see 13.6. `[entity-migration#never blocks login]`
- [ ] 13.6 GREEN wiring: call `runEntityMigration()` inside
      `try { } catch { /* swallow */ }` immediately after `setDek` in BOTH `auth-store.login` and
      `authenticateOffline` (small diff on WU11's files). Test: seed a plaintext key, run login,
      assert the key is marked after login resolves (observability point #2 from design §12).
- [ ] 13.7 Gates + commit: `feat(storage): add eager entity migration wired into login paths`.

## WU14 — v2 fixtures + stale comment cleanup — [regression coverage, no behavior change]

Depends on: WU11-13 landed (fixtures should reflect the final shape).

- [ ] 14.1 For each of the 11 existing `formatVersion: 1` fixture sites (`roster-serializer.test.ts`,
      `auth-store.offline.test.ts`, `roster-store.test.ts` ×2, `offline-auth-service.test.ts`,
      `provision.test.tsx`, `login.offline.e2e.test.tsx` ×2, `roster-http-service.test.ts`,
      `roster-export-panel.test.tsx`): add a parallel `formatVersion: 2` fixture variant alongside
      the existing v1 one — do NOT replace the v1 fixture (it is now a permanent plaintext-mode
      regression test per proposal Decision 1). No new production code; this is fixture-only. Not
      independently a RED/GREEN behavior task — it exercises paths already covered by WU2-13's
      tests, so treat each addition as a regression-coverage task, not a new-behavior task; flag
      any fixture where adding the v2 variant surfaces an actual failure — that is a real defect in
      an earlier WU, not a fixture problem.
- [ ] 14.2 Delete the two stale "endpoint does not exist server-side yet" comments in
      `roster-http-service.ts` and `roster-export-panel.tsx`. No test — doc-comment-only, no
      behavior. `[background: correction owned per proposal in-scope table]`
- [ ] 14.3 Gates + commit: `test(offline): add v2 fixtures alongside v1, correct stale endpoint comments`.

---

## Review Workload Forecast

| WU | Est. changed lines (prod + test + fixtures) | Behavior change | Commits |
|---|---|---|---|
| 0 | ~5 (branch + manual dep pin, human step) | none | 0 (setup) |
| 1 | ~200 (base64 30 + test 30, aes-gcm 60 + test 60, package.json 1) | none | 1 |
| 2 | ~175 (types 15, roster-store diff 45 + tests 115) | none | 1 |
| 3 | ~240 (dek-unwrap 60 + fixture 20 + tests 100) + ~20 (backend fixture swap) | none | 2 |
| 4 | ~310 (data-key-store 30 + entity-crypto 90 + tests 190) | none | 1 |
| 5-10 | ~130 each × 6 = **~780** (≈6 lines prod diff + ~120 test each) | none (no DEK exists yet) | 6 |
| 11 | ~290 (auth-store diff 30 + offline-auth-service diff 25 + tests 235) | **first behavior change** | 1 (bundled after 12) |
| 12 | ~410 (unlock-gate 40 + loaders diff 35 + login.tsx diff 25 + i18n 2 + tests 300+) | reload now asks for password on provisioned devices | 1 (lands first) |
| 13 | ~260 (entity-migration 70 + wiring diff 20 + tests 170) | cold data converts on provisioned devices | 1 |
| 14 | ~110 (fixture additions ~90 + comment deletions 10) | none | 1 |
| **Total** | **≈2,800 lines** across the whole change | — | **~15 commits** |

**400-line budget risk: High in aggregate (≈2,800 total), but this repo's standing convention is
commits-only on the branch with NO PR created — there is no 400-line PR gate to trip.** Only WU12
approaches 400 lines in a single commit; every other WU is comfortably under. Framing this as
batching guidance for `sdd-apply`, not a PR-splitting decision:

**Chained PRs recommended: No** (no PRs at all — commits-only per project convention).
**Decision needed before apply: No** — proceed with commits-only; the only thing to flag to the
user is WU12's size, which is inherent to landing the gate atomically per the design's ordering
constraint, not a candidate for further splitting (splitting it would reopen the stranding-loop
risk it exists to close).

**Recommended `sdd-apply` batching** (keeps each apply run's context load and review surface
sane without violating one-commit-per-WU):

1. **Batch A — crypto primitives (WU0-4, 5 commits, ~925 lines, zero behavior change).** Run WU3.3
   (backend interop) in parallel/background — it has real setup cost and does not block WU1/WU2/WU4.
2. **Batch B — six seams (WU5-10, 6 commits, ~780 lines, zero behavior change).** Mechanically
   uniform; safe to run as one apply session since no seam depends on another.
3. **Batch C — the gate + auth wiring (WU12 then WU11, 2 commits, ~700 lines, FIRST behavior
   change).** Run this as its OWN apply session with the strictest review — it is the only batch
   that changes what a real device does. Confirm WU3.3's real-backend KAT has landed before this
   batch ships, since this is where the unwrap path goes live.
4. **Batch D — migration (WU13, 1 commit, ~260 lines).**
5. **Batch E — fixtures + cleanup (WU14, 1 commit, ~110 lines).**

## Tasks flagged as untestable-as-written / human steps

- **0.2** — `pnpm add @noble/ciphers` is a human step; the agent must not run it. Exact version
  (`1.3.0` proposed) needs human confirmation against the npm registry since this plan was written
  without network access.
- **3.3** — the real-backend KAT swap is a hybrid human+agent task: a human (or a scripted CI step
  outside this repo's normal test run) must bring up the actual backend to produce the vector. It
  cannot be satisfied by an agent alone in this sandbox.
- **4.2, 4.6, 11.3** — flagged per the phase's own defect rule: these tests should already pass
  given a correct 4.1/4.4/4.5/11.1 implementation. They are written anyway because they assert a
  *negative* or a *guard-rail* property (DEK never persisted; the throw-branch; the skip-branch)
  that is easy to silently break in a later refactor — keep them as regression tests, not as
  RED-then-GREEN discovery tasks.
