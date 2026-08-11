# Proposal: Content Security Policy for web-store-pos

## Intent

`device-wrapped-dek` shipped the crypto half of the at-rest threat model. **The encryption story is
NOT complete.** A storage dump now yields ciphertext, but the DEK lives in memory as a module-level
`let` (`data-key-store.ts:10-15`) and any script running inside the app's own origin can use it as a
decryption oracle. Crypto cannot close that; only a policy that stops the script from loading can.
`device-wrapped-dek/proposal.md:119-134` deferred this explicitly and recorded the gap as live risk.

Today there is **zero CSP** in the stack — no `add_header` in `deploy/nginx.conf`, no `server.headers`
in `vite.config.ts:50-53`. The only mention is prose at `docs/prd/auth.md:672`.

## Scope

### In Scope

- One policy generator (single source of truth) emitting a **dev** and a **prod** variant.
- `Content-Security-Policy-Report-Only` delivered as a real header on both surfaces:
  dev via `vite.config.ts` `server.headers`, prod via `deploy/nginx.conf` `add_header`.
- Externalising the inline script at `root.tsx:39-44` to a **classic, non-deferred** file.
- A build-gate verifier that fails `pnpm build` when `deploy/nginx.conf`'s policy text diverges from
  the generator, mirroring the existing `precache-patterns.mjs` + `verify-sw-precache.mjs` pattern
  (`package.json:6`, `vite.config.ts:22-31`).
- New Playwright coverage: header presence/directives, a real violation event, a zero-violation sweep,
  and proof the externalised script still runs.

### Out of Scope

- **A report collector.** Would touch backend production source (approval-gated). Violations surface in
  the browser console and to Playwright.
- **Enforcing mode.** `-Report-Only` → enforcing is a separate change, gated on the user's go-ahead.
- **Replacing recharts.** `style-src 'unsafe-inline'` is accepted permanently (see below).
- **The two DEK E2E tests** the user approved — separate work.
- A `vite preview` Playwright project. It would be a *third* emission of the policy and still would not
  prove nginx. Named and deferred.

### Done means

Report-Only is served in dev and prod, the drift gate is wired into `build`, the new Playwright specs
are green, and no existing test changed.

## Capabilities

### New Capabilities

- `content-security-policy`: the directive set and its justification, the two delivery surfaces, the
  report-only mode, and the single-source/verified-delta invariant.
- `pwa-install-capture-script`: the externalised script's contract — classic (not a module), not
  deferred, executes during head parse, parks the event on `window.__pwaInstallPrompt`. Specified
  separately because a future "modernisation" to `type="module"` passes the CSP and still silently
  breaks the install button.

### Modified Capabilities

None.

## Approach

### The policy, directive by directive

| Directive | Value | Justification |
|-----------|-------|---------------|
| `default-src` | `'self'` | Fallback; everything below narrows or restates it. |
| `script-src` | `'self'` | **The directive that protects the DEK.** No `eval`/`new Function` in app source; RR7 dev HMR loads via external module scripts, so dev needs no loosening. |
| `style-src` | `'self' 'unsafe-inline'` | **Permanent carve-out.** recharts sets inline `style` at runtime (`statistics/components/chart-core.tsx` → `TooltipBoundingBox.js:132,148`) and ships to production; Vite CSS-HMR needs it in dev. Not a dev concession. |
| `font-src` | `'self'` | Inter is self-hosted (`packages/web-common/styles.css:42-80`). |
| `img-src` | `'self'` | PWA icons + favicon only (`public/manifest.webmanifest:18-63`); zero `data:image` in app or packages. |
| `connect-src` | prod `'self'` / dev `'self' <dev API origin>` | **The only permitted dev/prod delta.** Prod is same-origin (`deploy/nginx.conf:44-50` proxies `/api`, baked default `API_URL=/api`, `Dockerfile:16`). Dev reads `import.meta.env['API_URL']` (`api-client.ts:21`), default `http://localhost:5019/api` (`e2e/support/backend-url.ts`). |
| `worker-src`, `manifest-src` | `'self'` | PWA service worker only; no web workers found. |
| `object-src` | `'none'` | No `<object>`/`<embed>`/`<iframe>` anywhere. See the blob-PDF risk below. |
| `base-uri` | `'self'` | Blocks `<base>` injection, which would otherwise re-point every relative script URL and defeat `script-src 'self'`. |
| `form-action` | `'self'` | Cheap exfiltration closure. |
| `frame-ancestors` | `'none'` | Clickjacking. **Header-only** — invalid via `<meta>`. |

