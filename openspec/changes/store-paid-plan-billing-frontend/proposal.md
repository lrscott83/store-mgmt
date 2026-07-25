# Proposal: Store Paid-Plan Billing — Frontend (React)

## Intent

The backend paid-plan billing lifecycle (trial → due → grace → overdue auto-downgrade, plus
manual payments and Gestor commissions) is being built, but the React app is blind to it: the
`UserModel` carries no payment/trial state, owners get no warning before losing their paid
modules, an already-activated owner can still toggle the `PlanPicker`, and super admin / ReSeller
have no way to see who owes money or how much commission was earned. This change surfaces that
billing state in `web-store-pos`: it extends `getMe`, shows a trial/due/overdue banner, locks the
`PlanPicker` once the plan is activated, and adds the collections and reseller-commission views.

This is **NEW feature work**, not a parity migration — there is no Angular source to mirror. All
enforcement stays on the backend (`storeModuleIds` is already pre-filtered when overdue); the
frontend is purely presentational and consumes the backend contract via TDD with mocks.

## Scope

### In Scope

- **A. Payment state on `UserModel` + `getMe` mapping** — new domain type
  `PaymentStatus = 'NoAplica'|'AlDia'|'PorVencer'|'EnGracia'|'Vencido'` and fields
  `paymentDueDate: string | null`, `isInTrial: boolean`, `paymentStatus: PaymentStatus`; mapped in
  `auth-http-service.getMe` with safe defaults (`null`/`false`/`'NoAplica'`).
- **B. `PaymentBanner` in the app shell** — new component mounted in `app-layout.tsx` between
  `<Navbar/>` and `<Breadcrumbs/>`, reading `useAuthStore().user`. Renders trial / due / overdue
  variants (color-toned) and nothing for `NoAplica`/`AlDia`.
- **C. `PlanPicker` read-only lock after activation** — `Store.paymentStartDate` becomes
  `Date | null`; `PlanPicker` gains a `readOnly` prop; `store-form` passes
  `readOnly={!isSuperAdmin && paymentStartDate != null}` so an activated owner sees the plan but
  cannot switch/activate, while super admin keeps full control and create-mode stays interactive.
- **D. Collections view** — `getStoresToCollect` + `registerStorePayment` http methods, a new
  `collections.tsx` route (`adminFeatureLoader([EFeatures.Stores])`) listing `PorVencer`/`EnGracia`
  stores with a per-row "Registrar pago" action that reloads the list.
- **E. Reseller commission view** — `getReSellerCommissions` http method and a new
  `reseller-commissions.tsx` route showing commission totals by period (year/month, count, total).
- i18n: new `BILLING.*` keys in `es.ts`, neutral Latin American Spanish, **NO voseo**.

### Out of Scope

- Any backend work (endpoints, entitlement gate, migrations, commission math) — companion backend
  plan owns it; this change only consumes the contract.
- Payment gateway / online payment flow — payments are recorded manually via the existing endpoint.
- Menu/sidebar entries for the two new routes — deep-link routes are sufficient; optional follow-up.
- Enforcement logic on the client — the backend pre-filters `storeModuleIds`; the frontend never
  computes entitlement.
- Scheduled jobs, email/push notifications — banner is in-app only.

## Capabilities

### New Capabilities
- `billing-notification` — client-side surfacing of paid-plan billing state (banner + read-only
  plan lock) driven by `getMe` payment fields.
- `billing-collections` — super admin / ReSeller views for pending collections and earned
  commissions.

### Modified Capabilities
- `management-stores` — `Store.paymentStartDate` becomes nullable; `PlanPicker` gains a read-only
  mode; two new store-scoped management routes.
- `auth` — `UserModel` / `getMe` carry payment/trial state.

## Approach

