## Verification Report

**Change**: e2e-playwright-login-s1-02
**Version**: N/A (openspec delta, no versioned spec history)
**Mode**: Standard (no "STRICT TDD MODE IS ACTIVE" forwarded in this launch prompt; global env-level strict-TDD flag noted but not authoritative per sdd-phase-common decision gate — not applied as a verify-blocking requirement, though apply's own RED/GREEN evidence was checked)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total (Fase 0-5, excluding user hand-off checklist) | 17 |
| Tasks marked `[x]` | 17 |
| Commits (WU-A..WU-F + tracking) | `5a14bc8`, `5c972c1`, `424100b`, `f9ad4f1`, `ceb7226`, `9366558`, `e53dc5f`, `a5be5c3` — all on `feat/e2e-playwright-login-s1-02`, confirmed via `git log --oneline main..HEAD` |
| Working tree | clean, nothing uncommitted |

### Build & Static Verification — re-run independently by this pass, not taken on faith

**TypeScript strict check** (the actual proof command apply substituted for `pnpm typecheck` — verified in `tasks.md`'s own documented deviation #1 that `pnpm typecheck` does not cover `e2e/`):
```
pnpm exec tsc --noEmit --strict --lib ES2022,DOM --types node \
  --typeRoots ./apps/web-store-pos/node_modules/@types --moduleResolution bundler \
  --module ES2022 --target ES2022 --skipLibCheck \
  e2e/*.ts e2e/support/*.ts playwright.config.ts playwright.api.config.ts
```
→ **exit 0**, zero errors.

**Playwright static enumeration**:
- `pnpm exec playwright test --grep-invert @rate-limit --list` → **20 tests in 4 files** (`api-health.spec.ts` ×2, `login.spec.ts` ×8, `register.spec.ts` ×8, `smoke.spec.ts` ×2). Matches apply-progress's claim exactly.
- `pnpm exec playwright test --grep @rate-limit --list` → **2 tests in 2 files** (`login-rate-limit.spec.ts` ×1, `register-rate-limit.spec.ts` ×1). Matches.
- `pnpm exec playwright test e2e/register.spec.ts --list` → **8/8, unchanged**, same test names/line numbers as pre-change (blast-radius gate, design.md §9).

**Playwright live run** — NOT executed by this verify pass (project rule: this agent never runs `dotnet`, never starts the backend). This is a declared gap, same posture as the archived sibling `e2e-playwright-register-s1-01`.

### 1. Blast radius / the untouchable-E2E rule — PROVEN, PASS

`git diff --stat main...HEAD` (14 files, +2613/-11): only `frontend-react/e2e/README.md`, `login-rate-limit.spec.ts` (new), `login.spec.ts` (new), `support/login-network-observer.ts` (new), `support/login-page.ts` (new), `support/session.ts` (new), `support/store-seed.ts` (new), `support/test.ts` (edited), plus openspec planning artifacts.

`register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts`, `api-health.spec.ts`, `support/network-observer.ts`, `support/register-page.ts`, `support/identity.ts`, `support/backend-url.ts`, `playwright.config.ts`, `package.json`, and every `*.test.ts`/`*.test.tsx` file **do not appear in the diffstat at all** — confirmed with a second, independent `git diff --stat` scoped to `**/*.test.ts*` returning empty.

`support/test.ts` diff read in full: the entire `registerNetwork` fixture block (`auto: true`, body, position) is byte-identical to `main`; every change is a pure addition — new imports, a new `SessionFixtures`/`SessionWorkerFixtures`/`LoginFixtures` interface set, and three new fixture entries (`loginNetwork`, `persona`, `personaCache`, `signedInPage`) appended after the untouched `registerNetwork` entry. `RegisterFixtures` interface itself is untouched; it is combined via `&`, not rewritten.

`register.spec.ts --list` independently re-run by this pass: still 8/8, same names/line numbers.

**Verdict: no violation of the non-negotiable rule.**

### 2. Assertion coverage, one by one — PROVEN (code-mapped), 13/13 REQs traced

login.spec.ts collapses 13 numbered REQs into 8 `test()` functions (documented deviation #2, same rationale as `register.spec.ts`'s own REQ-8/REQ-6 sharing). Every REQ still has a citable assertion:

| REQ | Assertion | Evidence |
|---|---|---|
| REQ-1 (A1) | Two network-anchored samples, formless (`#email` count 0) + overlay `.first()` visible, bracketing both call gaps | `login.spec.ts:114-124` |
| REQ-2 (A2) | `loginNetwork.expectLoginThenMe()` — causal order, not just "both happened" | `login.spec.ts:132`, mechanism at `login-network-observer.ts:278-310` |
| REQ-3 (A3) | 200 + parsed `errors[0].description` literal interpolation + negative control against the 401 string | `login.spec.ts:165-180` |
| REQ-4 (A4) | Field-required texts visible + `expectNoLoginAttempt()` | `login.spec.ts:49-60` |
| REQ-5 (A5) | Ordered offline flow + offline banner + `expectNoLoginAttempt()` | `login.spec.ts:62-78` |
| REQ-6 (A6) | Suffix-scanned `AUTH_MODEL`, `authToken` non-empty string, `expiresIn` future number | `login.spec.ts:30-43,134-140` |
| REQ-7 (A7) | `signedInPage`-equivalent restore → `/login` → lands on own home, not `/` | `login.spec.ts:246-254` |
| REQ-8 (A8) | Separate spec file/tag, 5/min thresholds | `login-rate-limit.spec.ts` (§3 below) |
| REQ-9 (D1) | Restore with-products → logout → real re-login → `/sales/new` | `login.spec.ts:222-244` |
| REQ-10 (D2) | Shares the S1 test's landing assertion | `login.spec.ts:127` |
| REQ-11 (D3) | "sin productos" live StoreUser login → `/sales/products`; "con productos" restore+rebound → `/sales/new` | `login.spec.ts:183-220` — **see CRITICAL-1 below: this test's own sequencing breaks its premise** |
| REQ-12 (D4) | Negative assertions against every URL observed in S1/D1/D3, plus a dedicated pass in the last test | `login.spec.ts:147,206,219,242,266,274,279` |
| REQ-13 (D5) | `loginNetwork.expectNoProductApiCall()` over S1 and D1 | `login.spec.ts:144,243` |
| REQ-14 (D6) | Guard-rebound destination compared for equality against the earlier explicit-login destination, both persona pairs | `login.spec.ts:260-273` |
| REQ-15 | No test writes localStorage of products/categories by hand — only `store-seed.ts` (UI-driven) creates them; `session.ts`'s `page.evaluate()` writes are auth/session snapshot replay only, not hand-built product/category cable | `store-seed.ts`, `session.ts:123-130` |
| REQ-16 | Every seeding step wrapped/re-thrown with a `[persona:...]` tag distinguishing it from a login failure | `store-seed.ts:19-30` |

**No assertion was quietly dropped.** The consolidation is honest — every one of the 13 REQ numbers is traceable to a specific `expect`/thrown-error inside one of the 8 tests.

### 3. The three known traps — PROVEN, all three handled

- **`getByRole('status')` without `.first()`**: `login-page.ts:30` — `this.loadingOverlay = page.getByRole('status').first()`, with a comment citing `login.tsx:185-186` + `root.tsx:102` (both render `role="status"` simultaneously). Handled.
- **`AUTH_MODEL` suffix, never hardcoded**: `login.spec.ts:30-43` scans `localStorage` for a key ending in `-authf496fc5a9f17`; no full key is ever hardcoded. Handled.
- **Login rate-limit constants (5/min, not register's 10/10min)**: `login-network-observer.ts` doc comment + `LoginRateLimitError` message explicitly say "5 attempts per 1-minute sliding window, 3 segments (RateLimitPolicies.cs:15-24)". `login-rate-limit.spec.ts:12` — `MAX_ATTEMPTS = 7` (not 11), `test.setTimeout(60_000)` (not 120_000), banner text sourced from `es.ts:83` (`'Demasiados intentos. Esperá un momento antes de volver a intentar.'`, independently grepped and confirmed byte-identical). Handled.

### 4. The login quota budget — **CRITICAL: violated by a real sequencing bug, not merely a count mismatch**

Design.md §2 and apply-progress both claim exactly 4 real logins for the default run: 1 owner-admin (live-observed), 1 store-user (live-observed), 1 REQ-3 (bad password), 1 REQ-9/D1 (real re-login). Reading `session.ts` and `login.spec.ts` end-to-end as they will actually execute (this is deterministic control-flow, not a live-backend timing race — it reproduces identically on every run):

`createPersonaCache()` (`session.ts:319-363`) keeps a single closure-scoped `mintingPromise`. `ensureMinted()` (`:324-327`) does `mintingPromise ??= mintPersonaChain(browser, primedOwnerAdmin, primedStoreUser)` on the **first** `resolve()` call for **any** persona — it does not mint personas lazily/individually; it mints the entire 4-persona chain in one shot, using whatever `primedOwnerAdmin`/`primedStoreUser` are set **at that instant**. `prime()` (`:329-348`) throws if `mintingPromise` is already set — i.e. `primeStoreUser()` must be called strictly **before** the first `resolve()` of anything.

`login.spec.ts`'s REQ-11 test (`:183-220`, the "D3" test) does not respect that ordering:

```
183  test('REQ-11: ...', async ({ page, personaCache }) => {
189    await restoreSignedInSession(page, personaCache, 'owner-admin');   // ← triggers resolve('owner-admin')
191    const storeUserIdentity = newTestIdentity();
192    await createStoreUserViaUi(page, storeUserIdentity);               // test's OWN StoreUser, live login follows
...
210    await personaCache.primeStoreUser(page, storeUserIdentity);        // ← called AFTER minting already started
```

Line 189's `restoreSignedInSession('owner-admin')` calls `cache.resolve('owner-admin')`, which calls `ensureMinted()`. At this point `primedOwnerAdmin` is set (test 1 primed it, `login.spec.ts:152`) but `primedStoreUser` is still `null` — no test has primed it yet, because the only place that ever would (line 210, this same test) hasn't run. `ensureMinted()` therefore runs the **entire** `mintPersonaChain()` now, including its store-user **fallback** branch (`session.ts:236-260`): a real registration-free StoreUser creation + a real `POST /v1/auth/login` on a throwaway browser context invisible to the test. That fallback branch also runs the category/product seeding step (`session.ts:280-284`) as part of completing the same chain, **before** `resolve()` returns.

Two independent consequences, both provable by reading the code, not by running it:

1. **The login budget is blown before line 210 is even reached.** By this point the run has spent: 1 (test 1, owner-admin) + 1 (test 2, REQ-3 bad password) + 1 (this chain's own store-user fallback, triggered invisibly by line 189) = 3, and line 192-204 in the same test performs a **second, separate** StoreUser creation + live login (a 4th, different identity) to get its own "live-observed" submission — 4 logins consumed inside a single test, on top of the 2 already spent by tests 1-2. That is at least 4 by the middle of test 3 of 8, with tests 4-6 (REQ-9/D1, REQ-7, REQ-12/14) still to come — each of which also calls `resolve()`/`restoreSignedInSession()`, though those calls are free once the chain is minted (no further logins), so the hard violation is specifically "chain fallback + REQ-11's own duplicate StoreUser" landing on top of the two already spent by tests 1-2.
2. **`personaCache.primeStoreUser(...)` at line 210 will throw**, because `mintingPromise` was already set at line 189 (before line 210 runs). The thrown error aborts the REQ-11 test. Because the containing block is `test.describe.serial(...)` (`login.spec.ts:90`), Playwright skips every remaining test in that serial block — **REQ-9/D1, REQ-7, and REQ-12+REQ-14 never execute at all**, per the sibling design.md's own documented R3 risk ("si un test del bloque falla, el resto se saltea").
3. **REQ-11's own "sin productos" premise is also invalidated**: because the chain's fallback branch seeds a category+product (`session.ts:280-284`) as part of finishing the mint that line 189 triggers, the store already **has** products by the time REQ-11's own second StoreUser (line 192-204) logs in — so `page.waitForURL(/\/sales\/products$/)` (`login.spec.ts:205`) would very likely time out/fail, since `resolveUserHomePath` would now route to `/sales/new` instead. The "sin productos" half of D3 is not actually testing what it claims to test.

This is not the same finding as "the 8-vs-13 test consolidation" (which is a documented, defensible deviation) — it is a genuine implementation defect in the interaction between `PersonaCache`'s lazy full-chain minting and `login.spec.ts`'s call order. It was introduced by the very mechanism (`primeOwnerAdmin`/`primeStoreUser`) that apply-progress describes as "not in the original Fase 1 design," added mid-implementation to solve the budget problem — and it does not actually close the loop it was built to close.

**CRITICAL — this blocks archive.** The budget claim in design.md/apply-progress ("verified real budget: 4 total logins... matches design.md §2 exactly, no budget regression") is not supported by the code as written; a live run would either throw at `login.spec.ts:210` or, if `prime()`'s guard were removed, silently exceed 4 logins and desync REQ-11's premise. Either way REQ-9, REQ-7, REQ-12, and REQ-14 are at serious risk of never running in the same execution that reaches REQ-11.

### 5. The R2/H-8 stop-and-ask gate — PROVEN, PASS

`createStoreUserViaUi()` (`session.ts:149-171`) asserts, after `goto('/management/users/create')`, that the URL is not `/login` before proceeding, and throws the exact stop-and-ask message from tasks.md/design.md §3 verbatim if it is. This function is the single call site used both by the chain's own fallback (`session.ts:241`) and by `login.spec.ts`'s own REQ-11 body (`login.spec.ts:192`) — the gate is not bypassed by either path. Handled correctly, independent of the CRITICAL-1 bug above.

### 6. Test quality — order assertion is genuine, not vacuous

`expectLoginThenMe()` (`login-network-observer.ts:278-310`) does not merely check "both requests happened." It records real `Date.now()` timestamps at the moment each browser event fires, and — notably — the login **response** timestamp is recorded only after `response.text()` resolves asynchronously (mirroring the register sibling's own body-capture-before-navigation pattern), which if anything makes the causal check stricter, not weaker. It then asserts `firstMeRequest.at >= loginResponse.at`, citing `auth-store.ts:197,230` for why `/me` cannot legitimately start before the login response is handled. This proves order, not mere co-occurrence. A1's two-sample approach is honestly self-declared as a **sample**, not continuous proof (design.md §7, R4) — an accurate, non-overclaiming description of its own limitation.

### Correctness (Static Evidence)
| Item | Status |
|---|---|
| Blast radius (§1) | ✅ Proven clean |
| Trap #1 (`.first()`) | ✅ Proven present |
| Trap #2 (login-specific rate-limit constants, not duplicated from register) | ✅ Proven present |
| Trap #3 (`AUTH_MODEL` suffix scan) | ✅ Proven present |
| REQ-15/REQ-16 (UI-only seeding, distinguishable failure) | ✅ Proven present |
| R2/H-8 stop-and-ask gate | ✅ Proven present |
| Login quota budget (design.md §2's "exactly 4") | ❌ **CRITICAL — not actually achieved by the code; deterministic sequencing bug** |
| Order assertion quality (A2) | ✅ Proven non-vacuous |

### Coherence (Design)
| Decision | Followed? |
|---|---|
| `signedInPage.page === page` invariant | ✅ Held by construction + defensively asserted (`session.ts:405-407`) |
| `test.ts` strictly additive, `registerNetwork` untouched | ✅ Confirmed by full diff read |
| `login-network-observer.ts` as its own file, not an injection into `network-observer.ts` | ✅ Confirmed, zero diff on `network-observer.ts` |
| §2 login-budget architecture (mint once, restore for free) | ❌ **Architecturally correct in isolation, but `login.spec.ts`'s own call order defeats the `primeStoreUser` half of it — see CRITICAL-1** |
| §9 blast-radius mechanical rule | ✅ Followed |

### Issues Found

**CRITICAL**:
- **CRITICAL-1 — Login-quota budget architecture is defeated by `login.spec.ts`'s own call order (REQ-11/D3).** `restoreSignedInSession(page, personaCache, 'owner-admin')` at `login.spec.ts:189` triggers the full persona-chain mint (including an invisible fallback StoreUser creation + live login + product seeding) before `personaCache.primeStoreUser(...)` at `login.spec.ts:210` can run, which will throw given the current `prime()` guard (`session.ts:334-339`). Even setting the throw aside, the fallback's product seeding runs before REQ-11's own "sin productos" StoreUser logs in, invalidating that half of D3's premise. Net effect: the "exactly 4 logins" claim in design.md §2 and apply-progress is not achieved by the code as written, and `describe.serial` means REQ-9/D1, REQ-7, and REQ-12+REQ-14 are at risk of never executing in the same run that reaches REQ-11. This is provable by static control-flow reading alone (deterministic, not a live-backend timing race) — confirmed by reading `session.ts:319-363` (`createPersonaCache`/`ensureMinted`/`prime`) against `login.spec.ts:183-220` (REQ-11's actual statement order).

**WARNING**: None beyond CRITICAL-1's downstream effects (already captured above).

**SUGGESTION**:
- **S1 — README's "3 filas permanentes" data-footprint claim** (`e2e/README.md`, the "Advertencia de datos" section) undercounts what a real run touching CRITICAL-1 would leave: the chain's invisible fallback StoreUser plus REQ-11's own separate StoreUser would be 2 `User` rows, not 1, before the run aborts. Cosmetic relative to CRITICAL-1, but should be corrected together with the fix.

### PROVEN vs UNPROVEN-PENDING-BACKEND

**PROVEN in this pass** (re-run independently, not taken on faith from apply-progress):
- Blast radius: `git diff --stat`, full `test.ts` diff read, zero diff on all 8 named untouched files and all vitest files, `register.spec.ts --list` unchanged (8/8).
- `tsc --noEmit --strict` over all e2e sources → exit 0.
- `playwright test --grep-invert @rate-limit --list` → 20/4 files. `--grep @rate-limit --list` → 2/2 files.
- All 16 spec requirements (14 from `e2e-login-ui` + assertion-count check) mapped to specific `file:line` evidence.
- The three verified traps present in code.
- R2/H-8 stop-and-ask gate present and not bypassed by either call site.
- The A2 order assertion is genuinely causal, not vacuous.
- `store-seed.ts`'s 7 `data-testid` selectors and the two navbar accessible names (`Menú de usuario`, `Salir`) all exist in current production source, grepped directly.
- All hardcoded Spanish literal strings (`AUTH.EMAIL_REQUIRED`, `AUTH.PASSWORD_REQUIRED`, `AUTH.TOO_MANY_ATTEMPTS`, `AUTH.INVALID_ERROR`, `AUTH.OFFLINE_LOGIN`) byte-match `es.ts`.
- **CRITICAL-1**: the login-budget-defeating sequencing bug — proven by static control-flow reading of `session.ts` + `login.spec.ts`, independent of backend behavior (deterministic JS/TS ordering, no network timing involved in the bug itself).

**UNPROVEN — requires the user's own live backend run** (this agent never runs `dotnet`, per project rule and environment constraint):
- Whether `login.spec.ts` actually crashes at `primeStoreUser()` as predicted, or whether some runtime nuance not visible from static reading changes the outcome — **the user's first live run of `pnpm test:e2e` will either confirm CRITICAL-1 immediately (test 3/8 throws, tests 4-8 report "skipped") or surface something this static analysis missed.**
- REQ-8's live 429 (`login-rate-limit.spec.ts`), including whether CORS on the 429 response is configured correctly (R8) and whether a failed login truly consumes a permit (R7).
- The two-runs-within-one-minute quota-margin claim (R1) — moot until CRITICAL-1 is resolved, since the true login count per run is not what design.md claims.
- `store-seed.ts`'s selectors resolving correctly against a live rendered app (grepped in source, never clicked in a browser).

### Verdict
**BLOCKED.**

CRITICAL-1 is a genuine implementation defect discovered by reading `session.ts` and `login.spec.ts` together, not a documentation gap or a count-off-by-one. It is deterministic (no live backend needed to establish that the bug exists — only to confirm exactly how it manifests) and it threatens the majority of the file's assertion surface (REQ-9/D1, REQ-7, REQ-12, REQ-14 — 4 of 13 REQs, covering D1, half of D4, half of D6, and A7 — are at risk of never running in the same execution that reaches REQ-11's failure point). This must return to `sdd-apply` for a fix to the call order in `login.spec.ts`'s REQ-11 test (prime `store-user` via a live login BEFORE any `resolve()`/`restoreSignedInSession()` call in that test, exactly as design.md's own budget table intends) before this change can be re-verified and archived.

Everything else examined (blast radius, the three traps, REQ-15/16, R2/H-8 gate, order-assertion quality) is genuinely proven and clean.

---

## Second pass — re-verification after fix `c4bbb87`

**Fix under review**: `c4bbb87` — "fix(e2e): mint each login persona independently, not as one eager chain". Reworked `frontend-react/e2e/support/session.ts` only. `login.spec.ts` was NOT touched (confirmed: zero diff, `git diff c4bbb87^..c4bbb87 -- frontend-react/e2e/login.spec.ts` is empty).

This pass re-derived every claim from the code itself — apply-progress's own trace (WU-G) was read only *after* forming an independent conclusion, then cross-checked against it (they agree).

### 1. Is CRITICAL-1 actually gone? — YES, PROVEN by independent control-flow trace

`createPersonaCache()` (`session.ts:371-440`) now keeps **two** independent slot promises (`ownerAdminPromise`, `storeUserPromise`), each set exactly once via a synchronous `??=` inside its own `getOwnerAdmin()`/`getStoreUser()` accessor. `prime(slot, ...)` (`:400-421`) now checks only `alreadyResolving = slot === 'owner-admin' ? ownerAdminPromise : storeUserPromise` — i.e. priming `store-user` is no longer blocked by `owner-admin` having already started resolving.

Traced `login.spec.ts:183-220` (REQ-11) statement by statement against this fixed engine:

| Line | Call | Effect on the fixed engine |
|---|---|---|
| `:189` `restoreSignedInSession('owner-admin')` | `getOwnerAdmin()` → `ownerAdminPromise ??= mintOwnerAdmin(browser, primedOwnerAdmin)` | `primedOwnerAdmin` is already set (test 1's `primeOwnerAdmin` at `:152`) → `mintOwnerAdmin` returns it **immediately, zero network cost, no fallback branch entered at all** (`session.ts:197-203`: `if (primed) return primed;`). `storeUserPromise` is untouched — still `null`. |
| `:192-205` own StoreUser creation + real login | Does not touch the cache at all | Independent of the engine. |
| `:210` `primeStoreUser(...)` | `prime('store-user', ...)` checks `storeUserPromise` | Still `null` (nothing has called `getStoreUser()` yet) → guard passes, sets `primedStoreUser`. **No throw.** |
| `:216` `restoreSignedInSession('store-user-with-products')` | `getStoreUserWithProducts()` → `Promise.all([getStoreUser(), getOwnerAdminWithProducts()])` | `getStoreUser()`: `storeUserPromise ??= mintStoreUser(browser, primedStoreUser, getOwnerAdmin)` → `primed` is set (line 210) → returns it directly, zero cost, R5 `assertSharedStoreId` passes (both owner and storeUser were created inside the same store by construction). `getOwnerAdminWithProducts()`: first call this run → seeds category+product via UI (zero network, offline mode) **now**, i.e. after line 205's "sin productos" assertion already completed. |

Confirmed: `restoreSignedInSession(..., 'owner-admin')` at `login.spec.ts:189` no longer triggers any `store-user` work, invisible or otherwise, and `primeStoreUser()` at `:210` no longer throws. **CRITICAL-1's mechanism is closed.**

### 2. The login budget — re-counted independently, matches design.md §2 exactly: 4

Traced every statement in `describe.serial` in file order (Playwright runs a serial block in declaration order in one worker):

1. S1 test (`:97`) — 1 real login (register+login), `primeOwnerAdmin()`.
2. REQ-3 (`:156`) — 1 real login (bad password, no cache interaction).
3. REQ-11 (`:183`) — `restoreSignedInSession('owner-admin')` zero cost (primed) → own StoreUser creation (zero-cost `POST /v1/storeusers`) + **1 real login** (`:202-204`) → `primeStoreUser()` (zero cost, no throw) → `restoreSignedInSession('store-user-with-products')` triggers `getStoreUser()` (zero cost, primed) and `getOwnerAdminWithProducts()` (zero login — UI seeding is offline-only, `GlobalConfig.USE_ONLINE_SERVICE = false`). **This test: 1 real login.**
4. REQ-9 (`:222`) — `restoreSignedInSession('owner-admin-with-products')` reuses the promise memoized in step 3, zero cost. Real `logout()` + re-login — **1 real login**.
5. REQ-7 (`:246`) — `restoreSignedInSession('owner-admin')` reuses `ownerAdminPromise` — zero cost, zero logins.
6. REQ-12+REQ-14 (`:256`) — restores `owner-admin`, `store-user-with-products`, `store-user` — all already memoized by steps 3-4 — zero cost, zero logins.

**Total: 4 real `POST /v1/auth/login`** (S1, REQ-3, REQ-11, REQ-9). Matches design.md §2's budget against the 5/min ceiling, with the declared 1-login margin intact (R1). This agrees with apply-progress's own count — independently re-derived here, not taken on faith.

### 3. REQ-11's "sin productos" premise — PROVEN clean, by control flow

`mintOwnerAdminWithProducts` (the only place `seedCategoryAndProduct` is called, `session.ts:305-329`) is reached for the first time at `login.spec.ts:216` (`restoreSignedInSession('store-user-with-products')`), which is textually **after** line 205's `page.waitForURL(/\/sales\/products$/)` — the assertion that depends on the store having zero products — has already resolved. No earlier statement in the file can reach `mintOwnerAdminWithProducts` (it is not called by `mintOwnerAdmin` or `mintStoreUser`, only by `getOwnerAdminWithProducts`, which is called only by `getStoreUserWithProducts` and would itself only be reached via a `resolve('owner-admin-with-products')` or `resolve('store-user-with-products')` call — neither occurs before line 216 in this test or any earlier test in the block). The premise holds by construction, not by luck of timing.

### 4. Did the fix introduce new hazards? — checked, none found

- **Races between concurrent `resolve()` calls**: `getOwnerAdmin()`/`getStoreUser()`/etc. are synchronous check-and-assign (`promise ??= mint...(...)`) with no `await` between the check and the assignment — JS's single-threaded execution means two "concurrent" calls (e.g. both branches of the `Promise.all` in `mintStoreUserWithProducts`, which synchronously invokes `getStoreUser()` and `getOwnerAdminWithProducts()` before either awaits) cannot interleave on that assignment. Each slot is set exactly once, deterministically. No race.
- **Rejected promise poisoning later calls**: if `mintOwnerAdmin`/`mintStoreUser`'s fallback branch throws, the `??=`'d promise is a rejected promise, and it stays cached — every subsequent `getOwnerAdmin()`/`getStoreUser()` call in that worker returns the same rejection. This is intentional memoize-once semantics (matches "mint at most once per worker," design.md §3), not a regression introduced by this fix, and `describe.serial` aborts the rest of the block on the first failure regardless.
- **Shared mutable state across the four mints**: `mintOwnerAdmin`/`mintStoreUser`/`mintOwnerAdminWithProducts`/`mintStoreUserWithProducts` each operate on their own fresh `browser.newContext()` (or the primed snapshot) and return a new `CapturedSnapshot` object; no shared mutable object is written by more than one mint function. `assertSharedStoreId` in `mintStoreUser` only *reads* `ownerSnapshot.selectedStoreId`, never mutates it.
- **R2/H-8 stop-and-ask gate**: `createStoreUserViaUi()` (`session.ts:161-183`) is byte-for-byte unchanged by this commit (confirmed: this function is outside the diff hunks in `git show c4bbb87 -- frontend-react/e2e/support/session.ts`). Both call sites (`mintStoreUser`'s fallback, `login.spec.ts:192`) still route through it unmodified.

### 5. Blast radius, re-confirmed

`git diff --stat main...HEAD` (including `c4bbb87`): 8 non-openspec files touched — `README.md`, `login-rate-limit.spec.ts`, `login.spec.ts`, `support/login-network-observer.ts`, `support/login-page.ts`, `support/session.ts`, `support/store-seed.ts`, `support/test.ts` — same set as the first pass, none newly touched by the fix.

Independently re-ran:
- `git diff main...HEAD -- register.spec.ts register-rate-limit.spec.ts smoke.spec.ts api-health.spec.ts support/network-observer.ts support/register-page.ts support/identity.ts support/backend-url.ts` → **empty** (0 lines).
- `git diff --stat main...HEAD -- '**/*.test.ts' '**/*.test.tsx'` → **empty**.
- `git diff main...HEAD -- support/test.ts` read in full → still strictly additive: `RegisterFixtures`/`registerNetwork`'s `auto:true` block untouched byte-for-byte; every change is new interfaces (`SessionFixtures`, `SessionWorkerFixtures`, `LoginFixtures`) and new fixture entries appended after the untouched block.
- `pnpm exec playwright test e2e/register.spec.ts --list` → **8/8**, same names/line numbers as main.

### 6. Coverage re-check (the fix touched the minting engine, not assumed carried over)

`login.spec.ts` itself has zero diff from the first pass, so the REQ→`file:line` mapping table from the first pass (§2 above) is unchanged verbatim. Re-checked specifically the two REQs most exposed to the minting engine:

- **REQ-11 (D3)**: both halves now hold — "sin productos" (`:183-206`) asserts before any seeding can occur (§3 above); "con productos" (`:212-219`) restores the merged snapshot after seeding has run. Confirmed clean, was previously marked "breaks its own premise."
- **REQ-9 (D1, `:222-244`)**, **REQ-7 (`:246-254`)**, **REQ-12+REQ-14 (`:256-281`)**: previously "at risk of never running" because `primeStoreUser()` threw and `describe.serial` skipped the rest of the block. That throw no longer occurs (§1 above), so nothing blocks these three tests from executing in the same run that reaches REQ-11.

The three known traps (`.first()` on the overlay, `AUTH_MODEL` suffix scan, login-specific rate-limit constants) and the R2/H-8 gate are untouched by this commit (§4 above) — first-pass clearance stands.

### Commands re-run this pass (all independently executed, not copied from apply-progress)

```
pnpm exec tsc --noEmit --strict --lib ES2022,DOM --types node \
  --typeRoots ./apps/web-store-pos/node_modules/@types --moduleResolution bundler \
  --module ES2022 --target ES2022 --skipLibCheck \
  e2e/*.ts e2e/support/*.ts playwright.config.ts playwright.api.config.ts
→ exit 0

pnpm exec playwright test --grep-invert @rate-limit --list
→ 20 tests in 4 files (api-health.spec.ts ×2, login.spec.ts ×8, register.spec.ts ×8, smoke.spec.ts ×2)

pnpm exec playwright test --grep @rate-limit --list
→ 2 tests in 2 files (login-rate-limit.spec.ts ×1, register-rate-limit.spec.ts ×1)

pnpm exec playwright test e2e/register.spec.ts --list
→ 8 tests in 1 file, unchanged
```

### Issues found, second pass

**CRITICAL**: none. CRITICAL-1 is closed.

**WARNING**: none new.

**SUGGESTION**:
- **S1 from the first pass is now moot.** The README's "3 filas permanentes" (`Owner` + `Store` + `User`) claim (`e2e/README.md:107-108`) is accurate again: the fix removes the invisible fallback `store-user` that would have added a second `User` row, so the default run now creates exactly the 1 `Owner` + 1 `Store` + 1 `User` (the StoreUser created once in REQ-11) the README documents. No action needed.

### PROVEN vs UNPROVEN-PENDING-BACKEND — second pass

**PROVEN in this pass** (independently derived, not taken on faith from apply-progress or the first-pass report):
- CRITICAL-1's mechanism is closed: `restoreSignedInSession(..., 'owner-admin')` no longer triggers any `store-user` work; `primeStoreUser()` no longer throws — traced statement-by-statement through the fixed `session.ts` against `login.spec.ts`'s actual call order.
- The default run's login count is exactly 4, re-derived independently by tracing the same control flow, matching design.md §2.
- REQ-11's "sin productos" premise holds: no code path can reach the product-seeding step before line 205's assertion.
- No new memoization hazards (races, poisoned rejections, shared mutable state) were introduced by the fix.
- R2/H-8 gate (`createStoreUserViaUi`) is byte-for-byte unchanged by this commit.
- Blast radius still clean: same 8 files touched, all previously-untouched files remain untouched, `test.ts` remains strictly additive, `register.spec.ts --list` still 8/8.
- `tsc --noEmit --strict` over all e2e sources → exit 0 (re-run independently).
- `playwright test --grep-invert @rate-limit --list` → 20/4 files; `--grep @rate-limit --list` → 2/2 files (both re-run independently).
- README's data-footprint claim is now accurate (S1 from pass 1 resolved as a side effect of the fix).

**UNPROVEN — still requires the user's own live backend run** (unchanged categories from the first pass; this agent never runs `dotnet`):
- Whether the fixed control flow actually behaves this way against a live backend — this static trace is deterministic JS/TS control flow (no network timing involved in the logic being traced), but the first live `pnpm test:e2e` run is still the first real confirmation.
- REQ-8's live 429 (`login-rate-limit.spec.ts`), CORS on the 429 response (R8), whether a failed login truly consumes a permit (R7).
- The two-runs-within-one-minute quota-margin claim (R1).
- `store-seed.ts`'s selectors resolving correctly against a live rendered app.
- All 13 REQs' runtime assertions themselves (overlay-only rendering, causal network order, literal backend error text, `AUTH_MODEL` persistence, guest-guard redirect, StoreUser creation via `adminFeatureLoader`, real re-login after `logout()`, `/admin/owners` negative/D6 cross-checks) — static reading proves the code *will attempt* the right thing; only a live run proves the backend/UI actually cooperate.

### Verdict — second pass

**PASS.**

CRITICAL-1 is closed: independently re-derived, not taken on faith from apply-progress's own trace (which was read only after this pass reached the same conclusion on its own). The fix is scoped correctly — it lives entirely in the minting engine (`session.ts`), not in `login.spec.ts`'s statement order, so it protects every scenario that composes off `signedInPage`/`personaCache`, not just the one call site that CRITICAL-1 happened to catch. No new hazards were introduced by the memoization rework. Blast radius remains clean. The previously-open SUGGESTION (S1, README data-footprint undercount) is resolved as a side effect of the fix, not left dangling.

This change is ready for `sdd-archive`, with the same UNPROVEN-pending-backend categories declared as gaps for the user's own `pnpm test:e2e` / `pnpm test:e2e:rate-limit` run — same posture the archived sibling `e2e-playwright-register-s1-01` used.
