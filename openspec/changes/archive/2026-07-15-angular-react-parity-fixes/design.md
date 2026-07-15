# Design: angular-react-parity-fixes

> Source of truth: Angular `frontend/src` + React `frontend-react` + playbook. Grounded in actual source reads (call-site grep before every decision — rule 12, per the "grep Angular call-sites first" learning).

## Technical Approach

Five work units, each mirroring Angular's **actual runtime behavior** (not method-name surface, not dead code). Reusing established React idioms only (thin `*-http-service` objects, `blocking-alert.ts` Swal wrapper, error-code→i18n mapping, `useAuthStore`). No new dependency, no new abstraction. Two WUs (WU1, WU2) turned out to be **dead-code traps** once the Angular source was read — decisions below, flagged for confirmation because they deviate from the approved proposal's IN-scope framing.

## Architecture Decisions

### Decision WU1 — owner-details: DO NOT PORT (recommend reclassify OUT)

**Choice**: Add nothing. No `getOwnerDetailsById` on `owner-http-service.ts`, no `owner-details` route/component.
**Evidence**: Angular `OwnerDetailsComponent` template is the CLI stub `<p>owner-details works!</p>` (`owner-details.component.html:1`). It is `imports`-listed in `owners.component.ts:7,32` but **never placed** in `owners.component.html` (verified full read) → unrendered. Its only consumer of `getOwnerDetailsById` (`OwnerService:61`, endpoint `owners/details/{id}`) is that dead stub. The REAL owner detail UI is `EditOwnerDetailsComponent` → already mirrored by React `owner-edit.tsx`.
**Alternatives rejected**: (a) build a real detail view = new UX Angular never had (rule 2/12 violation); (b) port the stub verbatim = a route rendering nothing (zero value). Both fail the WU's own acceptance rule 12.
**Rationale**: Zero live Angular call-site → rule-12 dead code. Belongs in the OUT list.

### Decision WU2 — reseller delete: NO CODE CHANGE (recommend reclassify OUT)

**Choice**: Leave `reseller-card-list.tsx` (Edit-only) and `reseller-http-service.ts` untouched.
**Evidence**: Angular `resellers.component.ts:47 deleteReSeller(reSeller)` has an **empty body** — clicking Delete does nothing, even though wired at `resellers.component.html:51`. Contrast the ESTABLISHED pattern: `owners.component.ts:337 deleteOwner` is REAL (calls service, reloads, no confirm) and React already mirrors it (`owner-card-list.tsx` Delete wired, LIVE). React `reseller-card-list.tsx:14-24` already documents the approved "Edit Only" decision.
**Alternatives rejected**: (a) build a real reseller delete following the owner pattern = invents behavior Angular's reseller component lacks (rule 12) **and** reopens an approved decision (rule 8); (b) add `deleteReSeller` to the http-service for surface parity = dead code (no live Angular caller — the service method exists but the component never invokes it).
**Rationale**: Parity = Angular's actual code behavior (no-op), not method-name surface. React is already correct.

### Decision WU3 — api-client interceptor (the real, high-value fix)

**Choice**: Rewrite `shared/lib/http/api-client.ts` response interceptor to mirror Angular `error-interceptor.service.ts`:
| Case | Angular | React design |
|---|---|---|
| network (`status 0` / timeout / `!response`) | tag `err.isNetworkError=true`, rethrow | set `(err as {isNetworkError?:boolean}).isNetworkError=true` (detect via `!error.response \|\| error.code==='ECONNABORTED'`), rethrow |
| 401 | `authService.logout()` | `useAuthStore.getState().logout()` then rethrow — replaces the current manual token/user wipe + hard `window.location.href='/login'` |
| 500 | `Swal.fire` ERROR_TITLE / ERROR500_MESSAGE | `showBlockingError(title, message)` from `blocking-alert.ts`, then rethrow |
| 403/404/503/default | rethrow | rethrow (no-op) |
**i18n outside React tree**: interceptor is not a component. Read the two keys directly from the existing `shared/lib/i18n/es.ts` messages record (`GENERAL.RESPONSE.ERROR_TITLE:246`, `ERROR500_MESSAGE:248`) — single-locale app, mirrors Angular `translate.instant`. No `useIntl`, no new provider.
**Rationale**: `logout()` already encodes Decision 1 (keep stale token/currentUser) + Decision 2 (skip redirect when on `/login`|`/`), so routing 401 through it **stops the current contradiction** and fixes the redirect-loop. `blocking-alert.ts` is the existing Swal idiom → no new lib (rule 12).
**Test-mandatory**: redirect-loop guard regression (401 while on `/login` must not re-navigate).

