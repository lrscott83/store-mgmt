# Tasks: content-security-policy

> Inputs: proposal #2141, spec #2146, design #2148, decisions #2140 (all read in full via
> `mem_get_observation`). Delivery = `commits-only`, three work-unit commits on
> `feat/content-security-policy`, no PRs, no push. Strict TDD: every implementation step has a
> preceding RED item as its own checkable box.
>
> Facts settled since design (do NOT re-open, do NOT schedule fallback work for these):
> 1. `moduleResolution: "bundler"` resolves `./csp-policy.mjs` → `./csp-policy.d.mts` — `tsc` exit 0,
>    proven with the repo's TS 5.8.3. D2's fallback ladder (`@ts-expect-error`, literal-in-vite.config)
>    is **not scheduled**.
> 2. Vendor CSS (`sweetalert2@11.26.25`, `react-toastify@11.1.0`) carries **no** `data:` URIs —
>    grepped on disk. `img-src 'self'` stands; **no `data:` addition, no sweep task**.
> 3. Report-only with no `report-uri` still fires `securitypolicyviolation` (`disposition: "report"`)
>    and still logs — probed in Chromium. **No `/csp-report` nginx fallback is scheduled.**

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~370 (WU1 ~80, WU2 ~150, WU3 ~140) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No — delivery is commits-only, no PRs exist in this flow |
| Suggested split | 3 work-unit commits on one branch, in order |
| Delivery strategy | commits-only |
| Chain strategy | pending (N/A — no PR chain under commits-only delivery) |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium
```

### Suggested Work Units

| Unit | Goal | Commit | Test kind | Notes |
|------|------|--------|-----------|-------|
| WU1 | Externalise the install-capture script | 1 | Playwright | Behaviour-neutral, independently valuable, no CSP yet |
| WU2 | Policy generator + dev header + Playwright coverage | 2 | vitest + Playwright | Mandatory gate: `typecheck` |
| WU3 | Production nginx header + build-time drift gate | 3 | vitest | Header itself unobservable by any frontend gate — manual step below |

Rollback order is **WU3 → WU2 → WU1** (`verify-csp.mjs` imports `csp-policy.mjs`; reverting WU2 alone
breaks `build`). Each WU leaves the tree green and committable standalone.

---

## WU1 — Externalise the install-capture script (Playwright)

Files: NEW `apps/web-store-pos/public/pwa-install-capture.js`; MOD `apps/web-store-pos/app/root.tsx:39-44`;
NEW `frontend-react/e2e/pwa-install-capture.spec.ts`.
Satisfies spec: `pwa-install-capture-script` — "Runs Before Hydration, Not Blocked by Policy".

- [x] 1.1 **[Playwright RED]** Write `e2e/pwa-install-capture.spec.ts` with the three scenarios from
  design §4.1: (a) `head script[src="/pwa-install-capture.js"]` count 1, `type`/`defer`/`async` all
  `null`; (b) adoption — synthetic `beforeinstallprompt` flips `getByRole('button',{name:'Instalar app'})`
  (`install-app-button.tsx:20`) disabled→enabled; (c) parse-time discrimination — `addInitScript`
  MutationObserver fires the synthetic event the instant `link[rel="manifest"]` (`root.tsx:52`) appears;
  assert `document.readyState==='loading'` first, then `window.__pwaInstallPrompt` already set.
  Run — expect FAIL (no such `<script src>` exists; today's script is inline `dangerouslySetInnerHTML`).
  Verify: `cd frontend-react && npx playwright test e2e/pwa-install-capture.spec.ts --project=chromium`
  **DONE, with a corrected mechanism for (c)** — RED confirmed (2/3 failed on the missing `<script src>`;
  the adoption test passed both before and after, exactly as designed as a behaviour-neutral
  characterization test). Scenario (c) as literally specced does NOT hold in this repo: curling the raw
  dev HTML shows `<link rel="manifest">` lands in the DOM **before** our `<script src>` even executes
  (RR7/Vite's dev head rendering does not preserve the Layout's JSX child order), so watching for that
  sibling node's arrival cannot discriminate classic-vs-module. Replaced with an
  order-independent mechanism: wrap `window.addEventListener` to catch the capture script's own
  `beforeinstallprompt` registration and assert `document.readyState === 'loading'` at that instant
  (proven false for a deferred `type="module"` script, which registers only once parsing is done) — same
  intent as design §4.1, different, verified mechanism. See engram
  `sdd/content-security-policy/apply-progress` for the full finding.
- [x] 1.2 **[GREEN]** Create `public/pwa-install-capture.js` with the two `addEventListener` lines moved
  verbatim from `root.tsx:41-42`. Edit `root.tsx:39-44`: replace the `dangerouslySetInnerHTML` block with
  `<script src="/pwa-install-capture.js"></script>`.
  Verify: same Playwright command → 3/3 green.
  **DONE** — 3/3 passed. Overall process exit code is 1 solely from `global-teardown.ts`'s Postgres
  connectivity check (`ECONNREFUSED 127.0.0.1:5432` — no local Postgres in this sandbox); no test in this
  spec touches the DB, and `global-teardown.ts` is an existing E2E support file, untouched.
- [x] 1.3 **[WU gate]** `cd frontend-react && npx turbo run lint typecheck --filter=@store-mgmt/web-store-pos --force`
  **DONE — green, after clearing unrelated baseline debt in its own commit first.** The gate was
  initially red on 9 pre-existing errors in 3 files WU1 never touches (`auth-store.ts:9` unused `setDek`
  import; `dek-bootstrap.test.ts` and `device-key-store.test.ts`, `no-global-assign` on `indexedDB`,
  4 each) — proven unrelated: the branch sat at `main`'s commit and stashing WU1's 3 files reproduced
  the identical 9 errors. Cleared with the user's authorization in a separate preceding commit:
  `setDek` dropped from the import (only `clearDek` is called), and the bare `indexedDB = new
  IDBFactory()` assignments rewritten as `globalThis.indexedDB = ...` — the idiom
  `device-key-store.test.ts:58` already used, semantically identical, no `eslint-disable` needed.
  Final run of `lint typecheck test --force`: 12/12 tasks green, 185 test files / 2436 tests passed,
  `Type Errors: no errors`.

**Finish/rollback boundary**: one commit (`feat(content-security-policy): externalise install-capture
script (WU1)`). Revert = script reverts to inline; 1.1's spec goes red again — informative only, no CSP
exists yet so nothing is blocked.

---

## WU2 — Policy generator + dev header + Playwright coverage (vitest + Playwright)

Files: NEW `scripts/csp-policy.mjs`, `scripts/csp-policy.d.mts`, `scripts/__tests__/csp-policy.test.mjs`;
MOD `vite.config.ts`; NEW `e2e/support/csp-violations.ts`, `e2e/csp-report-only.spec.ts`.
Satisfies spec: `content-security-policy` — "Dev Header Delivery", "script-src Excludes Unsafe Keywords",
"style-src Permanent Carve-out", "Report-Only Does Not Block", "No Violations on Real Routes", and the
generator half of "Dev/Prod Policy Parity"; `pwa-install-capture-script` — "Script load produces no
violation" scenario.

- [ ] 2.1 **[vitest RED]** Write `scripts/__tests__/csp-policy.test.mjs`: prod `script-src` is exactly
  `'self'` (no `unsafe-inline`/`unsafe-eval`); `style-src` contains `'self' 'unsafe-inline'`;
  `deriveApiOrigin` over the 4-row table (`'http://localhost:5019/api'`→origin, `'/api'`→`null`,
  `''`/`undefined`→`null`, unparseable→`null`); canonical serialization is stable across two calls (no
  trailing `;`, single spaces, fixed order); dev-vs-prod directives differ only in
  `ALLOWED_ENV_DELTA_DIRECTIVES`. Run — expect FAIL (module does not exist).
  Verify: `cd frontend-react && pnpm --filter @store-mgmt/web-store-pos exec vitest run scripts/__tests__/csp-policy.test.mjs`
- [ ] 2.2 **[GREEN]** Create `scripts/csp-policy.mjs`: the canonical prod directive table (design D3),
  `buildCspDirectives(env, options)`, `buildCspHeaderValue(env, options)`, `deriveApiOrigin(apiUrl)`,
  `ALLOWED_ENV_DELTA_DIRECTIVES = ['connect-src']`, `CSP_HEADER_NAME`. Create the 6-line
  `scripts/csp-policy.d.mts` sibling declaration (design D2).
  Verify: same vitest command → green.
- [ ] 2.3 **[Playwright RED]** Write `e2e/support/csp-violations.ts` (observer, same shape as
  `e2e/support/store-network-observer.ts`) and `e2e/csp-report-only.spec.ts`: (a) header presence —
  `content-security-policy-report-only` defined and contains `script-src 'self'`, `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'self'`, **and** `content-security-policy` (enforcing) is `undefined`;
  (b) real violation — `addInitScript` listener + appended `<script src="https://example.com/x.js">`,
  assert `disposition==='report'` and `effectiveDirective` matches `/^script-src(-elem)?$/`; (c) zero
  violations across `/`, `/login`, `/register` with an explicit **empty** `KNOWN_DEV_ONLY_VIOLATIONS`
  allowlist. Run — expect FAIL (no header served; `vite.config.ts` untouched).
  Verify: `cd frontend-react && npx playwright test e2e/csp-report-only.spec.ts --project=chromium`
- [ ] 2.4 **[GREEN]** Edit `vite.config.ts`: wrap in `defineConfig(({mode}) => ...)`, call `loadEnv` with
  the existing `envDir`/`envPrefix` (`vite.config.ts:64-65`), import `buildCspHeaderValue`/`CSP_HEADER_NAME`
  from `./scripts/csp-policy.mjs`, set `server.headers[CSP_HEADER_NAME]` to the dev value (`connect-src`
  derived from `API_URL` + explicit `ws://localhost:3333`).
  Verify (mandatory acceptance gate, design D2 — proven to pass, no fallback needed):
  `cd frontend-react && pnpm --filter @store-mgmt/web-store-pos typecheck`
  Then rerun 2.3's Playwright command → 3/3 green.
