# Apply Progress — `e2e-playwright-login-s1-02`

**Mode**: Strict TDD (RED → GREEN per work unit, proof commands adapted — see "Notas de
implementación" in `tasks.md`).

**Status**: 7/7 work units complete (WU-A through WU-G). All Fase 0-5 tasks in `tasks.md` marked
`[x]`. The 5 unchecked items are the user's own live-run hand-off checklist (backend required —
not executed by this agent, per project rule D2). WU-G is a targeted apply re-entry that fixes
CRITICAL-1 from `verify-report.md` (see below) — it does not add new tasks.

## Work Units Delivered

| WU | Commit | Files | RED proof | GREEN proof |
|----|--------|-------|-----------|--------------|
| A | `5a14bc8` test(e2e): add login page object, login network observer, and UI seed helper | `support/login-page.ts`, `support/login-network-observer.ts`, `support/store-seed.ts` | Draft `session.ts` importing the 3 modules → `tsc` TS2307 x3 | `tsc` exit 0 |
| B | `5c972c1` test(e2e): add session.ts persona-minting engine for signedInPage | `support/session.ts` | (continuation of A's RED) | `tsc` exit 0 |
| C | `424100b` test(e2e): wire signedInPage and loginNetwork fixtures into test.ts | `support/test.ts` (additive only) | Draft `login.spec.ts` using `persona`/`signedInPage` → TS2353/TS2339 | `tsc` exit 0 + `playwright test e2e/register.spec.ts --list` unchanged (8 tests) |
| D | `f9ad4f1` test(e2e): add login.spec.ts covering A1-A7 and D1-D6 | `login.spec.ts`, `support/session.ts` (extended — see deviation below) | (continuation of C's RED) | `tsc` exit 0 + `playwright test e2e/login.spec.ts --list` → 8 tests |
| E | `ceb7226` test(e2e): isolate the login rate-limit assertion behind its own spec | `login-rate-limit.spec.ts` | N/A (new file, no prior consumer) | `tsc` exit 0 + `playwright test e2e/login-rate-limit.spec.ts --list` → 1 test |
| F | `9366558` docs(e2e): document signedInPage, the login quota budget, and coverage | `e2e/README.md` | N/A (docs) | Read-through: quota-margin warning is a blockquote, not buried |
| tracking | `e53dc5f` docs(sdd): record planning artifacts and apply progress | `tasks.md` + proposal/design/specs (were untracked) | — | — |
| G | (this pass) fix(e2e): mint each login persona independently, not as one eager chain | `support/session.ts` only | N/A — verify-driven fix, not TDD-drafted (deterministic control-flow bug, not a missing-behavior gap) | `tsc` exit 0 + both `--list` gates unchanged (20/4, 2/2) + `register.spec.ts --list` unchanged (8/8) |

## WU-G — Fix for CRITICAL-1 (`verify-report.md`)

**Finding**: `createPersonaCache()`'s `ensureMinted()` (old `session.ts:319-363`) minted the
**entire 4-persona chain** on the first `resolve()` call for ANY persona, using whatever
`primedOwnerAdmin`/`primedStoreUser` happened to be set at that instant. `login.spec.ts`'s REQ-11
test restores `owner-admin` (already primed by S1) at line 189 — BEFORE it primes `store-user` at
line 210 — so that restore triggered the chain's unprimed `store-user` fallback: an invisible
StoreUser creation + live login + product seed, on top of REQ-11's own separate, real StoreUser
creation. Two consequences: (1) `primeStoreUser()` at line 210 then threw, because `prime()`'s
guard forbids priming after minting starts, aborting the rest of the `describe.serial` block
(REQ-9, REQ-7, REQ-12+REQ-14 never run); (2) the fallback's product seeding ran before REQ-11's own
"sin productos" StoreUser logged in, invalidating that half of D3's premise.

**Fix chosen**: made persona minting genuinely lazy **per persona**, not reordering
`login.spec.ts`'s statements. `session.ts` now memoizes FOUR independent promises
(`ownerAdminPromise`, `storeUserPromise`, `ownerAdminWithProductsPromise`,
`storeUserWithProductsPromise`), each built from a `get*()` accessor that pulls its own
dependencies (also memoized) on demand:

- `mintOwnerAdmin(browser, primed)` — resolves the primed snapshot with zero cost, or falls back to
  a real register+login on a fresh ephemeral context.
- `mintStoreUser(browser, primed, getOwnerAdmin)` — resolves the primed snapshot (after asserting
  the R5 shared-storeId invariant against `getOwnerAdmin()`), or falls back to creating+logging in
  a StoreUser from a *fresh* context restoring the owner's own (already-minted) session.
- `mintOwnerAdminWithProducts(browser, getOwnerAdmin)` — seeds products via the UI on a fresh
  ephemeral context derived from `getOwnerAdmin()`. Zero extra logins.
- `mintStoreUserWithProducts(getStoreUser, getOwnerAdminWithProducts)` — merges the two, zero extra
  logins.

`createPersonaCache()`'s `prime()` guard now checks only the SLOT being primed
(`ownerAdminPromise`/`storeUserPromise` independently), not one shared `mintingPromise` — priming
`store-user` after `owner-admin` has already resolved is fine; priming `store-user` after
`store-user` itself (or something derived from it) has started resolving still throws, same
guarantee as before, scoped correctly this time.

**Why this over reordering `login.spec.ts`**: reordering REQ-11's statements (prime `store-user`
before restoring `owner-admin`) would have "fixed" this one call site but left the same trap armed
for the next scenario that resolves a persona whose sibling isn't primed yet — the bug is in the
minting engine's coupling between personas, not in one test's statement order. Ten scenarios
compose off `signedInPage`/`personaCache`; a per-engine fix protects all of them, a per-call-site
fix protects only the one that happened to be caught.

**Login budget re-verified against the fixed code, by tracing `login.spec.ts`'s actual execution
order** (not re-asserting the old claim):
1. S1 test (`login.spec.ts:97`) — 1 real login (register+login), then `primeOwnerAdmin()`.
   `ownerAdminPromise` is still `null` at this point (nothing has called `resolve()` yet) — guard
   passes.
2. REQ-3 (`:156`) — 1 real login (bad password). No persona calls.
3. REQ-11 (`:183`) — `restoreSignedInSession('owner-admin')` at `:189` calls `getOwnerAdmin()` for
   the FIRST time; `primedOwnerAdmin` is set (step 1), so `mintOwnerAdmin` returns it with **zero**
   network cost — no fallback StoreUser, no product seed. REQ-11 then does its OWN real StoreUser
   creation (zero-cost `POST /v1/storeusers`) + 1 real login (`:202-205`) BEFORE the "sin productos"
   assertion at `:206` — the product-seeding step has not run yet at this point (it only runs
   inside `mintOwnerAdminWithProducts`, not yet called), so the premise holds by construction.
   `primeStoreUser()` at `:210` — `storeUserPromise` is still `null` (nothing has called
   `getStoreUser()` yet) — guard passes. `restoreSignedInSession('store-user-with-products')` at
   `:216` triggers `getStoreUser()` (primed, zero cost, R5 check passes) and
   `getOwnerAdminWithProducts()` (first call — seeds products on a fresh ephemeral context off the
   already-minted owner snapshot, zero login) — merge, zero cost. **Total this test: 1 real login.**
4. REQ-9 (`:222`) — `restoreSignedInSession('owner-admin-with-products')` reuses the promise memoized
   in step 3 — zero cost. Then a real logout+re-login — 1 real login.
5. REQ-7 (`:246`) — `restoreSignedInSession('owner-admin')` reuses step 3's memoized promise — zero
   cost, zero logins.
6. REQ-12+REQ-14 (`:256`) — restores `owner-admin`, `store-user-with-products`, `store-user` — all
   already memoized by steps 3-4 — zero cost, zero logins.

**Real login count for the default run: exactly 4** (S1 + REQ-3 + REQ-11 + REQ-9), matching
design.md §2's budget with no regression. Traced by reading the fixed control flow, not by running
it (this agent still cannot run the backend).

**R2/H-8 stop-and-ask gate**: untouched — `createStoreUserViaUi()` itself was not modified; both
call sites that use it (`mintStoreUser`'s unprimed fallback and `login.spec.ts:192`'s REQ-11 body)
still route through the same function with the same `/login`-bounce check.

**Verification run this pass**:
- `pnpm exec tsc --noEmit --strict --lib ES2022,DOM --types node --typeRoots
  ./apps/web-store-pos/node_modules/@types --moduleResolution bundler --module ES2022 --target
  ES2022 --skipLibCheck e2e/*.ts e2e/support/*.ts playwright.config.ts playwright.api.config.ts` →
  **exit 0**.
- `pnpm exec playwright test --grep-invert @rate-limit --list` → **20 tests in 4 files**, unchanged.
- `pnpm exec playwright test --grep @rate-limit --list` → **2 tests in 2 files**, unchanged.
- `pnpm exec playwright test e2e/register.spec.ts --list` → **8/8**, unchanged (blast-radius gate).
- `login.spec.ts --list` still shows all 8 tests, same names/line numbers — `session.ts`'s internal
  minting engine changed, `login.spec.ts` itself was NOT touched by this fix.

**Still UNPROVEN, unchanged from before**: whether the fixed control flow actually behaves this way
against a live backend (this agent never runs `dotnet`) — that remains the user's own
`pnpm test:e2e` run, same posture as the sibling `e2e-playwright-register-s1-01`.

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| 0.0-0.4 (WU-A) | Draft `session.ts` fails to resolve 3 modules (`tsc` TS2307 ×3) | `tsc` clean after `login-page.ts`/`login-network-observer.ts`/`store-seed.ts` written | N/A — first pass matched design |
| 1.1-1.6 (WU-B) | Continuation of 0.0's RED (same draft) | `tsc` clean for `session.ts` | Restructured after WU-D's live-login-budget discovery — see deviation below |
| 2.1-2.3 (WU-C) | Draft `login.spec.ts` fails on `persona`/`signedInPage` (TS2353/TS2339) | `tsc` clean; `register.spec.ts --list` unchanged (8/8) | Fixed a real TS2322 (worker-scoped fixture mixed into the test-fixtures generic) — split `SessionWorkerFixtures` into `test.extend`'s 2nd generic |
| 3.1-3.15 (WU-D) | Continuation of 2.1's RED | `tsc` clean; `login.spec.ts --list` → 8 tests (see deviation) | `session.ts` gained `primeOwnerAdmin`/`primeStoreUser` mid-implementation once the login-budget conflict with "13 separate tests" was discovered |
| 4.1-4.2 (WU-E) | N/A (isolated new file — nothing to break) | `tsc` clean; `login-rate-limit.spec.ts --list` → 1 test | None |
| 5.1-5.2 (WU-F) | N/A (docs) | Read-through pass | None |

## Deviations From tasks.md (documented, not silent)

Both are also recorded verbatim in `tasks.md` under "Notas de implementación".

1. **Proof command**: `pnpm typecheck` does NOT type-check `frontend-react/e2e/` — verified by
   injecting a broken-import probe file into `e2e/support/` and observing `pnpm typecheck` stay
   green (turbo cache hit, not even re-evaluated; no workspace package's `tsconfig.json` includes
   `e2e/`). Used the command the sibling change `e2e-playwright-register-s1-01` actually verified
   with (`verify-report.md:30`): `pnpm exec tsc --noEmit --strict --lib ES2022,DOM --types node
   --typeRoots ./apps/web-store-pos/node_modules/@types --moduleResolution bundler --module
   ES2022 --target ES2022 --skipLibCheck e2e/*.ts e2e/support/*.ts playwright.config.ts
   playwright.api.config.ts` for every RED/GREEN cycle in this change.

2. **8 tests, not 13, in `login.spec.ts`**: the login rate-limit budget (design.md §2 — exactly 4
   real logins/run against a 5/minute ceiling) makes 13 independently-live-tested REQs
   arithmetically impossible: A1/A2 must observe the SAME live form submission (a restored session
   never calls `POST /v1/auth/login`), and design.md's own budget table assigns that same login as
   the subject of A1/A2/A6/D2/D5 too. REQ-11 (D3)'s "sin productos" half needs its own live
   StoreUser login for the same reason. Tests were grouped by shared observable network event
   (mirroring `register.spec.ts`'s own REQ-8/REQ-6 shared-identity precedent), and split into
   independent tests wherever `signedInPage`/`restoreSignedInSession` made that free (REQ-7,
   REQ-9, REQ-12+REQ-14 combined). `PersonaCache` grew `primeOwnerAdmin()`/`primeStoreUser()` —
   not in the original Fase 1 design — so a test's own already-observed live login feeds the
   cache instead of the chain paying for a second, invisible one.
   **Verified real budget**: 4 total logins (1 owner-admin, shared by A1/A2/A6/D2/D5/A7[partial via
   cache reuse]/D4[partial]/D6[partial]; 1 store-user, shared by REQ-11's "sin productos" half; 1
   REQ-3; 1 REQ-9/D1) — matches design.md §2 exactly, no budget regression.

## Structural (Static) Verification — Everything This Agent Could Prove Without a Backend

All PROVED, re-run fresh at the end of the session (not taken on faith from earlier in-progress
runs):

- `pnpm exec tsc --noEmit --strict ... e2e/*.ts e2e/support/*.ts playwright.config.ts
  playwright.api.config.ts` → **exit 0**, zero errors, across all 3 new spec files + all 4 new
  support files + `test.ts`'s additive edit.
- `pnpm exec playwright test --grep-invert @rate-limit --list` → **20 tests in 4 files**
  (`api-health.spec.ts` ×2, `login.spec.ts` ×8, `register.spec.ts` ×8, `smoke.spec.ts` ×2) — no
  fixture/import errors.
- `pnpm exec playwright test --grep @rate-limit --list` → **2 tests in 2 files**
  (`login-rate-limit.spec.ts` ×1, `register-rate-limit.spec.ts` ×1).
- `pnpm exec playwright test e2e/register.spec.ts --list` → **unchanged, 8/8**, same test names,
  same line numbers as before this change (blast-radius gate, design.md §9).
- `pnpm typecheck` (turbo, all workspace packages) → unaffected, 5/5 cached/successful (sanity
  check only — does not cover `e2e/`, see deviation #1).

## UNPROVEN — Requires The User's Own Live Backend Run (D2, this agent never runs `dotnet`)

- Every runtime assertion in `login.spec.ts` (REQ-1..REQ-7, REQ-9..REQ-14): overlay-only
  rendering, causal login→me network order, the literal backend error text on a bad password,
  `AUTH_MODEL` persistence, the guest-guard redirect, the StoreUser creation via
  `adminFeatureLoader` (**including whether Gate R2/H-8 fires at all** — genuinely unknown until
  run), the real re-login after `logout()`, and the `/admin/owners` negative/D6 cross-checks.
- `login-rate-limit.spec.ts`'s REQ-8: whether the backend actually answers 429 after 5 attempts,
  whether CORS on that 429 is configured correctly (R8), and whether a failed login truly consumes
  a permit (R7) — the design assumes yes (middleware-level limiter) but this is unverified live.
- The two-runs-within-one-minute quota-margin claim (R1): plausible from the code (5/min ceiling,
  4 logins/run) but never observed to actually go red.
- `store-seed.ts`'s selectors resolving correctly against the real rendered app (each selector was
  read from the current source of `products.tsx`/`edit-product-category-modal.tsx`/
  `category-actions-menu.tsx`/`create-product-modal.tsx`, but never clicked against a live
  browser).

## Files Changed (final state, this branch vs `main`)

```
frontend-react/e2e/README.md                                    | 83 +++++-
frontend-react/e2e/login-rate-limit.spec.ts                     | 72 ++++ (new)
frontend-react/e2e/login.spec.ts                                | 282 ++++ (new)
frontend-react/e2e/support/login-network-observer.ts             | 335 ++++ (new)
frontend-react/e2e/support/login-page.ts                        | 45 ++++ (new)
frontend-react/e2e/support/session.ts                            | 410 ++++ (new)
frontend-react/e2e/support/store-seed.ts                         | 47 ++++ (new)
frontend-react/e2e/support/test.ts                                | 77 ++--- (additive edit)
openspec/changes/e2e-playwright-login-s1-02/*                    | (planning artifacts, were untracked; now committed)
```

**Untouched, verified**: `register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts`,
`api-health.spec.ts`, `support/network-observer.ts`, `support/register-page.ts`,
`support/identity.ts`, `support/backend-url.ts`, `playwright.config.ts`, `package.json`, every
`vitest` file in the repo.

## Next Recommended

`sdd-verify` (re-run) — WU-G fixes CRITICAL-1 from the prior `verify-report.md`. Verify should
independently re-trace `session.ts`'s new per-persona memoization against `login.spec.ts`'s actual
call order (same method this fix used — static control-flow reading, deterministic, no backend
needed), re-run the `tsc` command and both `--list` gates, and re-confirm the 4-login budget claim
above before re-affirming the two UNPROVEN categories (live backend run, live rate-limit run) as
still-declared gaps pending the user's own `pnpm test:e2e` / `pnpm test:e2e:rate-limit` execution —
same pattern the archived `e2e-playwright-register-s1-01` verify report used for its own REQ-9.
