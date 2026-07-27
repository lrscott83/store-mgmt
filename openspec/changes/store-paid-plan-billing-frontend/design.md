# Design — Store Paid-Plan Billing (Frontend)

Regenerated from scratch against the corrected sources (commit `176e7e2`) and re-verified
symbol-by-symbol against `frontend-react/` and `backend/`. **`spec.md` is authoritative**; this
document only locks HOW.

- **Change:** `store-paid-plan-billing-frontend` · **App:** `frontend-react/apps/web-store-pos`
- **Sources:** `docs/superpowers/plans/2026-07-25-store-paid-plan-billing-frontend.md` +
  `docs/superpowers/specs/2026-07-25-store-paid-plan-billing-enforcement-design.md`
- **Nature:** NEW feature work. No Angular source exists — this is **not** a parity migration.

## Technical approach

The client is a **read-only projection** of backend-computed billing state. Enforcement is
backend-side (`storeModuleIds` arrives pre-filtered when `Vencido`); the frontend adds **zero**
entitlement logic and **zero** billing math — it only branches on `paymentStatus` and formats a
date. Layering is the app's existing one, untouched:

```
domain types (packages/domain)
  └─ http services (raw passthrough, no mapping)
       ├─ auth-http-service.getMe ──→ auth-store.user ──→ PaymentBanner  (app shell)
       └─ store-http-service (3 new methods) ──→ collections / reseller-commissions routes
```

Banner flow (verified): `getMe()` → `auth-store.getUserByToken()`/`login()` → `set({ user })` →
`useAuthStore((s) => s.user)`. `AuthState.user: UserModel | null` already exists — **no store shape
change**.

## Decision gates (resolved)

| # | Gate | Resolution | Rationale |
|---|---|---|---|
| DG-1 | `getMe` and the new fields | **Keep the raw passthrough** `return response.data.data` (`auth-http-service.ts:38-41`). Change is **type-only**. | Adding a map would be the project's only mapping layer, contradicting the verified passthrough contract. Backend `CurrentUserDto` always serializes the three fields. |
| DG-2 | Defaulting for a stale/pre-backend payload | Lives at the **consumer**: `user?.paymentStatus ?? 'NoAplica'` inside `PaymentBanner`. | One guard where it is actually needed; keeps the transport dumb. Rejected: defaulting in `getMe` (see DG-1). |
| DG-3 | `isInTrial` vs `isTrial` | **`isInTrial`** everywhere. | Corrected plan + backend `StoreBillingUtils.IsInTrial` (to be built by the backend companion plan). The enforcement design spec's `isTrial` is stale. |
| DG-4 | Route gate for the two new views | **`resellerFeatureLoader([EFeatures.Owners])`** (`loaders.ts:106`; `EFeatures.Owners = 11`). | Mirrors backend `[HasPermission(StoreRoleFeatures.OwnersAdmin)]` = roles `{SuperAdmin, ReSeller}` + `FeatureType.Owners = 11`. Live precedent: `admin/owners/routes/owner-list.tsx:10` uses the identical gate, so reseller `featureIds` seeding is already proven — no open assumption. Rejected: `adminFeatureLoader` (`{SuperAdmin, OwnerAdmin}` — locks resellers out, admits owner-admins) and bare `resellerLoader` (drops the feature check the backend enforces). |
| DG-5 | `Store.paymentStartDate` type | **`string \| null`** (`store.ts:32`, currently `Date`). | Backend `DateOnly?` over camelCase JSON through a raw passthrough — no code ever produced a `Date`. `store-form.tsx:58-62` already does `initialValues?.paymentStartDate ? new Date(...) : ''`, which is correct for a string and yields `''` for `null`. |
| DG-6 | Never-activated store contract | Backend MUST send JSON `null` (not `""`). Gate is `!= null`. | `'' != null` would lock the picker wrongly. Backend plan makes the column nullable — record as a cross-boundary assumption to assert in tasks. |
| DG-7 | `readOnly` semantics | `readOnly?: boolean` (default `false`); tabs still render; the "Activar este plan" button is not rendered when `readOnly`. | `onChange` is reachable **only** via `choosePlan`, wired solely to that button (`plan-picker.tsx:90-97`); removing the button structurally satisfies "no `onChange` on tab interaction" without disabling the tabs. |
| DG-8 | `StoreToCollect.status` typing | Narrow union `'PorVencer' \| 'EnGracia'`. | Backend DTO is `string` but the query filters to exactly those two; the union drives the `BILLING.STATUS.*` label lookup. |
| DG-9 | Page data loading | `user-list.tsx`/`owner-list.tsx` shape: `export const clientLoader = <gate>` + `export default function XxxPage()` + `useState` + `useEffect` fetch. | `clientLoader` is used purely as an auth gate across this codebase; no route ever returns loader data. Reload after mark-paid = re-invoke the same fetch function. |
| DG-10 | Mount point | `app-layout.tsx` between `<Navbar/>` (:54) and `<Breadcrumbs/>` (:55). | Both symbols verified in place; `role="status"` container for live-region a11y. |
| DG-11 | Money + copy | `formatCurrency` from `~/shared/lib/format-currency` (`Intl.NumberFormat('en-US')`). `es.ts` is a flat map of quoted dotted keys → add a `BILLING.*` block. | `intl.formatNumber` under `es` renders `US$`/comma decimals. Copy = neutral Latin American Spanish, **no voseo**. |