- [ ] 2.5 **[WU gate]** `cd frontend-react && npx turbo run lint typecheck test --filter=@store-mgmt/web-store-pos --force`
  and rerun `e2e/pwa-install-capture.spec.ts` (regression check on WU1).

**Finish/rollback boundary**: one commit (`feat(content-security-policy): policy generator + dev header +
Playwright coverage (WU2)`). Revert = dev header disappears, nothing else changes — **must be reverted
after WU3** (`verify-csp.mjs` imports `csp-policy.mjs`; reverting WU2 alone breaks `build`).

---

## WU3 — Production header + build-time drift gate (vitest; header itself unobservable)

Files: MOD `deploy/nginx.conf`; NEW `scripts/csp-nginx.mjs`, `scripts/verify-csp.mjs`,
`scripts/__tests__/csp-nginx.test.mjs`; MOD `package.json:6`, `turbo.json`.
Satisfies spec: `content-security-policy` — "Dev/Prod Policy Parity" (nginx half), and is the only
mechanism that keeps "script-src Excludes Unsafe Keywords" / "style-src Permanent Carve-out" true on the
surface no automated test can reach.

- [ ] 3.1 **[vitest RED]** Write `scripts/__tests__/csp-nginx.test.mjs` fixtures against not-yet-existing
  `checkNginxConf`: missing header, missing `always`, an extra undeclared `add_header`, a
  reordered-but-equivalent policy (must **PASS** — proves token-set comparison, not byte comparison), and
  the cross-origin `API_URL` warn path (warning, not an error — design §3 non-fatal check). Run — expect
  FAIL (module does not exist).
  Verify: `cd frontend-react && pnpm --filter @store-mgmt/web-store-pos exec vitest run scripts/__tests__/csp-nginx.test.mjs`
