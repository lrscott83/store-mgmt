# Proposal: device-wrapped-dek

> Design is ALREADY AGREED (engram `architecture/at-rest-encryption-key-model`, #2113).
> This proposal scopes it — it does not re-open it. Prior art: `at-rest-encryption-frontend`
> (archived 2026-08-02). **This change MODIFIES four shipped capabilities. It is not greenfield.**

## Intent

At-rest encryption of `localStorage` is shipped and correct, but it is **gated on a two-step manual
human ritual**. The gate chain, verified:

| Step | Evidence |
|---|---|
| `encryptEntity` returns plaintext when no DEK **and** not provisioned | `storage/entity-crypto.ts:67-69` |
| "provisioned" = a `formatVersion >= 2` roster with a `wrappedDek` sits in `localStorage` | `offline/roster-store.ts:158-161` |
| The only production writer of that roster | `auth/routes/provision.tsx:70` — a guest route where a human imports a bundle FILE |
| The only producer of that file | `management/users/components/roster-export-panel.tsx:45`, rendered from `management/users/routes/user-list.tsx:63` — a manual admin button that downloads `roster-{storeId}.smcabundle` |

**Consequence**: a store where nobody pressed "Exportar roster sin conexión" and nobody carried the
file to the device stores every product, order, expense, inventory entry, and sale credit **in the
clear, permanently, even fully online**. Encryption is opt-in by accident of the roster's delivery
mechanism.

Two secondary defects follow from the same root — DEK availability is **per-user** while provisioning
is **per-device**:

1. **Live crash path.** A user absent from the exported roster on a provisioned device: the unwrap is
   skipped (`stores/auth-store.ts:299`), so `getDek()` is `null`; but `isEncryptionProvisioned()` stays
   `true` because it uses `.some()` (`roster-store.ts:160`); so the first entity write throws
   `MissingDataKeyError` uncaught (`entity-crypto.ts:70`) — and no unlock screen appears, because
   `needsUnlock` uses `.find(login)` and returns `false` for a user with no entry (`offline/unlock-gate.ts:18-21`).
2. **Reload tax.** The DEK is a module-level `let` (`storage/data-key-store.ts:15`), so every reload
   costs a password prompt at `/login?unlock=1`.

**Why now**: the design is agreed; the roster/wrap/KAT plumbing already exists and is verified. The
delta is one additional wrap, not a rewrite.

**Success**: on any device, after any login, in any auth mode, entity writes carry `enc:v1:`; a reload
does not prompt; a second user of the same device reads the same data.

## What Changes

**One DEK per device, wrapped N+1 times.**

| Wrap | KEK source | Stored in | Recovers the DEK when |
|---|---|---|---|
| Per-user password wrap (EXISTS) | `PBKDF2(SHA256b64(password), wrapSalt, 210_000)` — `offline/dek-unwrap.ts:25,48-64`, untouched | roster bundle, shape `WrappedDekEntry` (`offline/roster-types.ts:38-40`) | a rostered user logs in; interop with backend `StoreKeyWrapService` |
| **Device wrap (NEW)** | non-extractable WebCrypto `CryptoKey` (`extractable: false`) | **IndexedDB** (first use in this repo) | at startup / reload / for any user of the device, with no password |

All wraps hold the **same** DEK bytes, so auth mode and user identity stop deciding what is readable.

**Where the DEK comes from — decided ONCE per device, never changed:**

1. A roster wrap exists for this login → unwrap it (today's path) and adopt those bytes as THE device DEK.
2. Otherwise → generate 32 random bytes locally.

Either way the device wrap is written immediately. A roster that arrives LATER carrying different DEK
bytes MUST NOT trigger a silent key swap — that is the fatal read-under-B/write-under-A bug (#2113).
Detection is in scope; the re-encryption pass itself is not (see Out of Scope).

**The three moments:**

| Moment | Behavior |
|---|---|
| First boot / first login, unprovisioned device | No device wrap in IDB → mint device `CryptoKey`, obtain DEK per the rule above, persist the device wrap, `setDek(...)`, run `runEntityMigration()` over existing plaintext |
| Any login on a device that already has a device wrap | DEK recovered from the device wrap; roster wrap, if present, is reconciled — identical bytes is the normal case (backend derives `HKDF(masterSecret, storeId)` per store, `StoreDataKeyProvider.cs:17-21`, so all rostered users of one store already share the DEK) |
| Reload without password | Device wrap unwraps the DEK at startup → `needsUnlock` is false → **no `/login?unlock=1` bounce**. This is exactly what breaks T10. |

**Constraints preserved (non-negotiable):**

- WebCrypto wraps/unwraps **only the DEK**, once at startup. `storage/aes-gcm.ts` (`@noble/ciphers`,
  synchronous) stays the entity path — `encryptEntity`/`decryptEntity` stay sync and all **16 call
  sites across 6 files** keep calling them without `await`.
- The DEK stays a module-level `let`, never in `localStorage`/`sessionStorage`/cookie
  (`data-key-store.ts:15`). The **wrap** is persisted; the **key** is not.
- No auto-lock on inactivity (rejected by the user, #2113).

**Password-change re-wrap seam**: `profile/routes/change-password.tsx`, strictly between the HTTP POST
(line 25) and `logout()` (line 28) — `logout()` calls `clearDek()` (`auth-store.ts:361`), so after it
there is nothing left to re-wrap. Needed **only if** Q2 resolves to "mint password wraps client-side".

## Scope

### In Scope

- New `device-dek-wrap` module: mint a non-extractable `CryptoKey`, persist it in IndexedDB, wrap and
  unwrap the DEK under it.
- DEK bootstrap at app startup and on **both** login paths (`auth-store.ts:296-317` online,
  `offline/offline-auth-service.ts:127-143` offline).
- Local DEK generation when no roster wrap exists; DEK provenance recorded; **conflict detection** when
  a later roster disagrees (fail loudly, never swap).
- Unlock gate + loaders: a device-level predicate replaces the per-user roster check as the reason to
  bounce to `/login?unlock=1`.
- **Fix of the `MissingDataKeyError` roster-absent gap** — see the decision below.
- IndexedDB test seam / dev-dependency decision (blocking, see Risks).
- The three authorized test changes, plus new tests (adding tests is always allowed).

### Out of Scope

- **CSP** — sibling change. See the decision below.
- **The re-key/re-encryption pass** (two DEKs live at once). `data-key-store.ts:15-21` has a single
  slot, and `runEntityMigration()` structurally cannot re-key: it imports only `encryptEntity`, never
  `decryptEntity`, and `if (isEncrypted(raw)) continue` (`storage/entity-migration.ts:73`) treats
  already-encrypted as done. Detection ships here; the pass is a follow-up.
- Backend changes. `StoreDataKeyProvider.cs` / `StoreKeyWrapService.cs` untouched; the roster wire
  format is unchanged.
- Auto-lock on inactivity (rejected).
- Recovery when every password for a locally-generated DEK is lost (open, non-blocking — #2113).
- Making the entity data path async.

### Decision — the `MissingDataKeyError` gap is FIXED HERE, not deferred

It is not extra work; it is the **same** code path. The bug exists precisely because DEK availability is
per-user (`unlock-gate.ts:18`) while provisioning is per-device (`roster-store.ts:160`). The device wrap
makes DEK availability per-device, so the state "provisioned, but THIS user has no wrap" stops existing
by construction. Deferring it would mean shipping the fix and then carrying an unreachable crash path in
the spec as if it were live risk. It MUST be asserted explicitly by a test, not assumed from the design.

### Decision — CSP is a SIBLING change, not this one

Recommended: a follow-up `csp-hardening` change. Reasoning:

- **Zero code overlap.** CSP lives in `deploy/nginx.conf` / `vite.config.ts` / route `headers()`. This
  change lives in `shared/lib/storage` + `shared/lib/offline`.
- **Different verification method.** CSP is verified by response headers and a browser console, not by
  `vitest`. It cannot be driven by the strict-TDD loop this change runs under.
- **Different blast radius.** A wrong CSP breaks the whole app for every user — including the static
  inline script at `root.tsx:39-44` — and needs its own `report-only` rollout phase.
- **Rollback coupling.** Bundled, one revert removes both.

They are related by threat model, not by code. The dependency is recorded in Risks: the XSS half of the
agreed key model stays **unimplemented** until that sibling ships. Independently verified: zero matches
for `Content-Security-Policy` anywhere in `frontend-react/`; the only mention is prose at
`frontend-react/docs/prd/auth.md:672` ("strict Content Security Policy headers").

## Capabilities

### New Capabilities

- `device-dek-wrap`: the device `CryptoKey` lifecycle — mint, non-extractability, IndexedDB persistence,
  DEK wrap/unwrap, DEK provenance (roster-derived vs locally generated), the once-per-device source rule,
  and conflict detection when a roster later disagrees.

### Modified Capabilities

- `entity-at-rest-encryption`: the requirement **"Encryption absence is a permanent, first-class mode —
  never an error"** (`spec.md:13-25`) MUST BE REWRITTEN. Its own scenarios ("no roster ever imported →
  plaintext", "v1-roster device → plaintext") describe **the bug being fixed**, not a guarantee. New
  shape: the permanent passthrough survives on the **read** side only (`decryptEntity`'s marker
  dispatch, `spec.md:41-62` — unchanged, still load-bearing for mixed devices); on the **write** side it
  narrows to a bounded pre-bootstrap window. The `encryptEntity` ordering requirement (`spec.md:27-40`)
  keeps DEK-first, but step 2's guard becomes device-level.
- `dek-lifecycle-and-unlock-gate`: "The DEK is memory-only and never survives a reload"
  (`spec.md:12-23`) stays **true and must stay true** — but must state explicitly that the DEK is now
  *recoverable* after reload because the **wrap** is persisted, not the key. "DEK acquisition happens on
  both login paths" (`spec.md:26-49`) gains a **third** acquisition point: startup. `needsUnlock`'s four
  combinations (`spec.md:50-76`) and both loader requirements (`spec.md:77-104`) change — unlock is
  required only when the device wrap is missing or unusable.
- `at-rest-encryption-errors`: new failure surfaces need a taxonomy entry and a user-visibility
  decision — device-wrap unwrap failure, IndexedDB unavailable/blocked/evicted, `VersionError`.
  `MissingDataKeyError` as "a programming-error guard, not a user-visible error" (`spec.md:35-41`) needs
  re-grounding now that the gate that guarantees it changed.
- `entity-migration`: "Migration runs only when provisioned and never blocks login" (`spec.md:12-23`) —
  the provisioning predicate changes, so migration now runs on devices where it never ran. The
  invocation set gains the startup path.

**Not modified**: `offline-roster-bundle`, `offline-device-provisioning` — bundle schema and the
export/import surfaces are untouched.

## Authorized Test Changes

Scoped exception granted by the user 2026-08-10 (engram `sdd/device-wrapped-dek/test-authorization`,
#2115). **These three ONLY.** Every other test stays untouchable and needs its own authorization.

| # | Test | Must assert afterwards |
|---|---|---|
| 1 | `frontend-react/e2e/login-offline.spec.ts:306-331` — T10 | The **inverse**: after `page.reload()` with a device wrap present, the user stays on `/sales/products`, no `AUTH.UNLOCK_REQUIRED` banner — **and** a subsequent entity write still yields an `enc:v1:` value, proving the recovered DEK is the SAME DEK, not merely that no prompt appeared. Keep `expectOnlyKnownTelemetry` + `expectNoLoginAttempt`: the reload stays HTTP-quiet. |
| 2 | `.../storage/__tests__/entity-crypto.test.ts:70-87` | With a device DEK set, `encryptEntity` returns `enc:v1:` **regardless of roster state** (no roster / `formatVersion: 1`). Retain a passthrough assertion, re-scoped to the only remaining legitimate case: no DEK **and** no device wrap yet (pre-bootstrap). |
| 3 | `.../stores/__tests__/auth-store.dek.test.ts:140-149` — 11.3 | No roster entry → login still resolves **and** `getDek()` is **non-null**, sourced from the device wrap, with bytes equal to the device wrap's DEK. |

The unlock path must not silently disappear with T10. Add a **NEW** E2E test: device wrap destroyed /
IndexedDB cleared → the unlock flow still works. Do not fold that into T10.

**FLAG — not authorized, surface if it breaks.** `auth-store.dek.test.ts:151-161` (11.4: a roster wrap
under an older password makes `login` reject with `DekUnwrapError`) is a deliberate hard-fail
(`auth-store.ts:299-306` is NOT in a swallowing try/catch; `at-rest-encryption-errors` `spec.md:21-33`).
If the device wrap makes that rejection unreachable or wrong, **STOP and ask** — do not touch it.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `shared/lib/storage/device-key-store.ts` (new) | New | Device `CryptoKey` mint + IndexedDB persistence + DEK wrap/unwrap |
| `shared/lib/storage/data-key-store.ts` | Modified | DEK provenance; single-slot constraint documented against the deferred re-key |
| `shared/lib/storage/entity-crypto.ts` | Modified | Step-2 guard becomes device-level (`:67-69`) |
| `shared/lib/offline/unlock-gate.ts` | Modified | `needsUnlock` gates on the device wrap, not the per-user roster entry |
| `shared/lib/stores/auth-store.ts` | Modified | Online DEK acquisition (`:296-317`) becomes device-wrap-first |
| `shared/lib/offline/offline-auth-service.ts` | Modified | Offline DEK acquisition (`:127-143`), same reconciliation |
| `auth/routes/loaders.ts` | Modified | Unlock redirect condition |
| `profile/routes/change-password.tsx` | Modified (conditional) | Re-wrap between line 25 and line 28 — only if Q2 = client-side minting |
| `shared/lib/storage/aes-gcm.ts` + 16 call sites / 6 files | **Untouched** | The sync data path is load-bearing and must not move |
| `deploy/nginx.conf`, `vite.config.ts` | **Untouched** | CSP deferred to the sibling change |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Q1 (open)**: extend `isEncryptionProvisioned()` vs. add a device-level predicate | High | **Recommend ADD a separate predicate.** `isEncryptionProvisioned()` is roster-defined (`roster-store.ts:158-161`) and read by both `entity-migration` and `encryptEntity`; overloading it makes "a roster exists" and "this device holds a DEK" the same word — the exact per-user/per-device conflation that caused the live bug. Hard blocker: `roster-store.ts:5-13` carries a **purity contract** (no top-level side effects, `import type` only, guarded by `__tests__/roster-store.purity.test.ts`) — an IndexedDB-aware predicate cannot live in that file. `sdd-design` decides; the purity constraint is non-negotiable. |
| **Q2 (open)**: is a per-user password wrap ever minted client-side, or always a roster round-trip? | High | Consequence chain — if never: a locally-generated DEK has **exactly one** wrap, so clearing site data is unrecoverable data loss, and the change-password re-wrap seam has nothing to re-wrap. If yes: the client must implement the **wrap** direction of `PBKDF2(preHash, 210_000)` (`dek-unwrap.ts:25,48-64`), a new inverse of a verified function, pinnable by the existing KAT. `sdd-design` must decide before `sdd-tasks`. |
| IndexedDB unavailable / blocked / evicted (Safari private mode, storage pressure, `VersionError`) | Med | Fallback must be **specified**, not defaulted: plaintext (a regression), unlock prompt (T10's old behavior), or hard error. `sdd-spec` owns this; it is a requirement, not an implementation detail. |
| IndexedDB does not exist in jsdom (`vitest.config.ts:17`); repo has **zero** IndexedDB usage and no `idb`/`fake-indexeddb` dependency | High | Needs `fake-indexeddb` (new dev dep) or an injectable seam. **Strict TDD is enabled**, so this blocks the FIRST work unit — it cannot be deferred to cleanup. WebCrypto itself is already proven under this same jsdom setup (`offline/offline-crypto.ts`), so only IndexedDB is untested territory. |
| Silent key swap if a roster arrives later with different DEK bytes | Med | Conflict detection ships here and MUST fail loudly. Re-key is deferred, and `data-key-store.ts:15-21`'s single slot means it cannot be improvised inside this change. |
| Test 11.4 / stale-roster-wrap interaction becomes unreachable | Med | Not authorized. Surface and ask; do not modify. |
| **Accepted consequence** (#2113): with a device wrap, encryption no longer protects against another person at the same physical computer — only against the storage being copied off | Certain | Acceptable for a shared POS. MUST be written into the spec so a future reader does not "fix" it back. |
| XSS story incomplete until CSP ships | Med | Recorded dependency on the sibling `csp-hardening` change. Zero CSP exists today (grep-verified). |

## Review Workload Forecast

Delivery is `commits-only` — no PRs. Framed as work units per `work-unit-commits`.

| # | Work unit | Est. lines |
|---|---|---|
| 1 | IndexedDB test seam + dev dependency (or injectable store) | ~40 |
| 2 | `device-key-store`: mint non-extractable `CryptoKey`, persist, wrap/unwrap DEK + tests | ~180 |
| 3 | DEK bootstrap: device-wrap-first on startup + both login paths; local generation; provenance + conflict detection + tests | ~200 |
| 4 | Unlock gate + loaders: device-level predicate, `needsUnlock` rewrite + tests (incl. authorized test 3) | ~120 |
| 5 | `encryptEntity` guard + migration invocation (incl. authorized test 2) | ~80 |
| 6 | E2E: T10 rewrite + NEW "device wrap destroyed → unlock still works" | ~90 |
| 7 | Password-change re-wrap seam — **only if Q2 = client-side minting** | ~60 |

**Estimated total: ~710-770 changed lines** (⚠️ ESTIMATE, NOT VERIFIED — `sdd-tasks` must measure, not
inherit this number). Above the 400-line review budget → **slice it**.

Recommended slices:

- **Slice A** = units 1+2 (~220). Autonomous: the device key store exists and is tested, nothing is
  wired. **Zero behavior change** — the repo makes complete sense with only this applied, and rollback
  is a clean delete.
- **Slice B** = units 3+4+5 (~400). **The behavior flip, and it is irreducible.** Unit 3 alone leaves a
  device holding a DEK that `needsUnlock` still bounces to `/login?unlock=1`; unit 5 alone breaks
  unprovisioned devices. They must land together. Flag to `sdd-tasks`: this slice sits **at** budget —
  measure it, and if Q2 adds the wrap direction, it goes over and needs a further split.
- **Slice C** = units 6 (+7 if applicable) (~90-150). E2E rewrite and the conditional re-wrap seam.

**Strict TDD is ENABLED for `sdd-apply`/`sdd-verify`.** Two implications: (a) unit 1 is a hard
prerequisite — no device-wrap test can be written red before the IndexedDB seam exists; (b) the three
authorized test edits are **red-first rewrites**, i.e. rewrite the assertion to the new expected
behavior, watch it fail, then implement. They are not "fix the test after the code changed".

## Rollback Plan

Per slice, `git revert` of that slice's commits on the change branch (commits-only — nothing is pushed
or merged, so rollback never touches shared history).

- **Slice A**: pure delete. No runtime code referenced it.
- **Slice B**: reverting restores the roster-gated path. **Data caveat**: any device that already
  bootstrapped a locally-generated DEK will hold `enc:v1:` values that the reverted code cannot decrypt
  — `decryptEntity` throws `MissingDataKeyError` on marked values with no DEK (`entity-crypto.ts:88-91`).
  A pre-slice-B revert is safe; a post-adoption revert is **data-affecting** and must be called out in
  the design.
- **Slice C**: reverting restores T10's original assertion, which will then fail against slice B — so C
  can only be reverted together with B.
- IndexedDB entries left behind by a revert are inert (nothing reads them) but must be cleared before
  re-applying, or a stale device wrap will be adopted as authoritative.

## Dependencies

- `sdd-design` MUST answer **Q1** and **Q2** before `sdd-tasks`. Q2 changes the work-unit count and the
  slice-B budget.
- New dev dependency for IndexedDB under jsdom (or an approved injectable seam) — decided in design.
- Sibling `csp-hardening` change: not blocking, but the agreed threat model is incomplete without it.
- Backend: **none**. Wire format and `StoreDataKeyProvider.cs` are untouched.

## Success Criteria

- [ ] On a device that never imported a roster, after a successful login, a business-entity write stores
      a value beginning with `enc:v1:`.
- [ ] A page reload does not redirect to `/login?unlock=1` while the device wrap is intact, and an entity
      write after that reload round-trips under the SAME DEK.
- [ ] A second user logging into the same device reads the first user's data unchanged.
- [ ] A user absent from the roster on a provisioned device never reaches an uncaught
      `MissingDataKeyError` (the gap from the Intent section, asserted by a test).
- [ ] The DEK appears in no `localStorage`/`sessionStorage`/cookie key (existing requirement, still true).
- [ ] `encryptEntity`/`decryptEntity` remain synchronous; all 16 call sites across 6 files remain
      `await`-free.
- [ ] Destroying the device wrap still yields a working unlock path (new E2E test).
- [ ] Exactly three pre-existing tests were modified — the three authorized ones. Every other existing
      test passes untouched.