## File changes

| File | Action | Description |
|---|---|---|
| `packages/domain/src/models/auth.ts` | Modify | `PaymentStatus` type; `UserModel += paymentDueDate/isInTrial/paymentStatus` |
| `packages/domain/src/models/store.ts` | Modify | `paymentStartDate: string \| null`; new `StoreToCollect`, `ReSellerCommission` |
| `app/shared/lib/http/auth-http-service.ts` | **Unchanged body** | Test-only touch; passthrough carries the fields |
| `app/shared/components/payment-banner.tsx` | Create | Named + default export `PaymentBanner` |
| `app/shared/components/app-layout.tsx` | Modify | Mount `<PaymentBanner />` (DG-10) |
| `app/management/stores/components/plan-picker.tsx` | Modify | `readOnly?: boolean` (DG-7) |
| `app/management/stores/components/store-form.tsx` | Modify | `readOnly={!isSuperAdmin && initialValues?.paymentStartDate != null}` |
| `app/management/stores/lib/services/store-http-service.ts` | Modify | 3 methods, `return response.data`, no mapping |
| `app/management/stores/routes/collections.tsx` | Create | `CollectionsPage` + `clientLoader` |
| `app/management/stores/routes/reseller-commissions.tsx` | Create | `ReSellerCommissionsPage` + `clientLoader` |
| `app/routes.ts` | Modify | `management/stores/collections`, `management/stores/commissions` inside the `app-layout` block (no `id` needed — distinct files) |
| `app/shared/lib/i18n/es.ts` | Modify | `BILLING.*` keys |
| 4 test fixtures (see Sequencing) | Modify | `new Date()` → ISO string |

## Contracts

```ts
// packages/domain/src/models/auth.ts
export type PaymentStatus = 'NoAplica' | 'AlDia' | 'PorVencer' | 'EnGracia' | 'Vencido';
// UserModel += paymentDueDate: string | null; isInTrial: boolean; paymentStatus: PaymentStatus;

// packages/domain/src/models/store.ts
// Store.paymentStartDate: string | null            // was: Date
export interface StoreToCollect {
  storeId: string; storeName: string; ownerName: string;
  amount: number; nextDueDate: string | null; status: 'PorVencer' | 'EnGracia';
}
export interface ReSellerCommission {
  year: number; month: number; paymentCount: number; totalCommission: number;
}

// store-http-service — same shape as every sibling method
getStoresToCollect(): Promise<BaseResponseModel<StoreToCollect[]>>          // GET  /v1/stores/to-collect
registerStorePayment(id: string): Promise<BaseResponseModel<boolean>>       // POST /v1/stores/{id}/payments
getReSellerCommissions(): Promise<BaseResponseModel<ReSellerCommission[]>>  // GET  /v1/stores/reseller-commissions
```

