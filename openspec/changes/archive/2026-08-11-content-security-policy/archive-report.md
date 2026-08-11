# Archive Report

**Change**: content-security-policy
**Date Archived**: 2026-08-11
**Domains**: content-security-policy (new), pwa-install-capture-script (new)
**Branch**: `feat/content-security-policy` (10 commits, all pushed, tree clean, HEAD `9c1dc039`)
**Delivery**: commits-only, no PRs, no push performed by this or prior SDD phases (user pushed)

---

## Summary

Closes the second half of the at-rest encryption threat model started by `device-wrapped-dek`:
crypto stops a storage dump from yielding plaintext, but the in-memory DEK (`data-key-store.ts:10-15`)
was still usable as a decryption oracle by any script running in the app's own origin, because
`web-store-pos` shipped with zero Content-Security-Policy anywhere. This change adds:

- A single-source CSP generator (`scripts/csp-policy.mjs`) emitting a **dev** and a **prod**
  variant, with `connect-src` as the only directive allowed to differ between them.
- `Content-Security-Policy-Report-Only` served as a real header on both surfaces — dev via a Vite
  plugin's `configureServer` hook (not `server.headers`, which turned out to be a no-op for
  non-`.html` URLs under React Router 7 SPA mode — see apply-progress finding below), prod via one
  server-level `add_header … always;` in `deploy/nginx.conf`.
- A build-time drift gate (`scripts/csp-nginx.mjs` + `scripts/verify-csp.mjs`) that fails `pnpm
  build` — and therefore the Docker image build — if `deploy/nginx.conf`'s policy text diverges from
  the generator on any directive other than `connect-src`.
- The PWA install-capture script externalised from an inline `dangerouslySetInnerHTML` block
  (`root.tsx:39-44`) to a classic, non-module `public/pwa-install-capture.js`, so `script-src` needs
  no `'unsafe-inline'`.
- Three new Playwright specs and no changes to any existing E2E test or backend source.

`script-src` — the directive that guards the DEK — ships as `'self' 'report-sample'` (no
`'unsafe-inline'`, no `'unsafe-eval'`). `'report-sample'` was added by user decision during apply
(task 2.6) purely to narrow the dev-only-violation allowlist matcher (it is a reporting flag, not a
source expression, so it grants no additional execution permission).

## Tasks

| Metric | Value |
|--------|-------|
| Total tasks | 3 work units — WU1 (1.1-1.3), WU2 (2.1-2.6), WU3 (3.1-3.7) |
| Completed (automated) | All automatable tasks done and green; 3.7's manual console sweep is explicitly non-blocking (see Follow-Up) |
| Incomplete | 0 blocking; 3.7 manual sweep pending (documented, not a gate on this report-only change) |

All boxes in `tasks.md` are checked `[x]`. Two design corrections were found and applied empirically
during WU2 (task 2.4): (1) `server.headers` in `vite.config.ts` is a no-op for non-`.html` URLs under
React Router 7's SPA-mode dev server — the fix moved header injection into a Vite plugin's
`configureServer(server)` hook, registered synchronously ahead of every internal Vite middleware; (2)
the zero-violation sweep's first real run found react-router's dev SSR hydration payload as three
inline `<script>` tags, exactly as design §6.7 predicted as "the single most likely thing to force a
revision" — resolved via `KNOWN_DEV_ONLY_VIOLATIONS` entries, narrowed twice (task 2.6) after the
first, wide entry was shown to also swallow two more genuinely-dev-only violations plus any future
unrelated one.

## Verification Results

**Verdict**: PASS WITH WARNINGS at verify time — 0 CRITICAL, 2 WARNING, 2 SUGGESTION
(engram `sdd/content-security-policy/verify-report`, id 2159).

| Check | Result |
|-------|--------|
| `npx turbo run lint typecheck test build --filter=@store-mgmt/web-store-pos --force` | 12/13 tasks green; `test` task had 2 pre-existing, unrelated failures (`loaders.cold-boot.test.ts`, `auth-store.test.ts`) reproduced identically on `main` — exonerated |
| `vitest run scripts/__tests__/csp-policy.test.mjs scripts/__tests__/csp-nginx.test.mjs` | 39/39 green in isolation |
| `npx turbo run build --force` | `verify-sw-precache: OK`, `verify-csp: OK` + a real (non-fixture) `verify-csp: WARNING` for the sandbox's cross-origin `.env` `API_URL`, matching the non-fatal contract |
| `npx turbo run build --dry=json` | confirmed `deploy/nginx.conf` in `globalCacheInputs.files` (D8 cache-invalidation fix verified) |
| `tsc --noEmit --strict` over the 3 new e2e files | exit 0 |
| `git diff --stat main...feat/content-security-policy` | zero existing E2E files touched (3 new e2e files only); only prod-code touch outside CSP wiring is the 1-line `auth-store.ts` unused-import removal (user-authorized, task 1.3) |

**Both WARNINGs from the verify report were resolved before archive**, by commit `9c1dc039`
amending `specs/content-security-policy/spec.md` (confirmed by reading the file directly during this
archive):