- [ ] 3.2 **[GREEN]** Create `scripts/csp-nginx.mjs`: `extractAddHeaders(conf)`, `parseCspHeaderValue(text)`,
  `diffPolicies(a,b)`, `checkNginxConf(conf)` — the 5 checks from design §3 (presence; `always`; text
  equality as directive-name-set + per-directive token-multiset; delta axis restricted to
  `ALLOWED_ENV_DELTA_DIRECTIVES`, no file I/O; `EXPECTED_ADD_HEADERS` set-equality).
  Verify: same vitest command → all fixture cases green.
- [ ] 3.3 **[vitest RED, real-file assertion]** Add to the same test file:
  `it('deploy/nginx.conf carries the exact production policy', ...)` reading the real file and asserting
  `checkNginxConf(conf) === []`. Run — expect FAIL (`nginx.conf` has no `add_header` yet).
  Verify: same vitest command → only this test red.
- [ ] 3.4 **[GREEN]** Edit `deploy/nginx.conf`: insert
  `add_header Content-Security-Policy-Report-Only "<canonical prod value from csp-policy.mjs>" always;`
  in the `server` block after `index index.html;` (currently `nginx.conf:40`) — **server level, not inside
  `location /`** (nginx does not merge `add_header` into a child block that declares its own; today
  `location /api` at 44-50 and `location /` at 53-55 declare none).
  Verify: same vitest command → all green, including 3.3.
