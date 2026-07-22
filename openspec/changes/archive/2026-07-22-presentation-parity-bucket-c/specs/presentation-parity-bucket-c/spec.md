# Presentation Parity — Bucket C Specification

## Purpose

Mechanical Angular→React presentation parity for 4 classes of UI divergence: missing
password-visibility toggles, a mislabeled close button, modals missing the
CloseIcon/SaveIcon convention, and raw `<button>` elements where Angular renders a
`mat-fab`/`mat-mini-fab`. No new behavior, capability, or abstraction — every
requirement below is "React MUST render/behave exactly as Angular's `<component>`."

## Requirements

### Requirement: Password visibility toggle parity

Each password `<input>` on the 6 screens below MUST render a toggle control that
flips `type` between `password` and `text` and swaps `EyeIcon` (hidden state) ↔
`EyeOffIcon` (visible state), mirroring Angular's `showPassword` boolean + the
`visibility`/`visibility_off` mat-icon suffix. Default state on mount MUST be
hidden (`type="password"`, `EyeIcon` shown).

| Screen | Field(s) |
|---|---|
| `auth/routes/login.tsx` | password |
| `auth/routes/register.tsx` | password, confirm password (2 fields) |
| `management/users/components/UserCreateForm.tsx` | password |
| `profile/components/change-password-form.tsx` | password |
| `admin/owners/routes/create.tsx` | password |
| `admin/resellers/routes/create.tsx` | password |

#### Scenario: Toggle flips input type and icon
- GIVEN a password field renders with `type="password"` and `EyeIcon`
- WHEN the user activates the toggle
- THEN the input's `type` becomes `text` and the icon becomes `EyeOffIcon`
- AND WHEN activated again, `type` returns to `password` and `EyeIcon` reappears

#### Scenario: Default state is hidden
- GIVEN any of the 6 screens above mounts
- WHEN the password field first renders
- THEN `type="password"` and `EyeIcon` is shown, with no user interaction required

### Requirement: Cancel button reads "Cerrar"

`edit-inventory-entry-modal.tsx` and `expense-form-modal.tsx` MUST bind their
cancel/close control to i18n key `GENERAL.CLOSE` ("Cerrar"), not `GENERAL.CANCEL`
("Cancelar"), matching Angular's `GENERAL.CLOSE` binding on the equivalent button.

#### Scenario: Modal close control shows "Cerrar"
- GIVEN either modal is open
- WHEN the footer close/cancel button renders
- THEN its label text equals "Cerrar"

### Requirement: Modal Close/Save icon parity

The footer/header controls of `edit-order-modal.tsx`, `edit-sale-credit-modal.tsx`,
`sale-credit-payment-modal.tsx`, `edit-inventory-entry-modal.tsx`, and
`expense-form-modal.tsx` MUST render `CloseIcon` on the close/cancel control and
`SaveIcon` on the save/confirm control, mirroring Angular's `mat-fab extended`
buttons with inline `close`/`save` mat-icons. Any header `✕` text character MUST
be replaced by `CloseIcon`.

#### Scenario: Header close control uses CloseIcon
- GIVEN one of the 5 modals is open
- WHEN the header renders its close control
- THEN it renders `<CloseIcon/>`, not a literal `✕` character

#### Scenario: Footer save control uses SaveIcon
- GIVEN one of the 5 modals is open
- WHEN the footer renders its save/confirm control
- THEN it renders `<SaveIcon/>` alongside/inside the fab button

### Requirement: Confirmed submit/action controls render as fab

The following confirmed-divergence controls MUST render with fab styling
(`Button variant="fab"`, or `FloatingButton` for the circular case), mirroring
Angular's `mat-fab`/`mat-mini-fab`, instead of a raw/plain-variant `<button>`:
login submit, register submit, `UserCreateForm`/`UserDetailsForm` submit,
change-password submit, owner create/edit details submit, reseller create/edit
details submit, `sale-product-row.tsx` circular action button (→ `FloatingButton`),
`expense-form-modal.tsx` submit (from `variant="outline"` → `fab`).

#### Scenario: Submit control renders as fab
- GIVEN one of the listed screens/modals renders its confirmed submit/action control
- WHEN inspecting the rendered button
- THEN it uses `Button variant="fab"` (or `FloatingButton` for `sale-product-row.tsx`)
- AND NOT a raw/plain/outline-variant `<button>`

## Non-Goals (explicitly excluded)

- `today-report.tsx` refresh button — low-confidence match (label/icon differ from
  Angular's generate-report-download); left unchanged.
- `edit-order-details-modal.tsx` — ratified dead/unwired component (prior Fase-6
  decision); left unchanged.

## Conditional Note (verify at apply time)

Owner-edit / reseller-edit toolbar "+" add-button: mirror ONLY if apply-time
inspection of `edit-owner.component.html:5` / `edit-reseller.component.html:5`
confirms Angular renders a toolbar fab distinct from the details submit button.
If unconfirmed, skip and defer to Bucket B — do not include in this change's
acceptance criteria.

---

## Note: This is the delta spec as originally authored (pre-parity-review)

This file preserves the original delta spec verbatim for audit-trail purposes.
The canonical, post-parity-review spec (including Round 2 fixes: eye-icon
direction, per-screen action glyphs, WU5 toolbar fab, and the expense
INSERT/UPDATE label fix) lives at
`openspec/specs/presentation-parity-bucket-c/spec.md`.
