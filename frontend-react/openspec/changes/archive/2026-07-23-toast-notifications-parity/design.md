# Technical Design: toast-notifications-parity

## Context

Angular (`frontend/`) is the source of truth. It fires **non-blocking, 1000ms auto-dismissing,
top-right** toasts via `ngx-toastr` at 7 live call sites. React (`frontend-react`, app
`apps/web-store-pos`, React 19 + React Router 7 + Vite + react-intl) currently substitutes these
with blocking SweetAlert2 dialogs, inline `<InfoBox>` banners, and — for order-create failure —
nothing (a generic inline error). This design migrates all 7 sites to `react-toastify`, adds one
thin helper, one i18n key, and narrowly supersedes the stale `admin/spec.md` PAGE-5/PAGE-6.

**Guiding constraint (Rule 12).** No bespoke toast system. Use the library defaults for
design/colors; the ONLY new code is a thin, mockable helper wrapper modeled on the existing
`shared/lib/blocking-alert.ts`. Text content stays byte-identical to the existing React i18n catalog.

## Architecture overview

```
call sites (7)  ──imports──►  shared/lib/toast.tsx  ──toast.success/error──►  react-toastify bus
                                    │                                              │
                                    │ toastId = message (dedupe)                   ▼
                                    └───────────────────────────────►  <ToastContainer>  (root.tsx Layout)
```

The helper is the single seam. Call sites import declarative named functions; tests mock
`~/shared/lib/toast` directly (never `react-toastify`). `<ToastContainer>` is a global singleton in
`root.tsx` `Layout`. react-toastify uses a global event bus (not React context), so a toast fires
from anywhere in the tree regardless of where the container sits — one container is enough and more
than one would double-render.

---

## 1. Library integration

### 1.1 Dependency

Add to `apps/web-store-pos/package.json` `dependencies`:

```json
"react-toastify": "^11.0.5"
```

`react-toastify@^11` is the React 19-compatible line (app is on `react@^19.1.0`). It is the closest
analogue to `ngx-toastr`: its `<ToastContainer>` props map 1:1 to Angular's global config, and a
stable `toastId` reproduces `preventDuplicates`. (Rejected: `sonner` — no native per-toast duration
or dedupe; `react-hot-toast` — no built-in close button.)

### 1.2 CSS import

Import the library stylesheet in `apps/web-store-pos/app/root.tsx`, next to the existing
`import '@store-mgmt/web-common/styles.css';` (root.tsx:21):

```ts
import 'react-toastify/ReactToastify.css';
```

> Apply note: the CSS subpath is version-dependent. `react-toastify@11` exposes
> `react-toastify/ReactToastify.css`; older lines used `react-toastify/dist/ReactToastify.css`.
> Confirm the exact path against the installed package's `exports` map at apply time.

Stock theme only — no global overrides (mirrors Angular, which imports the stock Bootstrap5 toastr
theme with no overrides: `frontend/src/styles.scss:52-53`).

### 1.3 `<ToastContainer>` mount

Mount exactly ONE container in `root.tsx` `Layout`, in `<body>`, next to `<I18nProvider>`
(root.tsx:56):

```tsx
<body>
  <I18nProvider>{children}</I18nProvider>
  <ToastContainer position="top-right" autoClose={1000} closeButton />
  <ScrollRestoration />
  <Scripts />
</body>
```

Props mirror `ToastrModule.forRoot({ closeButton:true, timeOut:1000, positionClass:'toast-top-right',
preventDuplicates:true })` (`frontend/src/app/app.module.ts:50-55`):

| Angular `forRoot` | react-toastify prop | Value |
|---|---|---|
| `positionClass: 'toast-top-right'` | `position` | `"top-right"` |
| `timeOut: 1000` | `autoClose` | `1000` |
| `closeButton: true` | `closeButton` | `true` (bare prop) |
| `preventDuplicates: true` | — (per-toast `toastId`) | handled in the helper, §2 |