Paths carry **no** `/api` prefix — it lives in the `API_URL` env value consumed by `apiClient`.

## Banner state machine

| `paymentStatus` | `isInTrial` | Render | Tone |
|---|---|---|---|
| `NoAplica` / missing | any | `null` | — |
| `AlDia` | any | `null` | — |
| `PorVencer` / `EnGracia` | `true` | `BILLING.TRIAL_NOTICE` `{date}` | blue |
| `PorVencer` / `EnGracia` | `false` | `BILLING.DUE_NOTICE` `{date}` | amber |
| `Vencido` | any | `BILLING.OVERDUE_NOTICE` | red |

`Vencido` is evaluated first (overdue outranks trial). Date via
`intl.formatDate(new Date(paymentDueDate), { day:'2-digit', month:'2-digit', year:'numeric' })`.

## Testing strategy (strict TDD, no live backend)

| Layer | What | How |
|---|---|---|
| Transport | `getMe` carries the 3 fields unchanged | Mock `apiClient.get` → `{ data: { data: {...} } }` (double nesting) |
| Component | 5 banner variants | `vi.mock('~/shared/lib/stores/auth-store')` with a selector-aware `useAuthStore` (precedent: `inventory-components.test.tsx:507-514`) |
| Component | `PlanPicker` readOnly: no "Activar este plan", no `onChange` | RTL + `<IntlProvider locale="es" messages={esMessages}>` |
| Route | Collections rows, `formatCurrency`, mark-paid → reload, empty state | Mock `store-http-service` methods |
| Route | Commissions `MM/YYYY`, count, total, empty state | Mock `getReSellerCommissions` |
| Gate | 4 loader scenarios (super admin / reseller+feature / reseller−feature / owner-admin) | Drive `useAuthStore.getState()` |

Automated gate: `vitest run` + `pnpm -C frontend-react/apps/web-store-pos exec tsc --noEmit`.
**Manual validation is DEFERRED** — the backend endpoints do not exist yet.

## Sequencing (for `sdd-tasks`)

1. **Every domain export change is followed by `pnpm -C frontend-react/packages/domain build`** — apps
   typecheck against `dist/`. Skipping it makes `tsc --noEmit` fail on a change that is actually correct.
2. **The `paymentStartDate` retype MUST land in the SAME work unit as these 4 fixtures**, or
   `tsc --noEmit` breaks:
   - `app/management/stores/routes/__tests__/store-routes.test.tsx:19`
   - `app/admin/stores/routes/__tests__/store-list.test.tsx:51`
   - `app/admin/stores/components/__tests__/store-card-list.test.tsx:17`
   - `app/admin/owners/routes/__tests__/owner-edit.test.tsx:77`
   All four set `paymentStartDate: new Date()` → replace with an ISO string (e.g. `'2024-01-01'`).
3. Task order = plan order (domain types → banner → plan lock → collections → commissions). Tasks 4
   and 5 both add domain types + an http method + i18n + a route; they are independent of each other
   and of tasks 1–3 after step 1.
4. One work-unit commit per task; each independently revertible.

## Rejected alternatives

- **Client-side entitlement/enforcement** — backend already pre-filters `storeModuleIds`; a second
  source of truth would drift.
- **Deriving `paymentStatus`/due date client-side** from `paymentStartDate` + config — grace/trial
  boundaries are computed server-side on read; re-deriving risks clock-skew and off-by-one.
- **A dedicated Zustand billing slice** — the state is per-user and already rides on `UserModel`.
- **Sidebar/menu entries** — out of scope; deep links suffice (`menu-config.ts` untouched).

## Open questions

- [ ] Confirm the backend serializes `paymentStartDate: null` (JSON null) for never-activated stores (DG-6).
