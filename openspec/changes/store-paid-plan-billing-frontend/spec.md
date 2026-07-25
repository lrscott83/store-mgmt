# Delta Spec: store-paid-plan-billing-frontend

Source: `docs/superpowers/plans/2026-07-25-store-paid-plan-billing-frontend.md` +
`docs/superpowers/specs/2026-07-25-store-paid-plan-billing-enforcement-design.md`. NEW feature
work (no Angular source to mirror). Covers 4 domains: `auth` (delta, additive),
`management-stores` (delta), `billing-notification` (new), `billing-collections` (new).

---

## Domain: auth (Modified — additive)

### Requirement: Payment Billing Fields on UserModel from getMe

The system MUST map `paymentDueDate`, `isInTrial`, `paymentStatus` from the `getMe` response onto
`UserModel`. Fields absent from the response MUST default to `null`, `false`, `'NoAplica'`
respectively.

#### Scenario: Fields present in response
- GIVEN `getMe` resolves with `paymentDueDate: '2026-03-10'`, `isInTrial: true`, `paymentStatus: 'PorVencer'`
- WHEN `authHttpService.getMe()` maps the response
- THEN `UserModel.paymentDueDate` is `'2026-03-10'`, `isInTrial` is `true`, `paymentStatus` is `'PorVencer'`

#### Scenario: Fields absent from response (backend not yet returning them)
- GIVEN `getMe` resolves without `paymentDueDate`/`isInTrial`/`paymentStatus`
- WHEN `authHttpService.getMe()` maps the response
- THEN `paymentDueDate` is `null`, `isInTrial` is `false`, `paymentStatus` is `'NoAplica'`

---

## Domain: management-stores (Modified)

### Requirement: PlanPicker Read-Only Lock After Plan Activation

`PlanPicker` MUST accept a `readOnly` prop. When `true`, plan tabs MUST still render, but the
"Activar este plan" button MUST NOT render and `onChange` MUST NOT fire on tab interaction.
`store-form` MUST compute `readOnly={!isSuperAdmin && paymentStartDate != null}`.

#### Scenario: Activated owner sees a locked picker
- GIVEN a store with `paymentStartDate` set and the current user is not super admin
- WHEN the edit form renders `PlanPicker`
- THEN `readOnly` is `true`: tabs render, no "Activar este plan" button renders, and clicking a tab does not call `onChange`

#### Scenario: Super admin keeps full control
- GIVEN a store with `paymentStartDate` set and the current user is super admin
- WHEN the edit form renders `PlanPicker`
- THEN `readOnly` is `false`: the "Activar este plan" button renders and tab clicks call `onChange`

#### Scenario: Create mode is always interactive
- GIVEN a new store with no `paymentStartDate` (create mode)
- WHEN the create form renders `PlanPicker`
- THEN `readOnly` is `false` regardless of the current user's role

---

## Domain: billing-notification (New capability)

### Requirement: Payment Status Banner Visibility Matrix

`PaymentBanner` MUST render based on `useAuthStore().user.paymentStatus` and `isInTrial`, in
neutral Latin American Spanish (no voseo), per this matrix:

| paymentStatus | isInTrial | Banner shown |
|---|---|---|
| `NoAplica` | any | hidden |
| `AlDia` | any | hidden |
| `PorVencer` / `EnGracia` | `true` | trial notice (with due date) |
| `PorVencer` / `EnGracia` | `false` | due notice (with due date) |
| `Vencido` | any | overdue notice |

#### Scenario: Hidden for NoAplica or AlDia
- GIVEN `paymentStatus` is `'NoAplica'` or `'AlDia'`
- WHEN `PaymentBanner` renders
- THEN nothing renders

#### Scenario: Trial notice
- GIVEN `paymentStatus` is `'PorVencer'` (or `'EnGracia'`) and `isInTrial` is `true`
- WHEN `PaymentBanner` renders
- THEN the trial notice renders with the formatted `paymentDueDate`

#### Scenario: Due notice
- GIVEN `paymentStatus` is `'PorVencer'` (or `'EnGracia'`) and `isInTrial` is `false`
- WHEN `PaymentBanner` renders
- THEN the due notice renders with the formatted `paymentDueDate`

#### Scenario: Overdue notice
- GIVEN `paymentStatus` is `'Vencido'`
- WHEN `PaymentBanner` renders
- THEN the overdue notice renders, regardless of `isInTrial`

---

## Domain: billing-collections (New capability)

### Requirement: Collections View Lists Stores To Collect

The collections route MUST list stores returned by `getStoresToCollect`, one row per store with
columns store name, owner, amount, due date, status; amounts MUST format via `formatCurrency`.
Clicking "Registrar pago" MUST call `registerStorePayment(storeId)` and then reload the list. An
empty result MUST show an empty-state message instead of a table.

#### Scenario: Rows render with formatted amount
- GIVEN `getStoresToCollect` resolves two stores
- WHEN the collections page renders
- THEN both rows show store/owner/due-date/status, with amount formatted via `formatCurrency`

#### Scenario: Mark-paid records the payment and reloads
- GIVEN a rendered row for store `storeId`
- WHEN "Registrar pago" is clicked
- THEN `registerStorePayment(storeId)` is called, and the list reloads afterward

#### Scenario: Empty state
- GIVEN `getStoresToCollect` resolves an empty array
- WHEN the collections page renders
- THEN the empty-state message renders instead of a table

### Requirement: Reseller Commission View Totals By Period

The commissions route MUST list rows from `getReSellerCommissions`, one row per period formatted
`MM/YYYY`, showing payment count and total commission via `formatCurrency`. An empty result MUST
show an empty-state message. All copy MUST be neutral Latin American Spanish, no voseo.

#### Scenario: Period rows render
- GIVEN `getReSellerCommissions` resolves `[{year:2026,month:5,paymentCount:2,totalCommission:800}]`
- WHEN the commissions page renders
- THEN a row shows period `05/2026`, count `2`, and total formatted via `formatCurrency`

#### Scenario: Empty state
- GIVEN `getReSellerCommissions` resolves an empty array
- WHEN the commissions page renders
- THEN the empty-state message renders instead of a table
