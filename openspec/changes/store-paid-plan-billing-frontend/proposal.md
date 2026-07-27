# Proposal: Store Paid-Plan Billing — Frontend (React)

> Regenerated from scratch against the corrected plans (commit `176e7e2`) and verified
> symbol-by-symbol against real code. Aligned with `spec.md` (authoritative).

## Intent

The backend is gaining a per-store paid-plan lifecycle (trial → due → grace → overdue
auto-downgrade, manual payments, Gestor commissions). The React app is blind to it: `UserModel`
carries no billing state, an owner gets no warning before losing paid modules, an already-activated
owner can still switch plans in `PlanPicker`, and super admin / ReSeller have no view of who owes
money or what commission was earned.

This is **NEW feature work** — there is no Angular source to mirror. Enforcement stays entirely
backend-side (`storeModuleIds` arrives pre-filtered when `Vencido`); the frontend is a **read-only
projection** of backend-computed billing state.

## Scope

### In Scope

- **A. Billing state on `UserModel`** — `PaymentStatus = 'NoAplica'|'AlDia'|'PorVencer'|'EnGracia'|'Vencido'`
  plus `paymentDueDate: string | null`, `isInTrial: boolean`, `paymentStatus`.
  **Type-only change**: `getMe` is a raw passthrough (`auth-http-service.ts:38-41`) and MUST stay
  one — no mapping/defaulting layer. Defaulting (`?? 'NoAplica'`) belongs to the consumer.
- **B. `PaymentBanner`** — new component mounted in `app-layout.tsx` between `<Navbar/>` (:54) and
  `<Breadcrumbs/>` (:55); trial / due / overdue variants, nothing for `NoAplica`/`AlDia`.
- **C. `PlanPicker` read-only lock** — `Store.paymentStartDate` retyped `Date` → **`string | null`**
  (`store.ts:32`; backend `DateOnly?`, camelCase, raw passthrough — no mapping layer exists to
  produce a `Date`). `PlanPicker` gains `readOnly?: boolean` (today props are only
  `{ modules, onChange }`, `plan-picker.tsx:6-9`); `store-form` passes
  `!isSuperAdmin && initialValues?.paymentStartDate != null`.
- **D. Collections view** — `getStoresToCollect` + `registerStorePayment` on `store-http-service`,
  new `collections.tsx` route gated by **`resellerFeatureLoader([EFeatures.Owners])`**
  (`loaders.ts:106`), with a per-row "Registrar pago" action that reloads the list.
- **E. Commission view** — `getReSellerCommissions` + `reseller-commissions.tsx`, same gate,
  totals by `MM/YYYY`.
- i18n: `BILLING.*` keys in `es.ts`, neutral Latin American Spanish, **NO voseo**.

### Out of Scope

- Any backend work (endpoints, entitlement gate, migrations, commission math) — companion plan owns it.
- Payment gateway / online payment; payments are recorded manually.
- Sidebar/menu entries for the two routes (deep links suffice).
- Any client-side entitlement or billing math (status/due date are computed server-side).
- Scheduled jobs, email/push — in-app banner only.

## Capabilities

### New Capabilities
- `billing-notification` — banner + plan lock driven by the `getMe` billing fields.
- `billing-collections` — super admin / ReSeller collections and commission views (incl. route gating).

### Modified Capabilities
- `auth` — `UserModel` carries billing fields through the unchanged `getMe` passthrough.
- `management-stores` — `paymentStartDate` retyped `string | null`; `PlanPicker` read-only mode.

## Approach