Accepted library-default deviations (locked decision — design = defaults, text = identical):
react-toastify shows a progress bar and uses its own colors/animation; ngx-toastr's Bootstrap5 theme
differs cosmetically. Not a pixel-match — out of scope. Do not add `hideProgressBar`/theme props.

---

## 2. `shared/lib/toast.tsx` helper

### 2.1 Filename decision (`.tsx`, not `.ts`)

The helper renders `title` + `message` together as a small JSX node (ngx-toastr shows the title as a
bold heading above the message; react-toastify has no separate title field — content is a single
node). JSX requires a `.tsx` extension, so the file is `shared/lib/toast.tsx`. The import specifier
stays extension-less (`~/shared/lib/toast`), so call sites and mocks are unaffected. This is the one
deviation from the literal `toast.ts` name in the brief, driven by the JSX title rendering; the
alternative (`React.createElement` inside a `.ts`) is rejected as needlessly obscure.

### 2.2 Shape

Modeled on `blocking-alert.ts`: small named functions, library defaults only, no scattered raw
`toast()` calls, so tests mock this module rather than `react-toastify` in every consumer.

```tsx
import { toast } from 'react-toastify';
import type { ReactNode } from 'react';

/**
 * Renders ngx-toastr's (title, message) shape as a single react-toastify content node.
 * Title-less calls (Angular `success(msg)`) render the bare message string; titled calls
 * (Angular `success(msg, title)` / `error(msg, title)`) render a bold title above the message,
 * mirroring ngx-toastr's default markup.
 */
function toastContent(message: string, title?: string): ReactNode {
  if (!title) return message;
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <p>{message}</p>
    </div>
  );
}

/**
 * Non-blocking success toast. Mirrors Angular `toastrService.success(message[, title])`.
 * Dedupe (Angular preventDuplicates): toastId keyed on the MESSAGE — not the title — so
 * distinct messages sharing the "Éxito"/"Error" title never collapse into one another.
 */
export function showToastSuccess(message: string, title?: string): void {
  toast.success(toastContent(message, title), { toastId: message });
}

/**
 * Non-blocking error toast. Mirrors Angular `toastrService.error(message[, title])`.
 */
export function showToastError(message: string, title?: string): void {
  toast.error(toastContent(message, title), { toastId: message });
}
```

### 2.3 Dedupe rationale (message-keyed `toastId`)

`preventDuplicates: true` in Angular suppresses a second identical toast while the first is live.
react-toastify enforces this via a stable `toastId`: a repeat with the same id is a no-op. The id is
derived from the **message**, NOT the title, because the features success/error toasts share the same
two titles ("Éxito"/"Error") but differ in message — keying on title would wrongly dedupe unrelated
toasts, while keying on message gives each of the 7 notifications a distinct, stable id. The dynamic
CSV message (`Importados N productos correctamente.`) keys on the full interpolated string, which is
correct.

---

## 3. Per-call-site change table

Signatures used: `showToastSuccess(message, title?)`, `showToastError(message, title?)`. All message
and title values come from the **existing** React i18n catalog (plus the new `SUCCESS_TITLE`, §4);
no literals change.