`blob:` URLs exist (`sync/routes/export.tsx:62`, `roster-export-panel.tsx:53`,
`inventory-today-sale-pdf.ts:140-141`) but only as downloads and one `window.open` navigation, not as
fetch-directive subresources.

### Delivery: why not `<meta http-equiv>`

The exploration listed `<meta>` as a both-environments option. It is **unusable for this change**:
`Content-Security-Policy-Report-Only` cannot be delivered via `<meta>` at all — HTML defines only the
`content-security-policy` pragma, and CSP3 requires report-only policies delivered that way to be
ignored. *(Web-platform fact, not repo-verifiable.)* Report-Only therefore forces real headers, which
is also what `frame-ancestors` needs. `root.tsx` gets no `<meta>`.

### One policy or two

**One source, two emissions, one machine-checked delta.** The dev header is the *only* one Playwright
can observe; if prod diverges anywhere except the single declared axis, the tested policy stops being
evidence about the shipped one. So: a generator produces both variants, `connect-src` is the only
directive allowed to differ, and a `build`-gate verifier parses `deploy/nginx.conf` and fails the build
on any other difference. Two hand-maintained copies of a security policy *will* drift; this is the
mechanism that prevents it, and the repo already proves the shape works.

### The inline script

`root.tsx:39-44` moves to `public/pwa-install-capture.js`, loaded via `<script src="...">`. Not a nonce
(`react-router.config.ts:8` sets `ssr: false`; nginx serves a static `index.html`, so there is no
per-request server to stamp one, and a fixed nonce is an anti-pattern). Not a hash (drifts silently on
edit; nothing validates it at build). It **must stay classic** — a module defers past head parse and
breaks the capture-before-hydration timing `pwa-install-prompt.ts:51-66` depends on.

### Prerequisite spike (blocking, cheap)

Chrome warns that a report-only policy without `report-uri`/`report-to` "will have no effect." Whether
the `securitypolicyviolation` event and the `[Report Only] Refused to…` console entry still fire with
no reporting destination is **NOT VERIFIED** and the entire testing plan rests on it. Resolve with a
throwaway ~10-line Playwright check before writing specs. If they do not fire, the fallback is
`report-uri /csp-report` backed by `location /csp-report { return 204; }` in `deploy/nginx.conf` — a
black hole that stores nothing, so it is **not** a collector and does not touch backend source.

## Testing story, and its ceiling

**Playwright CAN** (dev server only — `playwright.config.ts:103-112` hardcodes `pnpm dev`):

- assert `response.headers()['content-security-policy-report-only']` exists and contains each directive;
- assert a **real** violation: register a `securitypolicyviolation` listener via `addInitScript`, then
  append a disallowed `<script src="https://example.com/x.js">` and read the event back. In report-only
  the resource still executes, so the assertion must be on the event, never on the effect;
- assert **zero** violations across the app's real routes — the enforcement-readiness signal;
- assert `window.__pwaInstallPrompt` is set after a synthetic `beforeinstallprompt`, proving the
  externalised script loaded and ran early.

**Nothing in this repo CAN** observe the production nginx header, or the production build's runtime
(no HMR, static Tailwind CSS, lazy recharts chunk). `.github/workflows/` does not exist, so there is no
CI to host a smoke test, and inventing one is out of scope.

Gap reduction without inventing CI: the build gate proves the production policy **text** is correct, so
what remains unobserved is only the delivery layer; a documented one-time `curl -I` against the built
container proves it is **served**, run by the human at rollout. That ceiling is stated, not papered over.