Contract-first and bottom-up, matching the plan's 5 tasks. Start at the domain package
(`@store-mgmt/domain`): add the `PaymentStatus` type and nullable/new fields, rebuild `dist/` so
the app typechecks. Then thread the state outward — `auth-http-service` maps the new `getMe` fields
into `auth-store`, and `PaymentBanner` reads them from `useAuthStore().user`. The read-only lock is
a small presentational prop on `PlanPicker` gated by role + activation. The two management views
follow the existing `user-list.tsx` shape (`clientLoader` + `useState` list + table + row action),
calling new `store-http-service` methods. Everything is built strict-TDD with mocked http, so the
frontend can be completed and merged independent of a live backend; the backend contract is the
only coupling. Currency always via the shared `format-currency` util; components kebab-case; routes
export `default function XxxPage()` + `clientLoader`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/src/models/auth.ts` | Modified | `PaymentStatus` type + 3 `UserModel` fields |
| `packages/domain/src/models/store.ts` | Modified | `paymentStartDate` nullable; `StoreToCollect`, `ReSellerCommission` types |
| `app/shared/lib/http/auth-http-service.ts` | Modified | Map payment fields in `getMe` |
| `app/shared/components/payment-banner.tsx` | New | Trial/due/overdue banner |
| `app/shared/components/app-layout.tsx` | Modified | Mount `PaymentBanner` |
| `app/management/stores/components/plan-picker.tsx` | Modified | `readOnly` prop |
| `app/management/stores/components/store-form.tsx` | Modified | Pass `readOnly` |
| `app/management/stores/lib/services/store-http-service.ts` | Modified | 3 new methods + nullable map |
| `app/management/stores/routes/collections.tsx` | New | Collections view |
| `app/management/stores/routes/reseller-commissions.tsx` | New | Commission view |
| `app/routes.ts` | Modified | Register 2 routes |
| `app/shared/lib/i18n/es.ts` | Modified | `BILLING.*` keys |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Backend not merged → live `getMe` lacks fields, endpoints 404 | High | TDD with mocks decouples build; `??` defaults keep old `getMe` safe; ship behind backend availability |
| Contract drift (field names/enum values differ from backend) | Med | Field/enum names pinned from the shared design spec; verify against backend DTOs before manual test |
| Manual validation cannot pass until backend exists | High | Explicitly deferred; automated tests are the gate for this change; manual step blocked on backend merge |
| `paymentStartDate` nullable breaks existing store mapping/consumers | Med | Map `res.paymentStartDate ? new Date(...) : null`; audit call-sites in tasks phase |
| Read-only lock wrongly locks super admin or create-mode | Med | Gate = `!isSuperAdmin && paymentStartDate != null`; explicit tests for both roles + create mode |
| voseo leaking into copy | Low | All `BILLING.*` strings reviewed for impersonal/tuteo; spec-enforced |

## Dependencies

- **Backend plan merged** (`2026-07-25-store-paid-plan-billing-backend.md`): `getMe` fields
  `paymentDueDate` / `isInTrial` / `paymentStatus`, and endpoints `GET /v1/stores/to-collect`,
  `GET /v1/stores/reseller-commissions`, `POST /v1/stores/{storeId}/payments`. Frontend builds
  against mocks, but end-to-end / manual validation is blocked until this lands.
- `@store-mgmt/domain` rebuild (`pnpm -C frontend-react/packages/domain build`) after every export
  change — apps typecheck against `dist/`.

## Rollback Plan

Work-unit commits (one per task) on the current branch. Each task is independently revertible; the
domain-package changes (Task 1/3/4/5 additive fields) are backward-compatible via defaults, so a
partial rollback of a view does not break the banner or the shell.

## Success Criteria

- [ ] `UserModel` carries `paymentDueDate`/`isInTrial`/`paymentStatus`; `getMe` maps them with defaults.
- [ ] Banner shows trial/due/overdue variants and hides for `NoAplica`/`AlDia`.
- [ ] Activated owner sees `PlanPicker` read-only (no "Activar" button, no `onChange`); super admin unaffected.
- [ ] Collections view lists due/grace stores and "Registrar pago" records a payment then reloads.
- [ ] Commission view renders totals by period (`MM/YYYY`, count, total via `formatCurrency`).
- [ ] All copy is neutral LatAm Spanish, no voseo.
- [ ] Vitest green + `tsc --noEmit` clean (manual validation deferred to backend availability).
