# Delta Spec: store-paid-plan-billing-frontend

Source (corrected, commit `176e7e2`): `docs/superpowers/plans/2026-07-25-store-paid-plan-billing-frontend.md` +
`docs/superpowers/specs/2026-07-25-store-paid-plan-billing-enforcement-design.md`. NEW feature
work (no Angular source to mirror). Regenerated from scratch — the prior spec.md predated the
correction commit and never absorbed it (verified against real code below). Covers 4 domains:
`auth` (delta, additive), `management-stores` (delta), `billing-notification` (new),
`billing-collections` (new).

---

## Domain: auth (Modified — additive)

### Requirement: Payment Billing Fields on UserModel via raw getMe passthrough

`UserModel` MUST declare `paymentDueDate: string | null`, `isInTrial: boolean`,
`paymentStatus: PaymentStatus`. `authHttpService.getMe()` MUST remain a raw passthrough
(`return response.data.data`, verified in code) — it MUST NOT gain a mapping/defaulting step.
The backend (`CurrentUserDto`) always serializes non-null defaults (`'NoAplica'`/`false`/`null`);
any defaulting for a stale/offline payload missing these fields is the CONSUMER's
responsibility (e.g. `PaymentBanner` reading `user?.paymentStatus ?? 'NoAplica'`), not getMe's.
(Previously: required `getMe` to map fields with safe defaults — contradicts the verified
passthrough contract.)

#### Scenario: Fields present in response
- GIVEN `getMe` resolves with `paymentDueDate: '2026-03-10'`, `isInTrial: true`, `paymentStatus: 'PorVencer'`
- WHEN `authHttpService.getMe()` returns
- THEN `UserModel.paymentDueDate/isInTrial/paymentStatus` carry the same values unchanged, with no transform applied

#### Scenario: Fields absent from a stale payload
- GIVEN a payload lacking the three fields (pre-backend-merge or stale offline cache)
- WHEN `authHttpService.getMe()` returns
- THEN the fields are `undefined` on the returned object (getMe does not default them); a consumer reading `user?.paymentStatus ?? 'NoAplica'` treats it as `NoAplica`

---

## Domain: management-stores (Modified)

### Requirement: Store.paymentStartDate is a nullable ISO date string, not a Date

`Store.paymentStartDate` MUST be typed `string | null` (backend `DateOnly?`, camelCase JSON,
raw passthrough — `store-http-service` performs no field mapping). `null` means the store never
activated the paid plan. (Previously: typed as `Date | null` — contradicts the verified
passthrough contract; no mapping layer exists to produce a `Date`.)

#### Scenario: Activated store carries an ISO string
- GIVEN a store with `paymentStartDate: '2026-03-10'` in the raw JSON response
- WHEN `storeHttpService.getStore()` resolves
- THEN `Store.paymentStartDate` is the string `'2026-03-10'`, and `store-form` coerces it via `new Date(...)` only at the point of use (date input)

#### Scenario: Never-activated store is null
- GIVEN a store with `paymentStartDate: null`
- WHEN `storeHttpService.getStore()` resolves
- THEN `Store.paymentStartDate` is `null` and the read-only lock (below) does not engage

### Requirement: PlanPicker Read-Only Lock After Plan Activation

`PlanPicker` MUST accept a `readOnly` prop. When `true`, plan tabs MUST still render, but the
"Activar este plan" button MUST NOT render and `onChange` MUST NOT fire on tab interaction.
`store-form` MUST compute `readOnly={!isSuperAdmin && paymentStartDate != null}`.

#### Scenario: Activated owner sees a locked picker
- GIVEN a store with `paymentStartDate` set and the current user is not super admin
- WHEN the edit form renders `PlanPicker`
- THEN `readOnly` is `true`: no "Activar este plan" button renders and clicking a tab does not call `onChange`

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

`PaymentBanner` MUST render in `app-layout.tsx` (between `<Navbar/>` and `<Breadcrumbs/>`),
based on `useAuthStore().user.paymentStatus`/`isInTrial`, in neutral Latin American Spanish
(no voseo):

| paymentStatus | isInTrial | Banner shown |
|---|---|---|
| `NoAplica` / missing | any | hidden |
| `AlDia` | any | hidden |
| `PorVencer` / `EnGracia` | `true` | trial notice (with due date) |
| `PorVencer` / `EnGracia` | `false` | due notice (with due date) |
| `Vencido` | any | overdue notice |

#### Scenario: Hidden for NoAplica or AlDia
- GIVEN `paymentStatus` is `'NoAplica'`, `'AlDia'`, or missing (undefined, per the auth domain)
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

### Requirement: Route Gating is Reseller Feature Loader, Not Admin Feature Loader

The `collections` and `reseller-commissions` routes' `clientLoader` MUST be
`resellerFeatureLoader([EFeatures.Owners])` (verified: `~/auth/routes/loaders.ts`), mirroring
the backend gate `[HasPermission(StoreRoleFeatures.OwnersAdmin)]` on `OwnersController`
(verified: roles `{SuperAdmin, ReSeller}` + feature `Owners`). The routes MUST NOT use
`adminFeatureLoader`, which authorizes `{SuperAdmin, OwnerAdmin}` — it excludes the ReSeller
(who needs the view) and wrongly admits a plain store Owner-Admin (who must not see other
stores' collections/commissions). This requirement did not exist in the prior spec — the prior
proposal specified the wrong loader (`adminFeatureLoader`).

#### Scenario: Super admin is granted access unconditionally
- GIVEN the current user has `isSuperAdmin: true`
- WHEN the collections or commissions route loader runs
- THEN access is granted regardless of `featureIds`

#### Scenario: Reseller with the Owners feature is granted access
- GIVEN the current user has `isReSeller: true` and `featureIds` includes `EFeatures.Owners`
- WHEN the route loader runs
- THEN access is granted

#### Scenario: Reseller without the Owners feature is denied
- GIVEN the current user has `isReSeller: true` and `featureIds` does not include `EFeatures.Owners`
- WHEN the route loader runs
- THEN access is denied (redirect to `/login`, mirroring `denyAccess()`)

#### Scenario: Owner-admin is denied regardless of feature grants
- GIVEN the current user has `isOwnerAdmin: true` and `isSuperAdmin: false` and `isReSeller: false`
- WHEN the route loader runs
- THEN access is denied — `resellerFeatureLoader`'s role gate rejects before any feature check

### Requirement: Collections View Lists Stores To Collect

The collections route MUST list stores returned by `getStoresToCollect` (`GET
/v1/stores/to-collect`), one row per store with columns store name, owner, amount, due date,
status; amounts MUST format via `formatCurrency`. Clicking "Registrar pago" MUST call
`registerStorePayment(storeId)` (`POST /v1/stores/{storeId}/payments`) and then reload the
list. An empty result MUST show an empty-state message instead of a table.

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

The commissions route MUST list rows from `getReSellerCommissions` (`GET
/v1/stores/reseller-commissions`), one row per period formatted `MM/YYYY`, showing payment
count and total commission via `formatCurrency`. An empty result MUST show an empty-state
message. All copy MUST be neutral Latin American Spanish, no voseo.

#### Scenario: Period rows render
- GIVEN `getReSellerCommissions` resolves `[{year:2026,month:5,paymentCount:2,totalCommission:800}]`
- WHEN the commissions page renders
- THEN a row shows period `05/2026`, count `2`, and total formatted via `formatCurrency`

#### Scenario: Empty state
- GIVEN `getReSellerCommissions` resolves an empty array
- WHEN the commissions page renders
- THEN the empty-state message renders instead of a table