1. *"script-src Excludes Unsafe Keywords" literally said `'self'` only, but the shipped value is
   `'self' 'report-sample'`.* — Resolved: the requirement now explicitly names `'report-sample'` as
   a reporting flag, not a source expression, and states it is not a violation of the requirement.
2. *"No Violations on Real Routes" said "authenticated routes" but only unauthenticated routes
   (`/`, `/login`, `/register`) are swept.* — Resolved: the requirement now says "primary
   **unauthenticated** routes", explicitly states authenticated routes are "deliberately OUT of
   automated scope", and names the `KNOWN_DEV_ONLY_VIOLATIONS` matcher's missing dedicated unit test
   as an acknowledged, un-closed gap (matcher lives in `e2e/support/`, outside `vitest.config.ts`'s
   `include` globs).

The 2 SUGGESTION items (no dedicated vitest test for `isKnownDevOnly`'s matcher; "Report-Only Does
Not Block"'s "resource still runs" clause not independently asserted) remain open by design — both
are named explicitly in the amended spec / this report's Follow-Up section, not silently dropped.

## Spec Sync

Both domains are **new capabilities** — confirmed against `openspec/specs/` before merging (neither
`content-security-policy/` nor `pwa-install-capture-script/` existed there). No delta-merge logic was
needed; each delta spec was copied verbatim as the new canonical spec:

- `openspec/changes/content-security-policy/specs/content-security-policy/spec.md`
  → `openspec/specs/content-security-policy/spec.md` (126 lines, byte-for-byte, diff-verified — see
  Diff Verification below)
- `openspec/changes/content-security-policy/specs/pwa-install-capture-script/spec.md`
  → `openspec/specs/pwa-install-capture-script/spec.md` (32 lines, byte-for-byte, diff-verified)

Both files as read from `openspec/changes/content-security-policy/specs/` were already the amended,
current text (script-src's `'report-sample'` carve-out and the unauthenticated-routes correction) —
confirmed directly, not assumed from the verify report.

## Archive Contents

| Artifact | Status |
|----------|--------|
| `proposal.md` | Present, diff-verified byte-for-byte (204 lines) |
| `design.md` | Present, diff-verified byte-for-byte (685 lines) |
| `tasks.md` | Present, diff-verified byte-for-byte (401 lines) |
| `specs/content-security-policy/spec.md` | Present, diff-verified byte-for-byte (126 lines) |
| `specs/pwa-install-capture-script/spec.md` | Present, diff-verified byte-for-byte (32 lines) |
| `apply-progress.md` | Not written as a file for this change (hybrid mode; content lives only in engram `sdd/content-security-policy/apply-progress`, id 2155) |
| `verify-report.md` | Not written as a file for this change (hybrid mode; content lives only in engram `sdd/content-security-policy/verify-report`, id 2159) |
| `archive-report.md` | Created here |

## Diff Verification (byte-for-byte, per this repo's non-negotiable archive rule)

Every file listed above as "diff-verified" was written using the exact text captured from the source
file via the `Read` tool (no summarization, no re-rendering) and then read back in full; line counts
and content matched the source exactly in every case, including markdown tables, the ASCII data-flow
diagram in `design.md` §2, and emoji/special characters in `tasks.md` (✅, ⏳, →, …, 💿). Zero
differences found in any of the 5 copied/merged files.

**Important caveat on this session's tooling**: this archive was executed with a tool set limited to
`Read`, `Write`, `Edit`, `Glob`, and the `mem_*` Engram tools — **no Bash/shell tool was available**.
"Diff-verified" above means a full-content read-back comparison against the text this agent already
held from reading the source (functionally equivalent to a diff for files not modified between the
two reads), not a `diff`/`cmp` command. No file modification occurred between reading the source and
reading back the copy (single-session, no other writer), so this is a sound verification method here.

## Files Changed (Implementation, from `git diff main...feat/content-security-policy`)

| File | Action |
|------|--------|
| `frontend-react/apps/web-store-pos/scripts/csp-policy.mjs` (+ `.d.mts`, + test) | Added — policy generator, single source of truth |
| `frontend-react/apps/web-store-pos/scripts/csp-nginx.mjs` (+ test) | Added — pure parse/diff/check logic |
| `frontend-react/apps/web-store-pos/scripts/verify-csp.mjs` | Added — build-gate I/O + exit code |
| `frontend-react/apps/web-store-pos/vite.config.ts` | Modified — dev CSP header via `configureServer` plugin hook |
| `frontend-react/deploy/nginx.conf` | Modified — one `add_header Content-Security-Policy-Report-Only … always;` at server level |
| `frontend-react/apps/web-store-pos/app/root.tsx` | Modified — inline install-capture script → `<script src>` |
| `frontend-react/apps/web-store-pos/public/pwa-install-capture.js` | Added — externalised classic script |
| `frontend-react/apps/web-store-pos/package.json` | Modified — `verify-csp.mjs` wired into `build` |
| `frontend-react/turbo.json` | Modified — `globalDependencies: ["deploy/nginx.conf"]` (cache-correctness fix) |
| `frontend-react/e2e/pwa-install-capture.spec.ts` | Added — new Playwright spec |
| `frontend-react/e2e/csp-report-only.spec.ts` | Added — new Playwright spec |
| `frontend-react/e2e/support/csp-violations.ts` | Added — new Playwright support observer |
| `frontend-react/apps/web-store-pos/app/auth/lib/stores/auth-store.ts` | Modified — 1-line unused-import removal, user-authorized (task 1.3), unrelated to CSP |

No existing E2E test (frontend or backend) and no backend production source were touched.

## Implementation Commits (per apply-progress, engram id 2155)

| Commit | Content |
|--------|---------|
| `ecec1420` | `fix(lint): cleared 9 pre-existing eslint errors that had `main` RED` (user-authorized baseline cleanup, precedes WU1) |
| `71ddd20f` | WU1 — `feat(content-security-policy): externalise install-capture script` |
| `65a5ad77` | WU2 — `feat(content-security-policy): policy generator + dev header + Playwright coverage` |
| `6592da16` | follow-up 2.6 — `'report-sample'` in `script-src` + `samplePrefix`/`sampleMatch` allowlist narrowing |
| `0c86773e` | `docs: record the user's Playwright verification of WU1 and WU2` |
| `def14a46` | WU3 — `feat(content-security-policy): production nginx header + build-time drift gate` |
| `9c1dc039` | `docs: amend spec.md` — resolves both verify-report WARNINGs (script-src's `'report-sample'` wording, "No Violations on Real Routes" → unauthenticated routes + allowlist-matcher gap) |

(10 commits total per the task instruction; the remaining 3 are prior branch history not itemized in
apply-progress and not re-derived here since this archive does not run `git log`.)

## Follow-Up Items (open, outlive this change — carried forward, not resolved here)

1. **NOT VERIFIED**: whether `react-router build`'s static SPA output inlines the same hydration
   payload the dev server does. If it does, production carries the same (harmless under report-only)
   violations the dev sweep found and allowlisted.
2. **NOT VERIFIED / must be resolved before enforcing mode**: a deployment built with a cross-origin
   `API_URL` would violate `connect-src 'self'` on every API call. `scripts/verify-csp.mjs` already
   emits a non-fatal WARNING for this at build time; promoting it to a hard failure is explicitly the
   enforcing change's job (design §3).
3. **PENDING (user, manual, non-blocking)**: the DevTools console sweep of authenticated surfaces —
   statistics/recharts, the today-sale PDF export (read the new tab's console — the `blob:` document
   is its own console context), CSV import, roster export, install button (tasks.md §3.7(b)). This is
   intel for the future enforcing change, not a gate on this report-only one.
4. **Open gap, named in the amended spec**: the `KNOWN_DEV_ONLY_VIOLATIONS` matcher in
   `e2e/support/csp-violations.ts` has no automated unit test — it lives outside
   `vitest.config.ts`'s `include` globs (`app/**`, `scripts/**`). Closing it means moving the
   predicate under `scripts/`.
5. **Unrelated, explicitly NOT attributed to this change**:
   `app/auth/routes/__tests__/loaders.cold-boot.test.ts` fails one assertion in the full-suite run.
   Independently confirmed to fail identically on `main`, and confirmed not caused by this branch's
   `auth-store.ts` or `vite.config.ts` edits (each restored from `main` in isolation, failure
   persisted). Also passed earlier the same day, so it is environment-dependent — separate
   investigation, not part of this SDD change.
6. **Enforcing mode itself** remains a separate, future change, gated on the user's decision — not
   scheduled, not scoped here.

## Engram Persistence

- **Project**: store-mgmt
- **Topic key**: `sdd/content-security-policy/archive-report`
- **Type**: architecture
- **Traceability — observation IDs read for this archive**:
  - proposal: id 2141
  - spec (delta specs, both domains): id 2146
  - design: id 2148
  - tasks: id 2152
  - apply-progress: id 2155
  - verify-report: id 2159

## Known Limitation of This Archive Run

The original change folder `openspec/changes/content-security-policy/` (containing `proposal.md`,
`design.md`, `tasks.md`, `specs/content-security-policy/spec.md`,
`specs/pwa-install-capture-script/spec.md`) was **copied, not moved**, into
`openspec/changes/archive/2026-08-11-content-security-policy/` and into `openspec/specs/`. This
session's tool set had **no Bash/shell/delete capability** (only `Read`, `Write`, `Edit`, `Glob`, and
Engram `mem_*` tools), so the original folder could not be removed after the diff-verified copy.

**Action required from the orchestrator/user before or as part of the commit**: after confirming this
report's diff-verification claims, run
`git rm -r openspec/changes/content-security-policy` (or an equivalent `git mv` of the same content
already staged as new files) so the active `openspec/changes/` directory no longer lists this change
as open, and stage the new files under `openspec/specs/content-security-policy/`,
`openspec/specs/pwa-install-capture-script/`, and
`openspec/changes/archive/2026-08-11-content-security-policy/`.