Strict TDD note: a header is not vitest-testable, but the generator and the drift verifier are — and
`vitest.config.ts:25` already includes `scripts/**/*.test.mjs` with zero files today. That is where the
red→green loop lives; the header itself is driven by Playwright.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web-store-pos/scripts/csp-policy.mjs` | New | Policy generator, single source of truth. |
| `apps/web-store-pos/scripts/verify-csp.mjs` (+ test) | New | Build gate; parses `deploy/nginx.conf`, asserts the delta. |
| `apps/web-store-pos/vite.config.ts` | Modified | `server.headers` — the dev emission. |
| `frontend-react/deploy/nginx.conf` | Modified | `add_header` — the prod emission. |
| `apps/web-store-pos/app/root.tsx` | Modified | Inline script → `<script src>`. |
| `apps/web-store-pos/public/pwa-install-capture.js` | New | The externalised classic script. |
| `apps/web-store-pos/package.json` | Modified | Wire `verify-csp.mjs` into `build`. |
| `frontend-react/e2e/*.spec.ts` | New only | New specs. **No existing E2E touched.** |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Report-only with no reporting endpoint may be inert in Chrome — invalidates the whole test plan | Med | **Blocking spike before specs**; fallback `report-uri` → nginx `return 204`. |
| Production header served incorrectly and nothing notices | High | Build gate on the text + documented one-time `curl -I` at rollout. Residual, accepted. |
| `style-src 'unsafe-inline'` leaves CSS-injection open permanently | Certain | Accepted by the user. `script-src` — the directive that guards the DEK — is not loosened. |
| Externalised script silently becomes a module/`defer`, breaking install capture | Med | Its own capability spec + an explicit test. |
| `object-src 'none'` is inherited by the `blob:` PDF document (`inventory-today-sale-pdf.ts:141`) and may break Chrome's PDF viewer | Med, NOT VERIFIED | Report-only cannot break it; the manual sweep must exercise the PDF path before enforcing. |
| A developer's own `.env` `API_URL` on a different port violates dev `connect-src` | Low now, **High under enforcement** | Harmless in report-only; must be resolved by the enforcing change. |
| `tsconfig.json:2` includes `**/*` with `allowJs` unset, so `vite.config.ts` importing a `.mjs` may fail `tsc` | Med | Design decides the module format; `resolveJsonModule` is already on (`tsconfig.json:26`). |

## Rollback Plan

Per work unit, no state and no migration. Delete the `add_header` line (prod) and the `server.headers`
block (dev) and the policy is gone; revert the verifier commit to unblock `build`. The externalised
script is behavior-neutral and independently valuable — keep it. Report-Only never blocks a resource,
so rollback is a cleanliness action, not an incident response.

## Rollout

1. Ship Report-Only. Nothing breaks by construction.
2. Clean signal = the Playwright zero-violation sweep is green **and** a human-run pass against the
   production container reports zero violations across charts (recharts), PDF export, CSV import,
   roster export, and the install button.
3. **The user decides** when to flip to enforcing. That is a separate change.

## Dependencies

- The prerequisite spike above, before specs are written.
- Branch `feat/content-security-policy`, created from the current HEAD (not `main`).

## Review Workload Forecast

Delivery is `commits-only` — no PRs, no push. Three work-unit commits, each independently revertible:

| # | Work unit | Est. lines |
|---|-----------|-----------|
| 1 | Externalise the install-capture script + its tests | ~80 |
| 2 | Policy generator + dev header + Playwright CSP specs | ~150 |
| 3 | Production nginx header + drift verifier + its vitest test | ~140 |

**Estimated changed lines: ~370. 400-line budget risk: Medium. Chained PRs recommended: No**
(commits-only). **Decision needed before apply: Yes** — the prerequisite spike must resolve first.

## Success Criteria

- [ ] `Content-Security-Policy-Report-Only` is served in dev (`vite.config.ts`) and prod (`nginx.conf`).
- [ ] `connect-src` is the only directive that differs between them, and the build fails otherwise.
- [ ] A deliberately disallowed resource produces an observable violation in Playwright.
- [ ] Navigating the app's real routes produces zero violations.
- [ ] The install-capture script runs before hydration and is not a module.
- [ ] No existing E2E test and no backend source was modified.
