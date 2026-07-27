# Tasks: Store Paid-Plan Billing (Frontend)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~550-700 (2 new domain types, 1 new component, 2 new routes, 3 new http methods, i18n block, 4 fixture edits, ~8 test files touched/added) |
| 400-line budget risk | High |
| Chained PRs recommended | No — delivery is commits-only on `feat/store-paid-plan-billing-frontend`, no PRs |
| Suggested split | 8 sequential/parallel work-unit commits (see below), not PR slices |
| Delivery strategy | commits-only (project convention — no PRs/chained/`size:exception`) |
| Chain strategy | pending (not applicable — no PR chain) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Depends on | Parallel? |
|------|------|-----------|-----------|
| A | Domain types + fixtures | — | sequential (blocks all) |
| B | `getMe` transport test (type-only) | A | parallel with C, D |
| C | `PaymentBanner` + mount | A | parallel with B, D |
| D | `PlanPicker` readOnly + `store-form` wiring | A | parallel with B, C |
| E | `store-http-service` 3 new methods | A | sequential (blocks F, G) |
| F | Collections route | E | parallel with G |
| G | Reseller-commissions route | E | parallel with F |
| H | Full-suite verification | B,C,D,F,G | sequential (final) |

Each unit = one work-unit commit, independently revertible, per proposal's Rollback Plan.

## Phase 1 (WU-A): Domain Foundation — blocks everything

- [x] 1.1 `packages/domain/src/models/auth.ts`: add `export type PaymentStatus = 'NoAplica'|'AlDia'|'PorVencer'|'EnGracia'|'Vencido'`; add `paymentDueDate: string | null`, `isInTrial: boolean`, `paymentStatus: PaymentStatus` to `UserModel`. *(Req: auth/Payment Billing Fields; DG-1, DG-3)*
- [x] 1.2 `packages/domain/src/models/store.ts`: retype `paymentStartDate: Date` → `string | null`; add `StoreToCollect` and `ReSellerCommission` interfaces per design contracts. *(Req: management-stores/nullable ISO string; DG-5, DG-6, DG-8)*
- [x] 1.3 Comment on `Store.paymentStartDate` documenting DG-6: backend MUST serialize JSON `null` (never `""`) for a never-activated store — cross-boundary assumption, not runtime-enforceable here.
- [x] 1.4 Run `pnpm -C frontend-react/packages/domain build` (apps typecheck against `dist/`).
- [x] 1.5 RED: update the 4 confirmed fixtures' `paymentStartDate: new Date()` → `'2024-01-01'` in the SAME commit as 1.1-1.4 (retype breaks them otherwise): `frontend-react/apps/web-store-pos/app/management/stores/routes/__tests__/store-routes.test.tsx:19`, `frontend-react/apps/web-store-pos/app/admin/stores/routes/__tests__/store-list.test.tsx:51`, `frontend-react/apps/web-store-pos/app/admin/stores/components/__tests__/store-card-list.test.tsx:17`, `frontend-react/apps/web-store-pos/app/admin/owners/routes/__tests__/owner-edit.test.tsx:77`. ALSO: retyping `UserModel` (task 1.1) broke 21 additional fixtures across the app (local `makeUser`/`makeStoreUser`/`makeSuperAdmin` factories missing the 3 new required fields) — not anticipated by this task list; fixed in the same commit (see apply-progress for full file list).
- [x] 1.6 Add a case to `store-http-service.test.ts` (getStore describe block) asserting `paymentStartDate` passes through unchanged for both a string and `null` mock response (RED→GREEN; no new code needed, passthrough already raw). *(Scenarios: Activated store ISO string / Never-activated null)*
- [x] 1.7 Verify: `pnpm -C frontend-react/apps/web-store-pos exec tsc --noEmit` clean; `pnpm test` green.

## Phase 2 (WU-B): getMe Transport (type-only, parallel with 3/4)

- [ ] 2.1 RED in `frontend-react/apps/web-store-pos/app/shared/lib/http/__tests__/auth-http-service.test.ts`: mock `apiClient.get` → `{ data: { data: { paymentDueDate, isInTrial, paymentStatus, ... } } }`; assert `getMe()` returns the 3 fields unchanged. *(Req: auth/Fields present in response; DG-1, DG-2)*
- [ ] 2.2 GREEN: no source change needed (`auth-http-service.ts` body stays a raw passthrough) — confirms DG-1/DG-2 by construction.
- [ ] 2.3 Verify: `pnpm test -- auth-http-service`.

## Phase 3 (WU-C): PaymentBanner (parallel with 2/4)

- [ ] 3.1 Add `BILLING.TRIAL_NOTICE`/`BILLING.DUE_NOTICE`/`BILLING.OVERDUE_NOTICE` (with `{date}` placeholder) to `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` — neutral LatAm Spanish, no voseo. *(DG-11)*
- [ ] 3.2 RED: create `frontend-react/apps/web-store-pos/app/shared/components/__tests__/payment-banner.test.tsx` with `vi.mock('~/shared/lib/stores/auth-store')` (selector-aware, per `inventory-components.test.tsx:507-514` precedent) covering: hidden for `NoAplica`/`AlDia`/missing, trial notice (`isInTrial:true`), due notice (`isInTrial:false`), overdue notice (`Vencido` outranks trial). *(Req: billing-notification/Visibility Matrix — 4 scenarios)*
- [ ] 3.3 GREEN: create `frontend-react/apps/web-store-pos/app/shared/components/payment-banner.tsx` — named + default export, reads `useAuthStore((s) => s.user)`, `user?.paymentStatus ?? 'NoAplica'` default (DG-2), date via `intl.formatDate`.
- [ ] 3.4 Mount `<PaymentBanner />` in `frontend-react/apps/web-store-pos/app/shared/components/app-layout.tsx` between `<Navbar/>` and `<Breadcrumbs/>` (DG-10); add assertion to `app-layout.test.tsx`.
- [ ] 3.5 Verify: `pnpm test -- payment-banner app-layout`.

