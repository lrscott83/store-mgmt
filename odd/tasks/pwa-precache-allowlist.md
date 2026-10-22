# PWA precache — blocklist to allowlist

Objective: the service worker precaches exactly the closure of routes that must
render offline plus the static shell, instead of "everything matching a glob
minus a blocklist". Branch `test`. Delivery: work-unit commits on the feature
branch, ordinary repo policy for push/PR. Runner: `node scripts/verify-sw-precache.mjs`,
`npx vitest run scripts/__tests__`, Playwright PWA config for E2E.

## Specs

S1. `OFFLINE_ROUTE_IDS` in `scripts/precache-patterns.mjs` is the single, explicit
list of routes that must render offline. It includes, per the owner's decision of
2026-10-22: root/landing, auth layout, login, provision, POS layout, sales
(products, sale, cash-closing, wholesale, today-orders, orders, today-stats,
today-credits, credits), inventory (all 11 routes), expenses (2), reports (1),
statistics (dashboard, cuadre-por-fechas), sync (export, import),
`management-channel-rates` (exchange rates, owner requirement), public layout,
diagnostics, help/tutorial, legal (2) and the catch-all 404.

S2. Routes that require the API are NOT precached: `auth/routes/register`,
`sales/routes/web-catalog`, `sales/routes/ordering-*`, `catalog/routes/public-catalog`,
`management/*` EXCEPT `management-channel-rates`, `admin/*`, `profile/*`,
`shared/routes/health`. `diagnostics/routes/diagnostics` is precached on purpose:
its whole purpose is a device without a session or a network.

S3. The precache set is resolved from the built route manifest, not from chunk
names: every listed route contributes its module, its `imports`, its `css` and
the same for each ancestor (`parentId` chain), plus `entry.{module,imports,css}`;
the JS graph is then walked on disk, including dynamic imports, so lazily loaded
libraries reachable from an offline route stay precached.

S4. Static shell families stay precached: `*.html`, `manifest.webmanifest`,
`favicon.png`, `icons/*.png`, `images/**/*.png` (6 tutorial screenshots),
`fonts/**/*.woff2` (5), the CSS named by the route manifest, and every local
asset those HTML documents reference (root `pwa-install-capture.js`, landing's
externalized `bootstrap-*.js`). The 76 KB `assets/server-build-*.css` SSR
leftover is not precached because no manifest entry and no HTML references it.

S5. `build-sw.mjs` injects exactly the resolved set. `verify-sw-precache.mjs`
fails the build when: an offline route id no longer exists in the route manifest,
a referenced chunk is missing on disk or dropped by the size limit, the injected
manifest differs from the resolved set in either direction, the shell/route
manifest counts are off, a required family is off its count, or a chunk matching
`FORBIDDEN_PRECACHE_PREFIXES` reaches the manifest.

S6. `frontend-react/e2e/precache-split.spec.ts` reflects the new contract:
management and both catalog chunks move from "precached" to "not precached".
No other assertion in that spec changes (owner authorization, 2026-10-22).

S7. The active `openspec/changes/pwa-offline-shell` specs stop claiming that
`/admin/*`, `/management/*` and `/profile/*` render offline, and describe the
allowlist instead of glob patterns + ignore list.

## Tasks

- T1 — feature doc + read current mechanism (this file). inline.
- T2 — S1/S3: `precache-patterns.mjs` + new `precache-plan.mjs` (pure planner). inline.
- T3 — S4/S5: `build-sw.mjs` + `verify-sw-precache.mjs` + `precache-diff.mjs`. inline.
- T4 — unit tests: `precache-plan.test.mjs` (new), `precache-diff.test.mjs`,
  `precache-built-invariants.test.mjs`. inline.
- T5 — S6: E2E spec update. inline.
- T6 — S7: openspec spec updates. inline.
- T7 — build + verify + vitest + independent verifier. delegated (verification).

## Log

L1 (verbatim): "dale con todos esos pasos"

L2 (verbatim): "Autorizo actualizarlo (Recomendado)" — owner authorizes updating
`frontend-react/e2e/precache-split.spec.ts` so management and catalog leave the
precached set.

L3: prior commit `f18f83b5` already excluded `web-catalog`, which broke
`precache-split.spec.ts:107`. Reported to the owner before continuing; the E2E
run was never executed in that step (only vitest) — process defect recorded.

L4: owner chose scope option 1: "Solo lo que no necesita red" — offline keeps
login, landing, POS operational routes, help/tutorial, legal and diagnostics;
admin, management, profile and public catalog leave the precache. Measured
estimate for the extra cut: ~94 KB (admin 13 KB, management 26 KB, profile 10 KB,
public catalog 45 KB).

L5 (verbatim): "continua, pero no debes excluir ni tasas de cambios ni el
diagnistico" — exchange rates (`management-channel-rates`) is added to the
offline set and removed from the forbidden prefixes; diagnostics was already
precached and stays. Management keeps only that route.

L6: independent verification returned FAIL with B1 (spec contradiction), B2
(verifier blind to a planned asset over the size limit) and A2
(`pwa-install-capture.js` + landing `bootstrap-*.js` referenced by precached HTML
but dropped from the plan). Fixed all three plus A1 (pinned allowlist test).
Observed after correction: `build-sw`/`verify-sw-precache` OK with 189 entries
and 40 offline routes; `vitest run scripts/__tests__` 118/118; Playwright
`precache-split` 3/3; lowering MAX_FILE_SIZE_BYTES to 1000 makes the verifier
fail naming the oversized planned assets. The independent recheck could not run
(provider quota), so verification is recorded as partial, not PASS.

L7: native RDD review (lineage review-e6897f0a2cf87465, 13 files, medium) ended
`escalated` / `native_stop_required`, no approval and no receipt. Findings:
risk lens clean; resilience warned that CSS reachable only through a chunk's
Vite dependency array was not collected (the old glob precached every CSS) and
that the HTML scanner accepted only double-quoted attributes; readability warned
about the ancestry walk duplicated in planner, verifier and test; reliability
raised a CRITICAL about the success stdout of both scripts being rewritten
unrequested — admission downgraded it (`unverified_location`) and escalated on
unknown causality, and no repository consumer of those lines exists (the
`build-sw:` and `verify-sw-precache: OK` prefixes were preserved).
Corrections applied: `extractCssUrls` feeds the plan from chunk dependency
arrays, `extractHtmlAssetUrls` accepts double/single/unquoted attributes,
`resolveOfflineRouteIds` is exported and reused by the verifier and the
built-invariants test, and both success messages are back to their original
wording. Observed: gate OK with 189 entries, `vitest` 124/124, E2E 3/3.

L8: second native review (lineage review-e3ff917f9f7314b5, target
sha256:b0cc2335…, 13 files, 1668 lines) returned **approved**; the exact
acknowledgement ran once and reported `authority: burned`. No correction was
offered. Fourteen informational advisories remain, none blocking: duplicated
route-manifest discovery between the injector and the gate (R2-001), an
unreachable CSS/manifest comparison (R2-002), the built-output invariants
skipping themselves when no build exists (R3-1 / R4-built-invariants-skipped), no
automated coverage of the verifier's fatal wiring (R3-2), vacuous-by-prefix E2E
negatives (R3-3), a manifest parser keyed on the `[{"revision"` literal (R3-4),
`toAssetUrl` boundary branches untested (R3-5), a plan entry with an empty
`module` degrading silently (R4-empty-module-silent-gap), the allowlist count
literal triplicated (R2-005), overlapping missing-file buckets (R2-006), and
duplicated scanners in the invariant test (R2-003/R2-004).
