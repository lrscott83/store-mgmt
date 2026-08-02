# Verify report: at-rest-encryption-frontend

Branch `feat/at-rest-encryption-frontend` (22 commits over main), verified against the 5 delta
specs (25 requirements/60 scenarios), design.md, tasks.md, apply-progress.md, and the real code
state via `git diff main` + direct file reads.

## Verdict: BLOCKED (verify-clean withheld) — 1 CRITICAL (pre-declared, not new), 0 WARNING, 1 SUGGESTION

The implementation itself is correct, honest, and matches design/spec with no drift found. The
sole blocker is the already-known WU3.3 gap, which per its own governing rule must keep this
change out of "verify-clean" until resolved.

## CRITICAL (1)

**WU3.3 — no genuine backend interop proof for the DEK-wrap KAT.**
`frontend-react/apps/web-store-pos/app/shared/lib/offline/__tests__/__fixtures__/dek-kat.json:2-6`
still carries `"provenance": "node-transcription"`, with its own header stating in plain text
this is a transcription of `StoreKeyWrapService.cs`, not a backend-exported vector — confirmed
unchanged since the commit that created it (`327d5fb`, WU3); no later commit touched the file
(`git log` on the path shows only that one commit). This is honest — the label was not quietly
upgraded — but it means `unwrapDek` (`offline/dek-unwrap.ts:46-62`, now LIVE in production via
`auth-store.ts:199-220` and `offline-auth-service.ts:127-143`) has never been checked against a
real `.NET`-produced `wrappedDek`/`wrapSalt`/`wrapIv`/expected-DEK tuple. What remains unproven:
whether the frontend's PBKDF2/AES-GCM parameter reading (UTF-8-of-Base64 KEK input, salt/iv
byte order, `ct‖tag` layout, 210000 iterations) truly matches the backend byte-for-byte, as
opposed to matching a second independent reading of the same source file. Per apply-progress.md
and tasks.md 3.3, this is a self-declared hard gate — confirmed still open, not re-litigated.
Cannot be closed in this sandbox (no .NET runtime).

## WARNING: none found.

## SUGGESTION (1)

`entity-migration.ts` module was drafted before its test file in this session (apply-progress.md
Batch D, "process deviation"), with RED reconstructed via move-aside/restore rather than natural
pre-implementation failure. The team already flagged this transparently and the reconstruction
method is sound (real `Failed to resolve import` observed), so this is not a defect — logged only
so a future strict-TDD audit doesn't need to re-discover it.

## Requirement-by-requirement (25/25 checked against code, not just tasks.md checkboxes)

All 25 requirements across the 5 specs verified true against current code:
- `offline-roster-bundle` (3 new): `roster-store.ts:126-138` (`getRawRoster`, no `now` param,
  expiry-ignoring), `roster-store.ts:158-161` (`isEncryptionProvisioned`), `roster-types.ts`
  optional wrap fields + `formatVersion: number` unnarrowed — all match.
- `entity-at-rest-encryption` (5): `entity-crypto.ts:57-71` (DEK-first order), `:84-98`
  (marker-first decrypt), 16/16 call sites confirmed live (`rg` count: 6 encrypt + 10 decrypt
  across product-repository.ts, product-category-repository.ts, inventory-offline-service.ts,
  order-offline-service.ts, expense-offline-service.ts, sale-credit-offline-service.ts), all 6
  auto-init writes confirmed OUTSIDE their read's `try/catch` (read each file directly) — the
  locked-read-never-destroys-ciphertext guarantee holds by construction and is pinned by
  `product-repository.crypto.test.ts:82-97` (and its five siblings) reading raw `localStorage`
  bytes before/after a failed locked read.
- `dek-lifecycle-and-unlock-gate` (5): `data-key-store.ts` module-level `let`, `data-key-store
  .test.ts:33-51` asserts no storage key ever contains the DEK's Base64 (real negative-assertion
  test, not vacuous). DEK set/cleared at the 4 real call sites (`auth-store.ts:199-220`,
  `offline-auth-service.ts:127-143`, `auth-store.ts:264` logout). `unlock-gate.ts:10-22`
  implements all 4 roster×DEK combinations, all 4 directly tested in `unlock-gate.test.ts`
  including the per-user stranding regression (row 1) and the empty-string-wrap-fields case
  (row 3b, backend defaults `""` not `null`). `loaders.ts:29-39,42-59`: `authLoader` redirects
  without `logout()` (confirmed, no `logout()` call in that path); `guestOnlyLoader` returns
  `null` (renders form) before `resolveUserHomePath` when locked — apply-progress records this
  ordering was proven load-bearing by a genuine `MissingDataKeyError` RED failure, not assumed.
- `entity-migration` (5): `entity-migration.ts:61-82` — guarded by `isEncryptionProvisioned()`
  (zero entity reads when false, pinned by a real `getItem`/`setItem` spy test), never blocks
  login (both call sites wrap in `try{}catch{}`), byte-preserving (no `JSON.parse`, no service
  write-seam call — confirmed by reading the module, it only imports `entity-crypto`+
  `roster-store`+`storage-keys`), scoped to `getRawRoster().storeId` not `selectedStoreId`
  (module has zero references to a `user` object, confirmed by grep), idempotent + skips absent
  keys + per-key isolated (pinned by `entity-migration.test.ts`'s partial-failure test using a
  real `Storage.prototype.setItem` spy that throws on one key only).
