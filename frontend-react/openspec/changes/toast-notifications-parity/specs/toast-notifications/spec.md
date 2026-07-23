# Toast Notifications Specification

**Change:** toast-notifications-parity
**Phase:** Spec
**Status:** Draft
**Date:** 2026-07-23
**Mode:** OpenSpec

---

## Purpose

New capability (no prior React spec). Mirrors Angular `ngx-toastr` 1:1: a single global
`react-toastify` container plus a thin `shared/lib/toast.ts` helper are the ONLY way React
fires non-blocking, auto-dismissing, top-right toasts at the 7 live Angular `toastrService`
call sites. Text stays byte-identical to the existing i18n catalog (one new key added);
design/animation use library defaults (Rule 12 — no bespoke toast system).

---

## Requirements

### Requirement: Toast Container Mount (TOAST-CONTAINER)

The system MUST mount exactly one `<ToastContainer>` (from `react-toastify`) in
`apps/web-store-pos/app/root.tsx` `Layout`, alongside `<I18nProvider>`. It MUST be configured
`position="top-right"`, `autoClose={1000}`, `closeButton` enabled — mirroring Angular's
`ToastrModule.forRoot({ closeButton: true, timeOut: 1000, positionClass: 'toast-top-right' })`.
Duplicate prevention (Angular's `preventDuplicates: true`) MUST be enforced via a stable
`toastId` derived from the message (+ title, if present) inside the helper — never passed ad hoc
by call sites.

#### Scenario: Container mounted once with Angular-equivalent config

- GIVEN `root.tsx` `Layout` renders
- WHEN the app boots
- THEN exactly one `ToastContainer` exists in the tree, configured `position="top-right"`,
  `autoClose={1000}`, `closeButton` enabled

#### Scenario: Duplicate toast suppressed

- GIVEN a toast with message X is currently visible
- WHEN the same message X is fired again via the helper before it dismisses
- THEN no second toast stacks — the shared `toastId` for message X prevents the duplicate

---

### Requirement: Toast Helper Module (TOAST-HELPER)

`app/shared/lib/toast.ts` MUST be the ONLY entry point for firing toasts. Call sites and their
tests MUST NOT import `react-toastify` directly — tests mock this module. It MUST export:

- `showToastSuccess(message: string, title?: string): void`
- `showToastError(message: string, title: string): void`

Both MUST derive `toastId` deterministically from `message` (+ `title`, if present).

#### Scenario: showToastSuccess without a title

- GIVEN `showToastSuccess` is called with only a message
- WHEN it invokes `react-toastify`
- THEN it fires a success toast with that message as body, no title, and a `toastId` derived
  from the message

#### Scenario: showToastSuccess with a title

- GIVEN `showToastSuccess` is called with a message and a title
- WHEN it invokes `react-toastify`
- THEN the fired toast carries both the title and the message

#### Scenario: showToastError always requires a title

- GIVEN `showToastError` is called with a message and a required title
- WHEN it invokes `react-toastify`
- THEN it fires an error toast with both message and title, `toastId` derived from the message

---

### Requirement: Live Call-Site Toasts (TOAST-CALLSITES)

Each of the 7 live Angular `toastrService` call sites MUST fire the matching toast, with the
exact text below, at the trigger described:

| # | Trigger | File | Helper | Message (i18n key = text) | Title (i18n key = text) |
|---|---|---|---|---|---|
| 1 | CSV import success | `sales/routes/products.tsx` | `showToastSuccess` | literal `` `Importados ${N} productos correctamente.` `` | none |
| 2 | Cart order create success | `shared/components/cart-shell.tsx` | `showToastSuccess` | `SHOPPING_CART.ORDER_CREATED` = "La venta fue creada satisfactoriamente." | `GENERAL.RESPONSE.SUCCESS_TITLE` = "Éxito" |
| 3 | Cart order create failure (**NEW**) | `shared/components/cart-shell.tsx` | `showToastError` | `SHOPPING_CART.ORDER_NOT_CREATED` = "Ocurrío un error creando la venta. Por favor, vuelva a intentarlo y si persiste contacte al equipo de soporte técnico." | `GENERAL.RESPONSE.ERROR_TITLE` = "Error" |
| 4 | Sync import success | `sync/components/import-form.tsx` | `showToastSuccess` | `SYNC.IMPORT_SUCCESS` = "Los datos se importaron correctamente." | none |
| 5 | Features activate HTTP error | `admin/features/routes/features.tsx` | `showToastError` | `FEATURES.UNEXPECTED_ERROR` = "Ocurrió un error inesperado activando las funcionalidades" | `GENERAL.RESPONSE.ERROR_TITLE` = "Error" |
| 6 | Features activate success | `admin/features/routes/features.tsx` | `showToastSuccess` | `FEATURES.FEATURES_ACTIVATED` = "Las funcionalidades se activaron satisfactoriamente" | `GENERAL.RESPONSE.SUCCESS_TITLE` = "Éxito" |
| 7 | Features `succeeded:false` | `admin/features/routes/features.tsx` | `showToastError` | same as #5 | same as #5 |

#### Scenario: #1 — CSV import success fires toast

- GIVEN a CSV import completes and `createCsvProducts` succeeds
- WHEN the handler runs
- THEN `showToastSuccess` fires with `` `Importados ${N} productos correctamente.` `` and no title

#### Scenario: #2 — Order create success fires toast with title

- GIVEN the cart's `createOrder` call resolves `succeeded: true`
- WHEN the handler runs
- THEN `showToastSuccess` fires with `SHOPPING_CART.ORDER_CREATED` and title
  `GENERAL.RESPONSE.SUCCESS_TITLE` ("Éxito")

#### Scenario: #3 — Order create failure fires the specific error toast (new behavior)

- GIVEN the cart's `createOrder` call resolves `succeeded: false`
- WHEN the handler runs
- THEN `showToastError` fires with `SHOPPING_CART.ORDER_NOT_CREATED` and title
  `GENERAL.RESPONSE.ERROR_TITLE` ("Error")
- AND the generic `GENERAL.ERROR` inline message is NOT shown

#### Scenario: #4 — Sync import success fires toast

- GIVEN a sync-import submission resolves `succeeded: true`
- WHEN the handler runs
- THEN `showToastSuccess` fires with `SYNC.IMPORT_SUCCESS` and no title

#### Scenario: #5 — Features activate HTTP error fires error toast

- GIVEN `featureHttpService.activateFeatures()` throws
- WHEN the catch branch runs
- THEN `showToastError` fires with `FEATURES.UNEXPECTED_ERROR` and title
  `GENERAL.RESPONSE.ERROR_TITLE` ("Error")

#### Scenario: #6 — Features activate success fires toast with title

- GIVEN `activateFeatures()` resolves `succeeded: true`
- WHEN the handler runs
- THEN `showToastSuccess` fires with `FEATURES.FEATURES_ACTIVATED` and title
  `GENERAL.RESPONSE.SUCCESS_TITLE` ("Éxito")

#### Scenario: #7 — Features `succeeded:false` fires error toast

- GIVEN `activateFeatures()` resolves `succeeded: false`
- WHEN the handler runs
- THEN `showToastError` fires with `FEATURES.UNEXPECTED_ERROR` and title
  `GENERAL.RESPONSE.ERROR_TITLE` ("Error") — same as #5

---

### Requirement: Corrected Error Title, Not Angular's Broken Key (TOAST-ERROR-TITLE-FIX)

For call sites #3, #5, and #7, the toast title MUST resolve to `GENERAL.RESPONSE.ERROR_TITLE`
("Error"). It MUST NOT use Angular's `GENERAL.RESPONSE.ERROR` key, which does not exist in
Angular's own catalog and therefore renders as the literal string `"GENERAL.RESPONSE.ERROR"`.
This is a deliberate, documented fix (matches what `features.tsx` already does today); the
toast **message** text is unchanged from Angular.

#### Scenario: Error toast title is never the broken literal key

- GIVEN any of call sites #3, #5, or #7 fires
- WHEN the toast renders
- THEN its title reads "Error" and never the literal string "GENERAL.RESPONSE.ERROR"

---

### Requirement: Removed Legacy Surfaces at Migrated Sites (TOAST-REMOVED-SURFACES)

At each migrated call site, the prior notification surface MUST be fully removed (no dead
fallback branch):

- #1: `showBlockingSuccess` (Swal) call removed from `products.tsx`
- #2, #6: `showBlockingSuccess` (Swal) calls removed from `cart-shell.tsx` and `features.tsx`
- #3: the generic inline `setSubmitError(intl.formatMessage({ id: 'GENERAL.ERROR' }))` path
  removed from `cart-shell.tsx`'s `createOrder` failure branch (validation-guard Swals with no
  Angular `toastrService` counterpart are untouched)