- [ ] 3.5 **[mechanical wiring, no new test]** Create `scripts/verify-csp.mjs` (I/O + `process.exitCode`,
  shape of `verify-sw-precache.mjs:125-132`; resolves `deploy/nginx.conf` via `import.meta.url`, not
  `process.cwd()`). Edit `package.json:6`: append `&& node scripts/verify-csp.mjs` to `build`. Edit
  `turbo.json`: add top-level `"globalDependencies": ["deploy/nginx.conf"]` (repo-root-relative to
  `frontend-react/`; without it, editing the out-of-package nginx.conf does not invalidate
  `@store-mgmt/web-store-pos#build`/`#test` and `turbo run` replays a cached pass).
  Verify: `cd frontend-react && pnpm --filter @store-mgmt/web-store-pos build` → exit 0, no
  `verify-csp: FAILED` printed. Cache-correctness check:
  `cd frontend-react && npx turbo run build --filter=@store-mgmt/web-store-pos --dry=json` → confirm
  `deploy/nginx.conf` appears among the task's resolved inputs (proves D8's cache-invalidation fix, not
  header content).
- [ ] 3.6 **[WU gate]** `cd frontend-react && npx turbo run lint typecheck test build --filter=@store-mgmt/web-store-pos --force`
  and rerun `e2e/pwa-install-capture.spec.ts` + `e2e/csp-report-only.spec.ts` (regression check on WU1/WU2).

**Finish/rollback boundary**: one commit (`feat(content-security-policy): production nginx header +
build-time drift gate (WU3)`). Revert = `build` unblocked immediately, `add_header` gone from the next
image; a **running** container keeps serving the stale header until rebuilt — cosmetic wait, since
report-only never blocks.

### 3.7 — NOT verifiable by any frontend gate (manual, production only)

Nothing in this repo's automated suite can observe the header nginx actually emits
(`playwright.config.ts:103-112` hardcodes `pnpm dev`; no `vite preview` project; no `.github/workflows/`).
Run one command at a time, from the repo root, after WU3 is committed:

```
docker compose up -d --build web-store-pos
```

```
curl -sI http://localhost:8085/login
```

Expect a `content-security-policy-report-only:` line, byte-identical to the canonical string
`buildCspHeaderValue('prod')` produces. Port `8085` is `docker-compose.yml:120`.

Then, with DevTools open on `http://localhost:8085`, manually walk: statistics/charts (recharts), the
today-sale PDF export (**read the NEW TAB's console** — the `blob:` document is its own console context),
CSV import, roster export, and the install button. Zero `[Report Only] Refused to…` console entries is the
signal the enforcing change (separate, future) waits for. This step has no vitest/Playwright equivalent.

---

## Traceability — spec requirement → task

| Requirement | Domain | Tasks |
|---|---|---|
| Dev Header Delivery | content-security-policy | 2.3, 2.4 |
| script-src Excludes Unsafe Keywords | content-security-policy | 2.1, 2.2, 3.1–3.4 |
| style-src Permanent Carve-out | content-security-policy | 2.1, 2.2, 3.1–3.4 |
| Report-Only Does Not Block | content-security-policy | 2.3, 2.4 |
| Dev/Prod Policy Parity | content-security-policy | 2.1 (generator property), 3.1–3.4 (nginx half) |
| No Violations on Real Routes | content-security-policy | 2.3, 2.4 |
| Runs Before Hydration, Not Blocked by Policy | pwa-install-capture-script | 1.1, 1.2 |
| Script load produces no violation | pwa-install-capture-script | 2.3, 2.4 (zero-sweep covers `/`) |

## Out of scope for this task list (per proposal/design)

- Enforcing mode (separate change, user decides).
- Report collector / `report-uri` / `/csp-report` nginx location (settled: not needed, D9).
- The two DEK E2E tests (separate work, engram #2140 item 4).
- `.d.mts` fallback ladder (settled: primary approach works, no fallback needed).
- `img-src 'self' data:` addition or sweep (settled: vendor CSS has no `data:` URIs).
- `object-src`/blob-PDF viewer inheritance check — named in 3.7's manual pass, blocking only for the
  future enforcing change, not this one.