Bottom-up, contract-first, mirroring the plan's 5 tasks. Start in `@store-mgmt/domain` (types +
`pnpm -C frontend-react/packages/domain build`, since apps typecheck against `dist/`), then let the
existing raw passthroughs carry the new fields with **zero mapping code added**. `PaymentBanner`
reads `useAuthStore((s) => s.user)`. The two views follow the `user-list.tsx` shape
(`export default function XxxPage()` + `export const clientLoader`), calling new
`store-http-service` methods that return `BaseResponseModel<T>` like every sibling method.
Route gating mirrors the backend `[HasPermission(StoreRoleFeatures.OwnersAdmin)]`
(`OwnersController.cs:18`; roles `{SuperAdmin, ReSeller}` + feature `Owners`,
`StoreRoleFeatures.cs:12-14`) and the `admin/owners` precedent (`owner-list.tsx:10`).
Strict TDD with mocked http throughout, so the frontend lands without a live backend.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/src/models/auth.ts` | Modified | `PaymentStatus` + 3 `UserModel` fields |
| `packages/domain/src/models/store.ts` | Modified | `paymentStartDate: string \| null`; `StoreToCollect`, `ReSellerCommission` |
| `app/shared/lib/http/auth-http-service.ts` | Unchanged body | Passthrough carries fields; test-only touch |
| `app/shared/components/payment-banner.tsx` | New | Trial/due/overdue banner |
| `app/shared/components/app-layout.tsx` | Modified | Mount banner between Navbar and Breadcrumbs |
| `app/management/stores/components/plan-picker.tsx` | Modified | `readOnly` prop |
| `app/management/stores/components/store-form.tsx` | Modified | Compute + pass `readOnly` |
| `app/management/stores/lib/services/store-http-service.ts` | Modified | 3 new methods (no mapping) |
| `app/management/stores/routes/collections.tsx` | New | Collections view |
| `app/management/stores/routes/reseller-commissions.tsx` | New | Commission view |
| `app/routes.ts` | Modified | Register 2 routes under `app-layout` |
| `app/shared/lib/i18n/es.ts` | Modified | `BILLING.*` keys |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Backend not merged → `getMe` lacks fields, 3 endpoints 404 | High | TDD with mocks; consumer-side `?? 'NoAplica'`; manual validation deferred |
| Retyping `paymentStartDate` to `string \| null` breaks existing `new Date()` test fixtures (`store-routes.test.tsx:19`, `store-list.test.tsx:51`, `store-card-list.test.tsx:17`, `owner-edit.test.tsx:77`) | High | Update the 4 fixtures to ISO strings in the same work unit; `tsc --noEmit` is the gate |
| Backend sends `""` instead of `null` for a never-activated store → picker locks wrongly | Med | Contract: JSON `null`; assert in the tasks phase against the backend DTO |
| Wrong loader locks resellers out or admits owner-admins | Med | Locked to `resellerFeatureLoader([EFeatures.Owners])`; 4 gating scenarios specified |
| `design.md` still carries the pre-`176e7e2` claims (`adminFeatureLoader`/`EFeatures.Stores`, `Date \| null`, explicit `getMe` map) | High | Regenerate `design.md` before `sdd-tasks`; `spec.md` + this proposal win |
| Enum/field drift vs backend (`isInTrial` vs design-doc `isTrial`) | Med | `isInTrial` is canonical (corrected plan + backend `StoreBillingUtils.IsInTrial`) |
| voseo leaking into copy | Low | All `BILLING.*` strings impersonal/tuteo; spec-enforced |

## Rollback Plan

One work-unit commit per task on the current branch, each independently revertible. Domain fields
are additive; the `paymentStartDate` retype and its 4 fixture updates land in a single commit so a
revert leaves the tree typechecking. Reverting a view commit does not affect the banner or shell.

## Dependencies

- **Backend companion plan** (`docs/superpowers/plans/2026-07-25-store-paid-plan-billing-backend.md`):
  `getMe` fields + `GET /v1/stores/to-collect`, `GET /v1/stores/reseller-commissions`,
  `POST /v1/stores/{storeId}/payments` — all served by a **new `StorePaymentsController` that does
  not exist yet**. Frontend builds against mocks; end-to-end validation is blocked on this.
- `pnpm -C frontend-react/packages/domain build` after every domain export change.

## Success Criteria

- [ ] `UserModel` carries the 3 billing fields; `getMe` body is unchanged (still a raw passthrough).
- [ ] Banner renders trial/due/overdue and hides for `NoAplica`/`AlDia`/missing.
- [ ] Activated non-super-admin owner sees `PlanPicker` read-only; super admin and create mode unaffected.
- [ ] Both new routes use `resellerFeatureLoader([EFeatures.Owners])`.
- [ ] Collections lists due/grace stores; "Registrar pago" records then reloads; empty state renders.
- [ ] Commission view renders `MM/YYYY`, count, total via `formatCurrency`; empty state renders.
- [ ] All copy neutral LatAm Spanish, no voseo.
- [ ] `vitest run` green + `tsc --noEmit` clean (manual validation deferred to backend availability).
