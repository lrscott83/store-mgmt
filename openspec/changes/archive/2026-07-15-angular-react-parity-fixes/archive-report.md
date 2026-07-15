# Archive Report — angular-react-parity-fixes

**Status**: COMPLETE (ARCHIVED)
**Branch**: `feat/frontend-parity-audit`
**Verify verdict**: PASS WITH WARNINGS — 0 CRITICAL / 2 WARNING / 2 SUGGESTION (engram #1156)
**Archive convention note**: Following this repo's established precedent (5 prior archived
changes: `stage6-sync-parity`, `product-service-parity`, `repository-parity-fixes`,
`eliminate-base-repository`, `eliminate-inventory-repository`), the change folder stays in place
at `openspec/changes/angular-react-parity-fixes/` with this `archive-report.md` added — it is NOT
moved to an `openspec/changes/archive/YYYY-MM-DD-{name}/` subfolder, since no such subfolder has
ever existed in this repo and no `openspec/config.yaml` overrides the default. Delta specs are
merged into the canonical `openspec/specs/{domain}/spec.md` files (see below).

## Scope Delivered

Closed 2 of the original 5 proposed work units as real code changes, confirmed 1 as a verified
no-op, and executed 4 rule-12 removals — after source re-verification caught 2 false premises in
the original proposal (WU1, WU2) before any code was written.

| WU | Outcome | Summary |
|----|---------|---------|
| **WU3** | ✅ Delivered | `shared/lib/http/api-client.ts` response interceptor rewritten: 401 → `useAuthStore.getState().logout()` (replaces inline token/currentUser wipe + unconditional redirect, which contradicted the store's own Decision 1/2); 500 → `showBlockingError` via existing `blocking-alert.ts` Swal idiom; network errors tagged `isNetworkError`. Mirrors Angular's registered `error-interceptor.service.ts`. |
| **WU4** | ✅ Delivered | `sales/lib/csv-product-parser.ts` rewritten with a hand-rolled RFC4180 quoted-comma tokenizer (no `papaparse` dependency added) and `category` made required (`MISSING_CATEGORY` error code), matching Angular's `CsvProductService`/`validateProducts`. |
| **WU-R** | ✅ Delivered (4 items) | Removed 3 rule-12 inventions with zero production call-sites: `InventoryOfflineService.hasAvailableStock`, `OrderOfflineService.getByDateRange`, `storeHttpService.deactivateStore` (+ their dead tests). **Kept** `ReSeller.login?` — the proposal's REMOVE recommendation was itself stale; source grep found a live consumer (`reseller-edit.tsx:80` mirroring Angular's own disabled `login` form control), so the field was correctly retained per the source-of-truth rule. |
| **WU5** | ✅ No-op (verified) | `service-base` reactive-list-state: grepped all live Angular `.items$`/`.fetch()`/`.isLoading$`/`.patchState()` consumers → 5 dropdown-populator form components, already satisfied by React's existing `useEffect` → `listX()` → `useState` idiom. No shared reactive base/Zustand store built (would have been a rule-12 invention). |

## Excluded From Scope

- **WU1 (owner-details / `getOwnerDetailsById`)** — REJECTED after source re-verification.
  Angular's `OwnerDetailsComponent` is imported into `owners.component.ts:32` but never rendered
  anywhere in `owners.component.html` (0 `<app-owner-details>` occurrences) — dead/unreachable
  Angular code, its own template is the unmodified CLI stub `<p>owner-details works!</p>`. Building
  a real detail view or route would be new functionality Angular never shipped (rule 12
  violation), and directly contradicts the already-approved
  `openspec/specs/admin-owners-resellers/spec.md` Non-Requirement: "MUST NOT build Angular dead
  code (e.g., `OwnerDetailsComponent`)." Not specced, not built.
- **WU2 (reseller `deleteReSeller`)** — REJECTED after source re-verification.
  Angular's `resellers.component.ts:47 deleteReSeller(reSeller) {}` is a genuinely empty stub —
  wired to the Delete button in the template but never calls the HTTP service; clicking it does
  nothing. Building a real delete flow would invent behavior Angular's own reseller UI lacks
  (rule 12) and reopen the already-ratified "Resellers Gear Menu — Edit Only" decision (rule 8).
  Not specced, not built.
- **8 Angular dead-code items** (report-derived, call-site-verified, listed in the proposal's
  Scope — OUT): `MessageService`/`Message`, `AddressModel`, `SocialNetworksModel`,
  `DataService.loadProducts`/`loadCategories`, `ConnectionService`/`ConnectionInterceptor`, auth
  registration/forgotPassword/signInGoogle/getSocialToken + createUser/server-logout, i18n
  `setLanguage`, `StoreModuleStateService`. Verify re-confirmed zero occurrences of any of these
  in `frontend-react/`. None ported — remains documented as intentionally excluded, not an
  oversight.

## Verify Result

**PASS WITH WARNINGS** (CRITICAL: 0, WARNING: 2, SUGGESTION: 2) — engram `#1156`.

- `pnpm test` (`frontend-react/apps/web-store-pos`): **114 test files / 1635 tests — ALL PASS**.
- `pnpm exec tsc --noEmit -p .`: clean, zero errors.
- `api-client.test.ts`: 12/12 PASS, explicitly covering 401 delegation + AUTH_MODEL-only clear +
  anti-redirect-loop guard + 500 dialog + network-error tagging.
