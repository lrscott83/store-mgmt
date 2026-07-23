# Proposal: toast-notifications-parity

## Intent

**Problem.** The React app (`frontend-react`) does not reproduce Angular's `ngx-toastr`
notifications. Angular is the source of truth: it fires non-blocking, auto-dismissing (1000ms),
top-right toasts at 7 live call sites. React currently substitutes these with a mix of blocking
SweetAlert2 dialogs, inline banners, and — in one case — nothing at all. The result is three
distinct parity defects:

1. **Wrong modality/timing.** 5 of 7 sites surface as a *blocking* Swal (user must click OK) or
   an inline box, instead of a 1s auto-dismissing toast.
2. **Lost titles.** Success sites that carry a `SUCCESS_TITLE` ("Éxito") in Angular drop the
   title in React (#2 cart-create, #6 features-activated), because the React catalog is missing
   the `GENERAL.RESPONSE.SUCCESS_TITLE` key.
3. **A functional gap.** The order-creation-failure notification
   (`SHOPPING_CART.ORDER_NOT_CREATED`, #3) is **entirely absent** in React — the cart shows a
   generic inline error (`GENERAL.ERROR`) instead of the specific Angular toast.

**Why now.** This is the final identified divergence in the notification layer of the ongoing
Angular→React presentation-parity effort. The relevant specs (`admin/spec.md` PAGE-5/PAGE-6) are
already stale versus the shipped code, so leaving this open keeps documented contracts wrong.

**Success looks like.** React fires the same 7 toasts as Angular, in the same places, with the
same trigger conditions, the same 1000ms auto-dismiss, top-right position, close button, and
dedupe — with **text content byte-identical** to the existing React i18n catalog (which itself
mirrors Angular). Design/colors use `react-toastify`'s library defaults (Rule 12: no bespoke
toast system). The stale specs are updated to match.

## Scope (in-scope)

Migrate the **7 live Angular `ngx-toastr` call sites** to React toasts via `react-toastify`:

| # | Trigger | Angular text (key) | React "before" → "after" |
|---|---------|--------------------|--------------------------|
| 1 | CSV import success | literal `Importados N productos correctamente.` (no title) | `showBlockingSuccess` Swal → success toast |
| 2 | Order create success | `SHOPPING_CART.ORDER_CREATED` + `SUCCESS_TITLE` "Éxito" | `showBlockingSuccess` Swal (title lost) → success toast **with** restored title |
| 3 | Order create failure | `SHOPPING_CART.ORDER_NOT_CREATED` + corrected `ERROR_TITLE` | **missing** (generic inline error) → **new** error toast |
| 4 | Sync import success | `SYNCHRONIZATION.RECEIVE_IMPORT_SUCCESS` (no title) | inline `<InfoBox>` → success toast |
| 5 | Features activate HTTP error | `FEATURES.UNEXPECTED_ERROR` + corrected `ERROR_TITLE` | `showBlockingError` Swal → error toast |
| 6 | Features activate success | `FEATURES.FEATURES_ACTIVATED` + `SUCCESS_TITLE` "Éxito" | `showBlockingSuccess` Swal (title lost) → success toast **with** restored title |
| 7 | Features `succeeded:false` | same as #5 | `showBlockingError` Swal → error toast |

Also in scope:

- **Add `react-toastify`** as a dependency and mount a single `<ToastContainer>` in
  `apps/web-store-pos/app/root.tsx` `Layout`, configured to mirror Angular's
  `ToastrModule.forRoot`: `position="top-right"`, `autoClose={1000}`, `closeButton`, and
  duplicate prevention (via stable `toastId` per message, mirroring `preventDuplicates: true`).
- **Add a thin `shared/lib/toast.ts` helper** (sibling of `blocking-alert.ts`) exposing declarative
  named functions (`showToastSuccess`, `showToastError`, with optional title args) so call sites
  stay declarative and unit tests mock the module directly rather than mocking `react-toastify`.
- **Fix the Angular missing-key title bug** (#3/#5/#7): Angular's `GENERAL.RESPONSE.ERROR` key
  does not exist, so its toasts render the literal string `"GENERAL.RESPONSE.ERROR"` as the title.
  React uses the correct `ERROR_TITLE` ("Error") — the toast **message stays identical to Angular**;
  only the broken title is corrected. (This matches what `features.tsx` already does today.)
- **Add the missing i18n key** `GENERAL.RESPONSE.SUCCESS_TITLE` ("Éxito") to the React catalog,
  needed for the #2 and #6 success-toast titles. All other message text remains byte-identical to
  the existing React catalog keys.
- **Narrowly supersede stale specs:** update `frontend-react/openspec/specs/admin/spec.md`
  PAGE-5/PAGE-6 ("inline only / no toast") to reflect the toast, and note that the
  `frontend-parity-audit` "inline (not toastr)" decision is superseded.

## Approach

**Library + container (Rule 12 — use the library, build nothing bespoke).** `react-toastify` is
the closest analogue to `ngx-toastr`; its `<ToastContainer>` props map 1:1 to the Angular global
config. Mount exactly one container in `root.tsx` `Layout`, alongside `<I18nProvider>`:

```
<ToastContainer position="top-right" autoClose={1000} closeButton />
```

Dedupe (Angular's `preventDuplicates: true`) is enforced by passing a stable `toastId` derived
from the message so a repeat of the same notification does not stack — implemented inside the
helper, not at call sites.

**Helper wrapper (mirror `blocking-alert.ts`).** Add `shared/lib/toast.ts` next to
`blocking-alert.ts`, following the same documented conventions: small named functions, library
defaults only, no scattered raw `toast()` calls. Signatures follow the two Angular toastr shapes:

- `showToastSuccess(message: string, title?: string)` — covers #1/#4 (message-only) and
  #2/#6 (message + "Éxito" title).
- `showToastError(message: string, title: string)` — covers #3/#5/#7 (message + corrected
  "Error" title).

Call sites import these and pass **existing React i18n catalog keys** (plus the newly added
`SUCCESS_TITLE`), keeping text resolution in the same place it already lives.

**Rewire the 7 call sites.** Replace the current React substitutes:

- Swap `showBlockingSuccess`/`showBlockingError` (Swal) for the toast helper at #1, #2, #5, #6, #7.
- Replace the inline `<InfoBox>` at #4 (sync import) with a success toast.
- At #3 (cart order failure), **remove** the generic inline `setSubmitError(GENERAL.ERROR)` path
  and emit the specific `showToastError(ORDER_NOT_CREATED, ERROR_TITLE)` toast — closing the
  functional gap. (Validation-guard Swals in the cart that have no Angular *toastr* counterpart
  are untouched.)

**Test-first (Strict TDD active).** Every change lands test-first:

1. Unit-test `shared/lib/toast.ts` — asserts each helper calls `react-toastify` with the right
   message, title, and dedupe `toastId`.
2. Per call site, tests mock `shared/lib/toast.ts` and assert the correct helper is invoked with
   the exact catalog key(s) on the exact trigger (success/failure branches), and that the old
   Swal/inline path is gone. #3 gets a new failing test proving the toast now fires on order
   failure. #2/#6 assert the restored title; #3/#5/#7 assert the corrected "Error" title with the
   Angular-identical message.
3. i18n test/assertion covering the new `SUCCESS_TITLE` key.

**Spec supersession (narrow).** Update `admin/spec.md` PAGE-5/PAGE-6 to state the features
activate/error notifications are toasts, and annotate the superseded `frontend-parity-audit`
"inline (not toastr)" note. Immutable archive records are cited as historical context only.

## Out of scope

- **Dead/commented Angular toastr sites** — `login.component.ts` (offline/online status) and
  `sale-product-row.component.ts` (`PRODUCT_ADDED_TO_CART`) are commented out in Angular →
  excluded.
- **Broader admin "no toast" convention** (`admin/spec.md:218,226,…`) — no live Angular toastr
  counterpart. Do NOT broaden the supersession beyond features PAGE-5/PAGE-6.
- **Immutable archive records** (`openspec/changes/archive/…phase4-admin-features/…`) — not edited.
- **`management/spec.md:352`** ("inline OR toast") — already permissive; review only, no change.
- **Toast visual theming / custom components** — library defaults only (Rule 12). Colors and
  animation are `react-toastify` defaults, not an Angular-pixel match (per locked decision:
  design = library defaults, text = identical).
- **Replacing the existing SweetAlert2 blocking-alert system** anywhere else — unrelated dialogs
  (confirms, validation guards, update-available) stay on Swal.
- **Any message-text rewording** — all text stays byte-identical to the existing React catalog.

## Risks / accepted consequences

- **Accepted UX change (explicit).** 5 of 7 call sites change from a *blocking* dialog / inline
  box to a **1000ms auto-dismissing toast**. This is the *literal Angular behavior* and has been
  accepted by the user. Consequence: users no longer click OK to dismiss these, and a fast-moving
  user may not read a 1s toast — this is intended parity, not a regression.
- **#3 is a real functional add, not a re-skin.** The order-failure toast is net-new behavior in
  React; its test must prove the toast fires on the failure branch (and the old generic inline
  error no longer shows).
- **Angular title-bug divergence is intentional.** React shows the correct "Error" title where
  Angular shows a literal broken key. Documented as a deliberate fix; message text is unchanged.
- **Specs were already stale before this change.** `admin/spec.md` PAGE-5/PAGE-6 conflicts with
  the shipped `features.tsx` even today; this change corrects the doc drift as part of scope.
- **Single global container.** Mounting more than one `<ToastContainer>` would double-render
  toasts — the design mandates exactly one in `root.tsx` `Layout`.

## References

- Exploration: `frontend-react/openspec/changes/toast-notifications-parity/explore.md`
  (engram `sdd/toast-notifications-parity/explore`, obs #1458) — full call-site inventory,
  library comparison, and i18n audit.
- Angular config: `frontend/src/app/app.module.ts:50-55`.
- React wrapper pattern to mirror: `frontend-react/apps/web-store-pos/app/shared/lib/blocking-alert.ts`.
- Mount point: `frontend-react/apps/web-store-pos/app/root.tsx` (`Layout`).