- #4: the inline `<InfoBox variant="primary">` success box removed from `import-form.tsx`
- #5, #7: `showBlockingError` (Swal) calls removed from `features.tsx`

#### Scenario: No blocking/inline surface remains at a migrated site

- GIVEN any of the 7 call sites fires its notification
- WHEN inspecting the mocked calls/DOM for that trigger
- THEN no `Swal.fire` / `showBlockingSuccess` / `showBlockingError` call occurs
- AND (for #4) no success `<InfoBox>` renders
- AND (for #3) `setSubmitError` is not called with the generic `GENERAL.ERROR` message

---

### Requirement: New i18n Key for Success Titles (TOAST-I18N)

`GENERAL.RESPONSE.SUCCESS_TITLE` MUST be added to `app/shared/lib/i18n/es.ts` with value
"Éxito". All other message text used by the 7 toasts MUST remain byte-identical to the existing
catalog values cited in TOAST-CALLSITES — no rewording.

#### Scenario: New key resolves at runtime

- GIVEN `es.ts` is loaded
- THEN `GENERAL.RESPONSE.SUCCESS_TITLE` is present and equals "Éxito"

#### Scenario: Existing keys are unchanged

- GIVEN the pre-existing keys `SHOPPING_CART.ORDER_CREATED`, `SHOPPING_CART.ORDER_NOT_CREATED`,
  `SYNC.IMPORT_SUCCESS`, `FEATURES.FEATURES_ACTIVATED`, `FEATURES.UNEXPECTED_ERROR`,
  `GENERAL.RESPONSE.ERROR_TITLE`
- WHEN diffed against `es.ts` before this change
- THEN their string values are unchanged