### Decision WU4 — CSV parser hardening

**Choice**: Rewrite `sales/lib/csv-product-parser.ts` field tokenizer to be quoted-comma aware (RFC-4180: `"a,b"` = one field, `""` = escaped quote); keep the existing error-code→i18n idiom. Make **category required**: add `MISSING_CATEGORY` to `CsvRowErrorCode`, drop `category?` → `category: string`. Keep `parseFloat` numeric coercion (= Angular `dynamicTyping` for price).
**Alternatives rejected**: add `papaparse` — NOT in `frontend-react` deps (grep: no match). Proposal forbids new deps without approval → hand-roll.
**Angular-divergence note (rule 8, keep)**: Angular `validateProducts` **silently filters** rows missing `category`/`name`/numeric `price`; React already surfaces per-row error codes instead. Preserve React's richer approved behavior; just extend it to category.
**Rationale**: Behavior parity with `Papa.parse({header:true,dynamicTyping:true,skipEmptyLines:true})` + `category` requirement, no dependency.

### Decision WU-R — removals (order + required grep proof)

Delete only after the exact grep shows **no non-test, non-doc consumer** (all verified now):
| # | Target | File:line | Proof (verified) |
|---|---|---|---|
| 1 | `InventoryOfflineService.hasAvailableStock` | `inventory-offline-service.ts:822` | callers = INV-06 tests only |
| 2 | `OrderOfflineService.getByDateRange` | `order-offline-service.ts:101` | `.getByDateRange(` prod-code matches = 0 (only ORD-05 tests) |
| 3 | `storeHttpService.deactivateStore` | `store-http-service.ts:79` | callers = HTTP-9 test only |
| 4 | `ReSeller.login?` | `packages/domain/src/models/store.ts:60` | absent from Angular `reseller.model.ts`; no `.login` reader on the model |

Order: remove method + its dead tests together per target (1→2→3→4), independent commits. Do NOT touch `CreateResellerPayload.login` (`reseller-http-service.ts:6`) — that is a live create-form field (Angular `createReSeller`), unrelated.

## Data Flow (WU3)

    request ──▶ apiClient ──▶ server
                   ▲              │ error
                   │              ▼
        401 logout()      response.interceptor
        500 showBlockingError(es[...])
        net set isNetworkError ──▶ rethrow ──▶ caller

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `shared/lib/http/api-client.ts` | Modify | 401→logout(), 500→showBlockingError, network tag |
| `sales/lib/csv-product-parser.ts` | Modify | quoted-comma tokenizer, category required, MISSING_CATEGORY |
| `inventory/.../inventory-offline-service.ts` | Modify | remove `hasAvailableStock` |
| `sales/.../order-offline-service.ts` | Modify | remove `getByDateRange` |
| `management/stores/.../store-http-service.ts` | Modify | remove `deactivateStore` |
| `packages/domain/src/models/store.ts` | Modify | remove `ReSeller.login?` |
| respective `__tests__/*` | Modify | drop tests for removed methods; add CSV + interceptor tests |
| owner-details route / `owner-http-service.getOwnerDetailsById` | **None** | WU1 not ported (dead code) |
| `reseller-*.{tsx,ts}` | **None** | WU2 mirrors Angular no-op |

## Testing Strategy

| Layer | What | Approach (strict TDD) |
|-------|------|------|
| Unit | CSV: quoted comma, missing category, non-numeric price | RED→GREEN on `parseCsvProducts` |
| Unit | Interceptor: 401→logout (+loop guard), 500→dialog, network tag | mock `apiClient`/`useAuthStore`/`blocking-alert` |
| Unit | Removals: deleted tests gone, suite green | run affected specs |

## Migration / Rollout

No data migration.

## Open Questions (BLOCKING — confirm before tasks/apply)

- [ ] **WU1**: confirm reclassify OUT (dead-code stub, no live call-site) vs. force a stub port. Design recommends OUT.
- [ ] **WU2**: confirm NO CODE CHANGE (mirror Angular no-op) vs. build a real delete. Design recommends NO CHANGE — building it violates rules 8 + 12.
- [ ] If either WU is forced in for literal surface parity, that decision must be recorded as an explicit exception to rule 12.
