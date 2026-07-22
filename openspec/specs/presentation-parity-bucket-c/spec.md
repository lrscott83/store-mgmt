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
the correct action-specific icon on the save/confirm control, mirroring Angular's
`mat-fab extended` buttons with inline mat-icons. Any header `✕` text character MUST
be replaced by `CloseIcon`. The confirm-control icon is NOT always `SaveIcon` —
it MUST match Angular's actual glyph per screen: `edit-order-modal.tsx` uses
`EditIcon` (Angular `edit`), `edit-sale-credit-modal.tsx` and
`sale-credit-payment-modal.tsx` use `PayIcon` (Angular `payment`), and
`edit-inventory-entry-modal.tsx`/`expense-form-modal.tsx` use `SaveIcon` (Angular
`save`). `expense-form-modal.tsx` footer button order MUST be Close-then-Save,
matching Angular and its sibling `edit-inventory-entry-modal.tsx`.

#### Scenario: Header close control uses CloseIcon
- GIVEN one of the 5 modals is open
- WHEN the header renders its close control
- THEN it renders `<CloseIcon/>`, not a literal `✕` character

#### Scenario: Footer confirm control uses the Angular-matched icon
- GIVEN one of the 5 modals is open
- WHEN the footer renders its save/confirm control
- THEN it renders the icon matching Angular's glyph for that screen (`EditIcon`,
  `PayIcon`, or `SaveIcon` per the mapping above) alongside/inside the fab button

### Requirement: Confirmed submit/action controls render as fab

The following confirmed-divergence controls MUST render with fab styling
(`Button variant="fab"`, or a local 40px button matching `mat-mini-fab` for the
circular sale-product-row case), mirroring Angular's `mat-fab`/`mat-mini-fab`,
instead of a raw/plain-variant `<button>`: login submit, register submit,
`UserCreateForm`/`UserDetailsForm` submit, change-password submit, owner
create/edit details submit, reseller create/edit details submit,
`sale-product-row.tsx` circular action button, `expense-form-modal.tsx` submit
(from `variant="outline"` → `fab`). Each fab MUST also render Angular's matching
mat-icon glyph: `LoginIcon` (login), `LockOpenIcon` (register), `PlusIcon` (create
forms: owner-create, reseller-create, UserCreateForm), `EditIcon` (edit forms:
owner-edit, reseller-edit, UserDetailsForm, change-password-form).
`sale-product-row.tsx` MUST use a local 40px button (`mat-mini-fab`), NOT the
56px `FloatingButton` component (`mat-fab`) — the two sizes are visually and
semantically distinct in Angular and must not be conflated.

#### Scenario: Submit control renders as fab with the correct glyph
- GIVEN one of the listed screens/modals renders its confirmed submit/action control
- WHEN inspecting the rendered button
- THEN it uses `Button variant="fab"` (or a local 40px `mat-mini-fab`-equivalent
  button for `sale-product-row.tsx`)
- AND NOT a raw/plain/outline-variant `<button>`
- AND it renders the Angular-matching icon glyph for that screen

### Requirement: Password eye icon direction matches Angular

The eye icon on every password toggle MUST show `EyeIcon` (open eye) when the
password is currently revealed (`type="text"`) and `EyeOffIcon` (crossed eye) when
hidden (`type="password"`), mirroring Angular's
`showPassword ? 'visibility' : 'visibility_off'` (open eye = revealed state).

#### Scenario: Eye icon shows open when password is visible
- GIVEN a password field's `showPassword` state is `true` (`type="text"`)
- WHEN the toggle icon renders
- THEN it renders `EyeIcon` (open eye), not `EyeOffIcon`

#### Scenario: Eye icon shows crossed when password is hidden
- GIVEN a password field's `showPassword` state is `false` (`type="password"`)
- WHEN the toggle icon renders
- THEN it renders `EyeOffIcon` (crossed eye), not `EyeIcon`

### Requirement: Owner/reseller edit toolbar add-button parity

`admin/owners/routes/edit.tsx` and `admin/resellers/routes/edit.tsx` MUST each
render a toolbar "+" fab (`PlusIcon` + `Button variant="fab"`), distinct from the
details-form submit fab, mirroring Angular's unconditional toolbar fab
(`edit-owner.component.html:4-9`, `edit-reseller.component.html:4-9`). Angular's
own click handlers (`openCreateOwnerModal`/`navigateToCreateReSeller`) are empty
no-ops in Angular source — React's `onClick` MUST mirror this literally as a
no-op, not a real create flow.

#### Scenario: Toolbar add-button renders as a distinct fab
- GIVEN the owner-edit or reseller-edit screen renders
- WHEN inspecting the toolbar
- THEN a `PlusIcon` fab renders distinct from the details-submit fab
- AND clicking it performs no action (mirrors Angular's empty handler)

### Requirement: Expense modal save label toggles INSERT/UPDATE

`expenses/components/expense-form-modal.tsx` MUST bind its save button label to
`GENERAL.INSERT` ("Adicionar") in create mode and `GENERAL.UPDATE` ("Actualizar")
in edit mode, not a hardcoded `GENERAL.SAVE` ("Salvar"), mirroring
`edit-expense-modal.component.html:74-77` and the sibling pattern already used in
`inventory/components/edit-inventory-entry-modal.tsx:213-215`.

#### Scenario: Save label reflects create vs edit mode
- GIVEN the expense modal is open in create mode
- WHEN the footer save button renders
- THEN its label equals `GENERAL.INSERT` ("Adicionar")
- AND WHEN the modal is open in edit mode instead
- THEN its label equals `GENERAL.UPDATE` ("Actualizar")

## Non-Goals (explicitly excluded)

- `today-report.tsx` refresh button — low-confidence match (label/icon differ from
  Angular's generate-report-download); left unchanged.
- `edit-order-details-modal.tsx` — ratified dead/unwired component (prior Fase-6
  decision); left unchanged.
- `sync/components/import-form.tsx` / `export-form.tsx` — share the same inverted
  eye-icon bug pre-existing before this change; explicitly out of scope, left
  untouched (candidate for a future batch).