| # | File:line | Calls today | Replacement |
|---|---|---|---|
| 1 | `sales/routes/products.tsx:223` | `await showBlockingSuccess(\`Importados ${csvProducts.length} productos correctamente.\`)` | `showToastSuccess(\`Importados ${csvProducts.length} productos correctamente.\`)` (no title). Drop the `await`; the conditional `showBlockingInfo("...ya existen")` dialog that follows STAYS (it is an Angular info Swal, not a toastr) — no longer sequenced behind an awaited success. |
| 2 | `shared/components/cart-shell.tsx:222` | `showBlockingSuccess(intl.formatMessage({ id: 'SHOPPING_CART.ORDER_CREATED' }))` | `showToastSuccess(intl.formatMessage({ id: 'SHOPPING_CART.ORDER_CREATED' }), intl.formatMessage({ id: 'GENERAL.RESPONSE.SUCCESS_TITLE' }))` — restores the lost "Éxito" title. |
| 3 | `shared/components/cart-shell.tsx:208-211` | `setSubmitError(intl.formatMessage({ id: 'GENERAL.ERROR' }))` (functional gap — generic inline error) | `showToastError(intl.formatMessage({ id: 'SHOPPING_CART.ORDER_NOT_CREATED' }), intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }))` — new specific error toast. See §3.1 for the `submitError` removal. |
| 4 | `sync/components/import-form.tsx:57-59` | `setSuccess(true)` → renders `<InfoBox variant="primary">{SYNC.IMPORT_SUCCESS}</InfoBox>` | `showToastSuccess(intl.formatMessage({ id: 'SYNC.IMPORT_SUCCESS' }))` (no title). Remove the `success` state, `setSuccess` calls, and the `{success && <InfoBox>}` JSX. The `error`/`<InfoBox variant="danger">` path (pre-submit validation: no-file / empty-password) has NO Angular toastr counterpart and STAYS. |
| 5 | `admin/features/routes/features.tsx:24-27` | `showBlockingError(ERROR_TITLE, FEATURES.UNEXPECTED_ERROR)` | `showToastError(intl.formatMessage({ id: 'FEATURES.UNEXPECTED_ERROR' }), intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }))` |
| 6 | `admin/features/routes/features.tsx:22` | `await showBlockingSuccess(FEATURES.FEATURES_ACTIVATED)` | `showToastSuccess(intl.formatMessage({ id: 'FEATURES.FEATURES_ACTIVATED' }), intl.formatMessage({ id: 'GENERAL.RESPONSE.SUCCESS_TITLE' }))` — restores "Éxito" title; drop `await`. |
| 7 | `admin/features/routes/features.tsx:30-33` (catch) | `showBlockingError(ERROR_TITLE, FEATURES.UNEXPECTED_ERROR)` | `showToastError(intl.formatMessage({ id: 'FEATURES.UNEXPECTED_ERROR' }), intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }))` (same as #5) |

Import bookkeeping per file:
- `products.tsx` — remove `showBlockingSuccess` from the `~/shared/lib/blocking-alert` import (keep
  `showBlockingInfo`); add `import { showToastSuccess } from '~/shared/lib/toast';`.
- `cart-shell.tsx` — remove `showBlockingSuccess` from the `blocking-alert` import (keep
  `showBlockingError`, `showAcknowledgeError` — still used by the quantity guards and validation
  Swals); add `import { showToastSuccess, showToastError } from '~/shared/lib/toast';`.
- `import-form.tsx` — add `import { showToastSuccess } from '~/shared/lib/toast';` (the
  `showBlockingError` import stays for the `succeeded:false` / catch error Swals).
- `features.tsx` — replace the `blocking-alert` import entirely with
  `import { showToastSuccess, showToastError } from '~/shared/lib/toast';` (features has no other
  Swal usage).

### 3.1 cart-shell `submitError` removal (the #3 decision)

`submitError` (cart-shell.tsx:66) is written in three places: the `!result.succeeded` branch (:209,
being replaced by the toast), the `catch` (:224), and it is reset to `null` in `handleClear` (:108),
`clearCartAfterSuccessfulOrder` (:151), and at the top of `handleCreateOrder` (:155). It renders the
inline `<p role="alert">` banner at :445-449.

**Decision — remove `submitError` entirely.** Route BOTH failure paths to the same error toast:

- `!result.succeeded` branch (:208-211) → `showToastError(ORDER_NOT_CREATED, ERROR_TITLE)`.
- `catch` (:223-227) → `showToastError(ORDER_NOT_CREATED, ERROR_TITLE)` (drop `err.message`; Angular
  never surfaces a raw exception message — it collapses order failure into the one toast, exactly as
  `import-form.tsx` already collapses sync failures).

Then delete: the `submitError` / `setSubmitError` `useState`, the three `setSubmitError(null)` resets,
and the `{submitError && <p ...>}` JSX block (:445-449).

Rationale: after #3, no Angular-sanctioned writer of `submitError` remains. Keeping a lone inline
banner solely for the JS-exception catch would (a) leak a raw `err.message` Angular never shows and
(b) make order-failure UX inconsistent (toast for `succeeded:false`, banner for a thrown error). The
inline banner is React-invented UI with no Angular counterpart → remove it (Rule 12).

> Assumption to verify at apply: Angular's `NavRightComponent.createOrder` surfaces order failure via
> a single `toastrService.error(ORDER_NOT_CREATED, ...)` in its Observable `error`/failure handler.
> If, and only if, the Angular source shows the exception path does something different, keep the
> catch on a toast anyway (never a raw `err.message`, never a persisted inline banner). Either way,
> `submitError` is removed.

The cart's OTHER user-facing error surfaces are untouched: `showBlockingError` (quantity +/- stock
guards, :139) and `showAcknowledgeError` (empty-cart / payment-less-than-total / credit-without-client
validation Swals, :169-193) have no Angular toastr counterpart and stay on Swal.