- `at-rest-encryption-errors` (5): `login.tsx:33-49` (offline `DekUnwrapError` → `AUTH.UNLOCK_
  FAILED`), `login.tsx:144-153` (online path rethrows and maps the same way — confirmed NOT
  swallowed, `auth-store.ts:145-228`'s `login()` has no catch around the unwrap block beyond the
  existing rethrowing outer catch), `entity-crypto.ts`'s `MissingDataKeyError` has no i18n
  mapping (confirmed: no `i18n` lookup anywhere near its throw sites), exact Spanish copy in
  `i18n/es.ts` matches the spec's ratified strings verbatim.

## Test honesty audit

Spot-checked the highest-risk test files directly (not the task list): `product-repository
.crypto.test.ts`, `auth-store.dek.test.ts`, `unlock-gate.test.ts`, `data-key-store.test.ts`,
`entity-migration.test.ts`. All are load-bearing:
- Crypto seam tests read raw `localStorage.getItem` and assert on the byte prefix (`enc:v1:`
  present/absent) and on ciphertext being byte-identical across a failed locked read — these
  would fail if the seam were removed or the ordering reversed.
- `auth-store.dek.test.ts` builds real wrapped-DEK fixtures using the SAME crypto primitives
  production code uses (not stubs) and asserts the recovered DEK bytes match exactly — proves
  the wiring recovers the correct key, not merely that a function was called. Test 11.4 (wrong-
  password-relative-to-wrap) asserts rejection with the correct error name.
- No test found asserting only "mock was called" for behavior that should be checked against
  real output. `mockAuthHttp` mocks only the HTTP boundary (login/getMe), leaving the entire
  crypto/DEK/storage path real — appropriate mocking boundary, not over-mocking.

## TDD contract audit

apply-progress.md's RED evidence is largely genuine (real `Failed to resolve import`, real
`TypeError: ... is not a function`, a real `MissingDataKeyError` propagating through
`resolveUserHomePath` before the gate existed). Two GREEN-on-first-run cases (`data-key-store
.test.ts` negative assertion; `auth-store.dek.test.ts` 11.3) are explicitly self-flagged as
expected regression guards, not miscounted as RED-discovery — correct handling. The one process
deviation (`entity-migration.ts` drafted before its test) is self-disclosed with a described
reconstruction method (move-aside/restore) that is methodologically sound. No RED evidence found
to be silently fabricated or reconstructed without disclosure.

## HARD CONSTRAINT (unprovisioned path, obs #1549)

Genuinely tested, not merely asserted in prose, across all six seams (`*.crypto.test.ts`
"plaintext mode" case per entity, asserting raw bytes are NOT `enc:v1:`-prefixed and parse as
plain JSON), both loaders (`loaders.test.ts` "majority case" rows for both `authLoader`/
`guestOnlyLoader`), and the migration guard (`entity-migration.test.ts`'s zero-entity-read/write
test using real `getItem`/`setItem` spies). `encryptEntity`/`decryptEntity` both have an explicit
no-roster case (`entity-crypto.test.ts`). Constraint holds.

## Crypto correctness of the seams

No path found where a write can produce ciphertext the device cannot later read (fresh random
IV per write via `crypto.getRandomValues`, DEK held only in memory scoped for the session, same
`aesGcmDecrypt` used to read what `aesGcmEncrypt` wrote). No path found where a read failure
silently overwrites ciphertext with an empty container — verified directly across all 6 seams
that every auto-init write sits outside its read's `try`, so a locked read's `MissingDataKeyError`
propagates uncaught instead of triggering auto-init.

## Spec/code drift

No drift found. All cited module/function names in the 5 specs resolve to real code performing
the described behavior (specs deliberately avoid file:line citations per design's own note about
the earlier exploration phase's line-number drift — a discipline that held).

## Gates (run directly, not from cache claims)

- `pnpm typecheck`: 5/5 tasks (cache hit, all green)
- `pnpm test`: web-store-pos 171 files / 2285 tests passed; domain 11 files / 95 tests passed;
  web-common 1 file / 11 tests passed — matches apply-progress.md's claimed final numbers exactly
- `pnpm lint`: 4/4 packages (eslint-config, domain, web-common, web-store-pos), all `--max-
  warnings=0` clean

## Outstanding item confirmed, not re-litigated

WU3.3 (real-backend KAT vector) is deliberately not done — requires a .NET runtime unavailable
here. The `dek-kat.json` header's `"provenance": "node-transcription"` label is still accurate
and was not quietly upgraded (single commit `327d5fb` touches the file; no later commit modifies
it). What is left unproven: byte-for-byte interop between the frontend's DEK-unwrap
implementation and the real `StoreKeyWrapService`/`StoreDataKeyProvider` backend for a genuine
password/wrap tuple. Per the change's own tasks.md 3.3 and apply-progress.md, this is the single
hard gate before the change can be marked verify-clean.