- All WU3/WU4/WU-R/WU5 verdicts independently re-grounded against Angular source (not trusted from
  apply-progress narrative alone) under playbook rules 3/4/9/10/12.

### Non-Blocking WARNINGs (both carried forward, not remediated by this change)

1. **Process/pipeline gap** — no `tasks` artifact exists for this change (`mem_search` for
   `sdd/angular-react-parity-fixes/tasks` returns nothing; no `tasks.md` file was ever created
   under `openspec/changes/angular-react-parity-fixes/`). The `sdd-tasks` phase was skipped;
   `sdd-apply` proceeded directly from `design.md`'s WU3/WU4/WU-R breakdown. Confirmed this does
   not affect code correctness — `design.md` and apply-progress agree 1:1 and were independently
   re-verified against source during `sdd-verify`. Recorded here rather than backfilled, per
   verify report's own recommendation to note the skip explicitly in the archive report instead
   of retroactively fabricating a tasks artifact.
2. **Minor R9 shape nuance (network-error object)** — Angular's network-error branch discards the
   original error and throws a brand-new `Error` object carrying only `isNetworkError`; React tags
   `isNetworkError` directly onto the original axios error, preserving more information (not a
   byte-identical envelope per rule 9's strict language). Functionally equivalent for the one
   confirmed consumer pattern; no live React consumer currently needs the stricter Angular shape.
   Documented as a "Known Divergence" in `openspec/specs/http-client/spec.md`.

### Suggestions (non-blocking, informational)

1. Angular's `GlobalErrorHandler` (the actual `isNetworkError` consumer beyond the interceptor,
   suppressing network errors from uncaught-error UI) has no React equivalent yet — out of scope
   for WU3, flagged for a future parity pass if React ever needs an uncaught-error UI.
2. The CSV per-row error-diagnostics system itself pre-dates this change and is a standing
   rule-12 deviation from Angular's silent `validateProducts` filter — only `MISSING_CATEGORY` is
   new here (confirmed via `git diff`), not a regression. Documented as a "Known Deviation" in
   `openspec/specs/csv-import/spec.md`.

## Spec Merge

**New capabilities created** (no prior main spec existed):
- `openspec/specs/http-client/spec.md` — 3 ADDED requirements (401 delegation, 500 dialog,
  network-error tagging) + 1 Known Divergence note (WARNING-2).
- `openspec/specs/csv-import/spec.md` — 3 ADDED requirements (quoted-comma parsing, category
  required, numeric price coercion) + 1 Known Deviation note (SUGGESTION-2).

**Existing capabilities updated** (delta merged as new Requirement sections):
- `openspec/specs/service-base/spec.md` — +1 requirement: "Reactive List-State Consumers Are
  Already Satisfied By The Loader/useState Idiom" (WU5 no-op, verification-only).
- `openspec/specs/inventory-service/spec.md` — +1 requirement: "hasAvailableStock Is Removed As
  Rule-12 Invention".
- `openspec/specs/order-service/spec.md` — +1 requirement: "getByDateRange Is Removed As Rule-12
  Invention".
- `openspec/specs/management-stores/spec.md` — +1 requirement: "deactivateStore Is Removed As
  Rule-12 Invention".
- `openspec/specs/admin-owners-resellers/spec.md` — +1 requirement, **corrected during archive**:
  the delta spec at `openspec/changes/angular-react-parity-fixes/specs/admin-owners-resellers/spec.md`
  says `ReSeller.login` MUST be REMOVED, but this is a stale premise — the verify report (and the
  apply-phase code) correctly KEPT the field after finding a live consumer
  (`reseller-edit.tsx:80`). The merged main-spec requirement reflects the actual, verified final
  behavior ("ReSeller Model Retains login Field — Angular's Own Model Is Stale"), not the delta
  file's outdated REMOVE language. The original (incorrect) delta file is left untouched in the
  change folder as a historical record of the design's evolution; it is NOT the source of truth.

The original delta spec files (with their own `ADDED`/`REMOVED` section headers as authored during
`sdd-spec`) remain in this change folder under `specs/{domain}/spec.md` for historical
traceability; the canonical `openspec/specs/{domain}/spec.md` files hold the clean, corrected,
merged form.

## Artifact Traceability (engram)

| Artifact | ID | Status |
|----------|-----|--------|
| proposal | #1143 | CLOSED |
| spec (delta) | #1146 | CLOSED — 1 correction applied during archive (see Spec Merge, admin-owners-resellers) |
| design | #1145 | CLOSED |
| tasks | *none* | SKIPPED — see WARNING-1 |
| verify-report | #1156 | CLOSED |
| archive-report | *this document* | ACTIVE |

## Next Steps

WU3/WU4/WU-R delivered and verified green (1635/1635 tests, clean typecheck). WU5 verified as an
intentional no-op. WU1/WU2 correctly excluded as Angular dead-code traps, never built. All 7
domain specs (2 new, 5 updated) now reflect the verified final behavior. No blocking risks. The 2
non-blocking WARNINGs are process/traceability (missing tasks artifact — informational only) and a
minor non-functional error-object-shape nuance (documented in the http-client spec) — neither
requires follow-up work. Ready for the next change on `feat/frontend-parity-audit`.
