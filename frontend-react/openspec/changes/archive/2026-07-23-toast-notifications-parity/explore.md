# Exploration: toast-notifications-parity

Migrate Angular `ngx-toastr` toast notifications to React so React shows the SAME toasts,
in the SAME places, the SAME way, and the SAME timings as Angular (source of truth).
Design/colors may use the React toast library defaults; TEXT CONTENT must be identical.
This SUPERSEDES the earlier decision that mapped Angular toastr → React inline banner / Swal.

## 1. Angular toastr general config (confirmed)

`frontend/src/app/app.module.ts:50-55`, wired via `provideToastr()` (line 71):
```ts
ToastrModule.forRoot({
  closeButton: true,
  timeOut: 1000,               // 1 second
  positionClass: 'toast-top-right',
  preventDuplicates: true,
})
```
- No per-call `timeOut`/`positionClass` overrides anywhere in `frontend/src` (grep confirmed).
- No custom toast component. Stock Bootstrap5 theme: `styles.scss:52-53`
  (`@import 'ngx-toastr/toastr'; @import 'ngx-toastr/toastr-bs5-alert';`), no global overrides.
- `frontend/src/test-setup.ts:40-42` has a 3000ms mock config — test-only, ignore.

## 2-3. Live call-site inventory + current React "before" state

| # | Angular file:line | Method | Message / Title | Trigger | React "before" |
|---|---|---|---|---|---|
| 1 | `csv-product-importer-modal.component.ts:64` | success(msg) | literal `Importados N productos correctamente.` / no title | createCsvProducts success | `sales/routes/products.tsx:223` — `showBlockingSuccess` (Swal), same text, no title |
| 2 | `nav-right.component.ts:213-216` | success(msg,title) | `SHOPPING_CART.ORDER_CREATED` "La venta fue creada satisfactoriamente." / `GENERAL.RESPONSE.SUCCESS_TITLE` "Éxito" | order create success | `cart-shell.tsx:222` — `showBlockingSuccess` (Swal), text OK, TITLE lost |
| 3 | `nav-right.component.ts:223-226` | error(msg,title) | `SHOPPING_CART.ORDER_NOT_CREATED` "Ocurrío un error creando la venta..." / `GENERAL.RESPONSE.ERROR` ← MISSING KEY (Angular bug: shows literal "GENERAL.RESPONSE.ERROR" as title) | order create failure | `cart-shell.tsx:208-211` — FUNCTIONAL GAP: inline `setSubmitError` with generic `GENERAL.ERROR`, not `ORDER_NOT_CREATED` |
| 4 | `receive-data.component.ts:43` | success(msg) | `SYNCHRONIZATION.RECEIVE_IMPORT_SUCCESS` "Los datos se importaron correctamente." | sync import success | `sync/components/import-form.tsx:57-59` — inline `<InfoBox variant="primary">` |
| 5 | `features.component.ts:23-26` | error(msg,title) | `FEATURES.UNEXPECTED_ERROR` / `GENERAL.RESPONSE.ERROR` (same missing-key bug) | activateFeatures HTTP error | `admin/features/routes/features.tsx:24-27` — `showBlockingError` with CORRECT `ERROR_TITLE` (silently fixes the bug) |
| 6 | `features.component.ts:30-32` | success(msg,title) | `FEATURES.FEATURES_ACTIVATED` / `SUCCESS_TITLE` "Éxito" | activateFeatures success | `features.tsx:22` — `showBlockingSuccess`, text OK, TITLE lost |
| 7 | `features.component.ts:34-36` | error(msg,title) | same as #5 | activateFeatures `succeeded:false` | `features.tsx:30-33` — same as #5 |

**Dead (commented out, excluded):** `login.component.ts:58,62,151,154` (offline/online status toasts);
`sale-product-row.component.ts:110-111` (commented `PRODUCT_ADDED_TO_CART`).

## 4. React toast library — recommendation

None installed (`frontend-react` only has `sweetalert2`). **DECISION: `react-toastify`** — closest to ngx-toastr:
`<ToastContainer position="top-right" autoClose={1000} closeButton />` maps 1:1 to
`positionClass`/`timeOut`/`closeButton`; `toastId` covers `preventDuplicates`. Mount at
`root.tsx` `Layout` next to `<I18nProvider>` (`root.tsx:56`). (Alternatives: sonner — no native
duration/dedupe; react-hot-toast — no built-in close button.)

## 5. Decisions/specs to supersede

- `frontend-react/openspec/changes/frontend-parity-audit/apply-progress.md:902-904` — archived note "inline (not SweetAlert/toastr)"; already stale vs code. This change supersedes both that and the later banner→Swal move (commit `e2eaa01`).
- `frontend-react/openspec/specs/admin/spec.md:72-76` (PAGE-5/PAGE-6) — "MUST display an inline success/error message... No toast is used" — conflicts with call sites #5-7, already stale vs code (features.tsx uses Swal). MUST update.
- Immutable archive records (`openspec/changes/archive/2026-06-01-phase4-admin-features/...`) — cite as historical context, do NOT edit.
- Broader admin "no toast" convention (admin/spec.md:218,226,...) — no live Angular toastr counterpart → OUT OF SCOPE; scope supersession narrowly to features PAGE-5/PAGE-6.
- `openspec/specs/management/spec.md:352` ("inline OR toast") — permissive, review only.

## 6. i18n parity

Present/correct in React `es.ts`: `SHOPPING_CART.ORDER_CREATED` (192), `ORDER_NOT_CREATED` (193),
`FEATURES.FEATURES_ACTIVATED` (682), `FEATURES.UNEXPECTED_ERROR` (683 — React already fixed
Angular typo "unb"→"un"), `SYNC.IMPORT_SUCCESS`/`IMPORT_ERROR` (733-734).
**Missing from React:** `GENERAL.RESPONSE.SUCCESS_TITLE` ("Éxito") — needed for #2 and #6 titles.

## Open decisions for proposal

1. **Toast library** — react-toastify (recommended, decided).
2. **Angular missing-key bug** (`GENERAL.RESPONSE.ERROR` shows as literal title on #3/#5/#7):
   fix (use real "Error" title) vs replicate the broken key. Per project Angular-bugs-policy → ask user.
3. **Functional gap** — `SHOPPING_CART.ORDER_NOT_CREATED` order-failure toast is entirely missing in
   React (cart shows generic inline error). Migration must add it.
4. **UX behavior change** — 5 of 7 sites move from blocking Swal → auto-dismissing 1000ms toast
   (this IS the literal Angular behavior).

## Risks

- Order-failure toast (#3) is a real functional gap, not a re-skin.
- `admin/spec.md` PAGE-5/6 already stale vs code before this change starts.
- Blocking Swal → 1s auto-dismiss toast is a genuine UX change (but it's Angular parity).