---

## 4. i18n

Add ONE key to `apps/web-store-pos/app/shared/lib/i18n/es.ts`, next to `GENERAL.RESPONSE.ERROR_TITLE`
(es.ts:299):

```ts
'GENERAL.RESPONSE.SUCCESS_TITLE': 'Éxito',
```

Every other message/title already exists and is byte-identical to Angular — confirmed keys and text:

| # | Message key | Message text | Title key | Title text |
|---|---|---|---|---|
| 1 | *(literal)* | `Importados ${N} productos correctamente.` | — | — |
| 2 | `SHOPPING_CART.ORDER_CREATED` (es.ts:192) | `La venta fue creada satisfactoriamente.` | `GENERAL.RESPONSE.SUCCESS_TITLE` **(new)** | `Éxito` |
| 3 | `SHOPPING_CART.ORDER_NOT_CREATED` (es.ts:193) | `Ocurrío un error creando la venta...` | `GENERAL.RESPONSE.ERROR_TITLE` (es.ts:299) | `Error` |
| 4 | `SYNC.IMPORT_SUCCESS` (es.ts:733) | `Los datos se importaron correctamente.` | — | — |
| 5 | `FEATURES.UNEXPECTED_ERROR` (es.ts:683) | `Ocurrió un error inesperado activando las funcionalidades` | `GENERAL.RESPONSE.ERROR_TITLE` | `Error` |
| 6 | `FEATURES.FEATURES_ACTIVATED` (es.ts:682) | `Las funcionalidades se activaron satisfactoriamente` | `GENERAL.RESPONSE.SUCCESS_TITLE` **(new)** | `Éxito` |
| 7 | *(same as #5)* | | | |

Intentional Angular-title-bug fix (#3/#5/#7): Angular passes `GENERAL.RESPONSE.ERROR`, a **missing**
key, so its toasts render the literal string `"GENERAL.RESPONSE.ERROR"` as the title. React uses the
correct `ERROR_TITLE` ("Error"). Message text is unchanged; only the broken title is corrected. This
matches what `features.tsx` already does today.

---

## 5. Test strategy (Strict TDD)

All changes land test-first. Consumer tests mock the helper module; the helper's own test mocks
`react-toastify`. Test runner: `vitest run` (per app `test` script).

### 5.1 Helper unit test — `shared/lib/__tests__/toast.test.tsx`

Mock `react-toastify`, assert each function calls the right method with content + message-keyed id:

```tsx
const successMock = vi.fn();
const errorMock = vi.fn();
vi.mock('react-toastify', () => ({
  toast: { success: (...a: unknown[]) => successMock(...a), error: (...a: unknown[]) => errorMock(...a) },
}));
```

Cases:
- `showToastSuccess('msg')` → `toast.success` called with content resolving to `'msg'` and
  `{ toastId: 'msg' }` (no title).
- `showToastSuccess('msg', 'Éxito')` → content renders both `'Éxito'` and `'msg'`; `toastId: 'msg'`.
- `showToastError('msg', 'Error')` → `toast.error` with title+message content; `toastId: 'msg'`.
- Dedupe intent: two success calls with different messages but the SAME title produce two DISTINCT
  `toastId`s (proves message-keying, not title-keying).
  To assert the rendered title/message from the JSX node, use `@testing-library/react`'s `render` on
  the passed content node (mirrors how other content-node tests inspect output).

### 5.2 `<ToastContainer>` integration test — `__tests__/root.test.tsx` (or extend existing)

Mock `react-toastify` with a recording stub component and assert the mirrored config:

```tsx
const containerProps = vi.fn();
vi.mock('react-toastify', () => ({
  ToastContainer: (props: Record<string, unknown>) => { containerProps(props); return null; },
  toast: { success: vi.fn(), error: vi.fn() },
}));
// render <Layout>…</Layout>, then:
expect(containerProps).toHaveBeenCalledWith(
  expect.objectContaining({ position: 'top-right', autoClose: 1000, closeButton: true }),
);
```

### 5.3 Per-call-site tests (mock `~/shared/lib/toast`)

Every consumer test adds:

```ts
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: vi.fn(),
  showToastError: vi.fn(),
}));
```

- **#1 products.test** — CSV import success asserts `showToastSuccess` called with
  `` `Importados ${n} productos correctamente.` `` (no title); the conditional `showBlockingInfo`
  ("ya existen") assertion stays for the `succeeded:false` case.
- **#2 cart-shell.test — CART-07 CHANGES.** It currently asserts `showBlockingSuccessMock` was called
  with `'La venta fue creada satisfactoriamente.'` (test line 586). Change the mock from
  `blocking-alert.showBlockingSuccess` to `toast.showToastSuccess`, and assert:
  `expect(showToastSuccess).toHaveBeenCalledWith('La venta fue creada satisfactoriamente.', 'Éxito')`.
  Remove `showBlockingSuccess` from the `blocking-alert` mock (keep `showBlockingError`,
  `showAcknowledgeError`).
- **#3 cart-shell.test — NEW test (e.g. CART-08).** Make `createOrderMock` resolve
  `{ succeeded: false, ... }`; assert
  `showToastError('Ocurrío un error creando la venta...', 'Error')` fired, `clear` NOT called, cart
  NOT closed, and NO inline `role="alert"` banner is rendered (proves `submitError` removed and the
  functional gap closed). This is the failing-first test for the net-new behavior.
- **#4 import-form.test** — success path asserts `showToastSuccess('Los datos se importaron
  correctamente.')`; assert the old `<InfoBox variant="primary">` success banner is gone; the
  no-file / empty-password / failure error-banner tests stay.
- **#5/#6/#7 features.test — PAGE-5/PAGE-6 CHANGE.** Replace the `blocking-alert` mock with a
  `~/shared/lib/toast` mock. `succeeded:true` → `showToastSuccess(FEATURES_ACTIVATED, 'Éxito')`;
  `succeeded:false` and the `throw` path → `showToastError(FEATURES_UNEXPECTED_ERROR, 'Error')`.
  Keep the "no static `<p>`" assertions (feedback is a transient toast, not a persisted node). The
  double-submit-guard test keeps its structure but asserts on `showToastSuccess`.

### 5.4 i18n assertion

Add an assertion (in the helper or features test, or a small `es.ts` catalog test) that
`esMessages['GENERAL.RESPONSE.SUCCESS_TITLE'] === 'Éxito'`, guarding the new key.

---

## 6. Spec supersession

Edit `frontend-react/openspec/specs/admin/spec.md` PAGE-5/PAGE-6 (currently lines 72-76). Replace:

> **PAGE-5** — When the response has `succeeded === true`, the page MUST display an inline success
> message using the i18n key `FEATURES.FEATURES_ACTIVATED`. No toast is used.
>
> **PAGE-6** — When the response has `succeeded === false` OR the HTTP call throws, the page MUST
> display an inline error message using the i18n key `FEATURES.UNEXPECTED_ERROR`. No toast is used.

with:

> **PAGE-5** — When the response has `succeeded === true`, the page MUST surface a non-blocking
> success **toast** via `showToastSuccess` (`~/shared/lib/toast`), using the i18n key
> `FEATURES.FEATURES_ACTIVATED` as the message and `GENERAL.RESPONSE.SUCCESS_TITLE` ("Éxito") as the
> title, mirroring Angular's `toastrService.success(...)` (`features.component.ts:30-32`). No
> persisted inline message is used. (Supersedes the earlier "inline / no toast" wording and the
> `frontend-parity-audit` "inline (not toastr)" decision — toast-notifications-parity.)
>
> **PAGE-6** — When the response has `succeeded === false` OR the HTTP call throws, the page MUST
> surface a non-blocking error **toast** via `showToastError`, using `FEATURES.UNEXPECTED_ERROR` as
> the message and `GENERAL.RESPONSE.ERROR_TITLE` ("Error") as the title. This intentionally corrects
> Angular's broken `GENERAL.RESPONSE.ERROR` missing-key title; the message text is identical to
> Angular. No persisted inline message is used.

Scope guard: change ONLY PAGE-5/PAGE-6. Do NOT touch the broader admin "no toast" convention
(spec.md:218,226,…) — no live Angular toastr counterpart. Do NOT edit immutable archive records
(`openspec/changes/archive/…phase4-admin-features/…`) — historical citation only.
`management/spec.md:352` ("inline OR toast") is already permissive — review only, no edit.

---

## ADR-style decisions

- **ADR-1 — react-toastify over sonner/react-hot-toast.** Only react-toastify maps 1:1 to
  `ngx-toastr`'s global config (position + per-toast duration + close button + `toastId` dedupe).
  Rejected alternatives lack native duration/dedupe (sonner) or a built-in close button
  (react-hot-toast). Rule 12: use the closest library, build nothing bespoke.
- **ADR-2 — Thin helper `toast.tsx`, modeled on `blocking-alert.ts`.** Keeps call sites declarative
  and makes the toast layer mockable at the module boundary (consumer tests never touch
  `react-toastify`). `.tsx` (not `.ts`) because the title+message content is a JSX node.
- **ADR-3 — Dedupe via message-keyed `toastId`.** Mirrors `preventDuplicates: true`. Keyed on the
  message, not the title, because features success/error share the "Éxito"/"Error" titles but differ
  in message; title-keying would wrongly collapse unrelated toasts.
- **ADR-4 — Remove `submitError` inline banner; route both cart order-failure paths to the error
  toast.** The inline banner is React-invented UI with no Angular counterpart and would leak a raw
  `err.message`. Removing it and firing `showToastError(ORDER_NOT_CREATED, ERROR_TITLE)` on both the
  `succeeded:false` and `catch` paths closes the functional gap consistently. (Assumption flagged for
  apply-time verification against `nav-right.component.ts`.)
- **ADR-5 — Correct the Angular missing-key title (intentional divergence).** React shows "Error"
  where Angular renders the literal broken key `"GENERAL.RESPONSE.ERROR"`. Message text unchanged.
- **ADR-6 — Library-default visuals accepted.** Progress bar, colors, and animation are
  react-toastify defaults, not an Angular pixel-match (locked decision: design = defaults, text =
  identical).
- **ADR-7 — Single global `<ToastContainer>` in `root.tsx` Layout.** react-toastify's global event
  bus means one container serves the whole tree; a second would double-render.

## Risks / open items

- **#3 exception-path parity (ADR-4)** — assumes Angular surfaces order failure through one error
  toast covering both the `succeeded:false` and thrown-error cases. Apply must confirm against
  `nav-right.component.ts`; regardless, `submitError` is removed and failures never show a raw
  `err.message`.
- **CSS import subpath** — version-dependent (`react-toastify/ReactToastify.css` for v11). Verify
  against the installed `exports` map at apply.
- **Accepted UX change** — 5 of 7 sites move from blocking Swal / inline banner to a 1000ms
  auto-dismissing toast. This is the literal Angular behavior, accepted by the user.
- **Stale sibling specs** — `admin/spec.md` PAGE-7 ("no loading/disabled state") is already stale vs
  the shipped `features.tsx` (which has an `isLoading` guard), but it is OUT OF SCOPE here; do not
  broaden the supersession beyond PAGE-5/PAGE-6.