## Phase 4 (WU-D): PlanPicker Read-Only Lock (parallel with 2/3)

- [ ] 4.1 RED: extend `plan-picker.test.tsx` — `readOnly=true` hides "Activar este plan" and tab click does not call `onChange`; `readOnly=false`/default unaffected. *(Req: PlanPicker Read-Only Lock — 3 scenarios)*
- [ ] 4.2 GREEN: `plan-picker.tsx` — add `readOnly?: boolean` prop; conditionally render the activate button per DG-7 (tabs always render).
- [ ] 4.3 RED: extend `store-form.test.tsx` — asserts `PlanPicker` receives `readOnly={!isSuperAdmin && initialValues?.paymentStartDate != null}` for activated/non-super-admin, super-admin, and create-mode (`initialValues` undefined) cases.
- [ ] 4.4 GREEN: `store-form.tsx` — pass the computed `readOnly` prop to `<PlanPicker>`.
- [ ] 4.5 Verify: `pnpm test -- plan-picker store-form`; `tsc --noEmit`.

## Phase 5 (WU-E): store-http-service New Methods — blocks 6/7

- [ ] 5.1 RED in `store-http-service.test.ts`: 3 new describe blocks mocking `apiClient.get`/`post`, asserting URLs `GET /v1/stores/to-collect`, `POST /v1/stores/{id}/payments`, `GET /v1/stores/reseller-commissions`, and raw `response.data` return (no mapping).
- [ ] 5.2 GREEN: add `getStoresToCollect`, `registerStorePayment(id)`, `getReSellerCommissions` to `store-http-service.ts` per design contracts.
- [ ] 5.3 Verify: `pnpm test -- store-http-service`.

## Phase 6 (WU-F): Collections Route (parallel with 7)

- [ ] 6.1 Add `BILLING.COLLECTIONS.*` i18n keys (title, columns, "Registrar pago" action, `BILLING.STATUS.PorVencer`/`EnGracia`, empty-state) to `es.ts`.
- [ ] 6.2 RED: create `frontend-react/apps/web-store-pos/app/management/stores/routes/__tests__/collections.test.tsx` (owner-list.test.tsx shape: mock `resellerFeatureLoader`, mock `store-http-service`) covering rows-with-`formatCurrency`, mark-paid → `registerStorePayment` → reload, empty state. *(Req: Collections View — 3 scenarios)*
- [ ] 6.3 RED (same file): assert `clientLoader` was built by calling the mocked `resellerFeatureLoader` with `[EFeatures.Owners]` — wiring-only; the 4 gate-logic scenarios (super admin / reseller+feature / reseller−feature / owner-admin) are already covered by the pre-existing `resellerFeatureLoader — ADMIN-OWNERS-ACCESS` block in `loaders.test.ts:289-336`, not re-tested here. *(Req: Route Gating)*
- [ ] 6.4 GREEN: create `collections.tsx` — `export const clientLoader = resellerFeatureLoader([EFeatures.Owners]); export default function CollectionsPage()` (DG-9 shape), `useEffect` fetch via `getStoresToCollect`, "Registrar pago" → `registerStorePayment(id)` → refetch, empty-state message.
- [ ] 6.5 Register route in `frontend-react/apps/web-store-pos/app/routes.ts` under `app-layout`: `route('management/stores/collections', 'management/stores/routes/collections.tsx')`.
- [ ] 6.6 Verify: `pnpm test -- collections`.

## Phase 7 (WU-G): Reseller-Commissions Route (parallel with 6)

- [ ] 7.1 Add `BILLING.COMMISSIONS.*` i18n keys (title, columns, empty-state) to `es.ts`.
- [ ] 7.2 RED: create `reseller-commissions.test.tsx` covering period rows `MM/YYYY` + count + `formatCurrency` total, empty state. *(Req: Commission View — 2 scenarios)*
- [ ] 7.3 RED (same file): wiring-only assertion that `clientLoader` calls `resellerFeatureLoader([EFeatures.Owners])`, same rationale as 6.3.
- [ ] 7.4 GREEN: create `reseller-commissions.tsx` (same shape as 6.4) using `getReSellerCommissions`.
- [ ] 7.5 Register route in `routes.ts`: `route('management/stores/commissions', 'management/stores/routes/reseller-commissions.tsx')`.
- [ ] 7.6 Verify: `pnpm test -- reseller-commissions`.

## Phase 8 (WU-H): Final Gate

- [ ] 8.1 `pnpm test` — full suite green across domain + web-common + web-store-pos.
- [ ] 8.2 `pnpm -C frontend-react/apps/web-store-pos exec tsc --noEmit` clean.
- [ ] 8.3 `pnpm -C frontend-react/apps/web-store-pos build` succeeds.
- [ ] 8.4 Grep all new `BILLING.*` copy for voseo markers (`tenés`, `pagás`, `vos`) — must be zero matches.
- [ ] 8.5 Mark manual/e2e validation against a live backend as DEFERRED (`StorePaymentsController` unbuilt) — no task depends on it.

## Not mapped to a dedicated task

None — all spec scenarios trace to a task above. Route-gating scenarios (4) are satisfied by pre-existing `loaders.test.ts` coverage plus the wiring assertions in 6.3/7.3, not new gate-logic tests.
