# Design — Store Paid-Plan Billing (Frontend)

Surface the backend paid-plan billing lifecycle in the React `web-store-pos` app: carry
payment/trial state on `UserModel`, show a trial/due/overdue banner, lock the `PlanPicker`
after activation, and add super-admin/reseller collections and commission views. All
presentational — the backend enforces entitlement (`storeModuleIds` is pre-filtered).

- **Change:** `store-paid-plan-billing-frontend`
- **Depends on:** backend plan merged (getMe fields + 3 endpoints). See Risks.
- **Source of truth:** `docs/superpowers/plans/2026-07-25-store-paid-plan-billing-frontend.md`
  (file-level plan) + `docs/superpowers/specs/2026-07-25-store-paid-plan-billing-enforcement-design.md`.
- **This document:** locks architecture + resolves the DECISION GATES the plan implies,
  verified against the real `frontend-react/` code. **Where plan and code disagree, code wins.**

## Chosen approach

Thin, read-only presentation layer over backend-computed billing state. No client-side
enforcement, no derived billing math on the client. One unidirectional data flow feeds a
banner; two new list routes call new `store-http-service` methods. Reuse every existing
primitive (`useAuthStore`, `adminFeatureLoader`/`resellerFeatureLoader`, `formatCurrency`,
the `es.ts` flat message map, the `user-list.tsx` page shape).

**Architectural stance:** the client is a *projection* of server state. `paymentStatus` is
computed on read by the backend; the client only branches on it. This keeps the client
reversible and correct across trial → due → grace → overdue transitions without any
client-side clock/date logic beyond formatting the due date.

## Data flow (banner)

```
GET /v1/auth/me
  → auth-http-service.getMe()            [map + default the 3 new fields]
    → auth-store.getUserByToken()/login  [set({ user })]
      → useAuthStore((s) => s.user)       [PaymentBanner subscribes]
        → PaymentBanner branches on user.paymentStatus / user.isInTrial
```

- **Confirmed:** `auth-store.ts` exposes `user: UserModel | null` on `AuthState`; the banner
  reads it with `useAuthStore((s) => s.user)`. No store shape change needed.
- **Confirmed:** `getMe()` result flows through `getUserByToken()` (both cold-boot cache and
  foreground `/me` paths) and `login()`; whatever `getMe` returns becomes `state.user`.

## Component & integration map

| Area | Symbol (real, verified) | File | Action |
|------|------------------------|------|--------|
| Domain types | `UserModel`, new `PaymentStatus` | `packages/domain/src/models/auth.ts` | add 3 fields + type |
| Domain types | `Store.paymentStartDate` | `packages/domain/src/models/store.ts` | `Date` → `Date \| null` |
| Domain types | `StoreToCollect`, `ReSellerCommission` | `packages/domain/src/models/store.ts` | new interfaces |
| getMe mapping | `authHttpService.getMe` | `app/shared/lib/http/auth-http-service.ts` | **rewrite pass-through → explicit map** |
| Banner | `PaymentBanner` (new) | `app/shared/components/payment-banner.tsx` | new component |
| Shell mount | `AppLayout` | `app/shared/components/app-layout.tsx` | mount between `<Navbar/>` and `<Breadcrumbs/>` |
| Plan lock | `PlanPicker`, `StoreForm` | `app/management/stores/components/{plan-picker,store-form}.tsx` | add `readOnly` prop + pass gate |
| Http methods | `storeHttpService` | `app/management/stores/lib/services/store-http-service.ts` | +3 methods |
| Collections | `CollectionsPage` (new) | `app/management/stores/routes/collections.tsx` | new route |
| Commissions | `ReSellerCommissionsPage` (new) | `app/management/stores/routes/reseller-commissions.tsx` | new route |
| Routing | route table | `app/routes.ts` | register 2 routes under `app-layout` |
| i18n | `esMessages` | `app/shared/lib/i18n/es.ts` | `BILLING.*` keys (neutral LatAm, NO voseo) |

## Decision gates (verified against code)

### DG-1 — `getMe` has no mapping object to extend (plan-vs-code)

**Plan says:** "In `auth-http-service.ts` `getMe` mapping, add `paymentDueDate: res.data.paymentDueDate ?? null` …"
**Code reality:** `getMe` is a **raw pass-through** — `return response.data.data;` (cast to
`UserModel`). There is no object literal to add fields to.

**Decision:** rewrite `getMe` to an explicit spread + default so the `?? null / false / 'NoAplica'`
contract actually applies (a raw cast would silently pass `undefined` through when the backend
omits a field):

```ts
async getMe(): Promise<UserModel> {
  const response = await apiClient.get<{ data: UserModel }>('/v1/auth/me');
  const data = response.data.data;
  return {
    ...data,
    paymentDueDate: data.paymentDueDate ?? null,
    isInTrial: data.isInTrial ?? false,
    paymentStatus: data.paymentStatus ?? 'NoAplica',
  };
}
```

**Rejected:** keep the raw cast and rely on the backend always sending the fields — rejected
because the defaults are the plan's stated safety contract and the frontend must build/test
without a live backend (mocked responses may omit fields).

### DG-2 — Field name is `isInTrial`, NOT `isTrial` (spec-vs-plan)

The **design spec** names the field `isTrial`; the **plan** and **proposal** name it
`isInTrial`. **Canonical = `isInTrial`** (plan is the later, file-level authority; proposal
already locked it). Tasks/apply must use `isInTrial` everywhere (type, mapping, banner).

### DG-3 — Collections/commissions loader: `adminFeatureLoader` LOCKS RESELLERS OUT (plan-vs-code) ⚠️

**Plan says:** both new routes use `clientLoader = adminFeatureLoader([EFeatures.Stores])`.
**Code reality:** `adminFeatureLoader` runs `adminLoader()` first, which denies anyone who is
not `isSuperAdmin || isOwnerAdmin`. A **ReSeller is neither** → the plan's loader would deny
resellers access to the very views built for them (design spec: "Super admin — all; ReSeller —
their own").

**Precedent in code:** the reseller-facing management pages (`admin/owners/*`) use
`resellerFeatureLoader([EFeatures.Owners])`, which runs `resellerLoader()` (allows
`isSuperAdmin || isReSeller`) then `featureGate([...])`. `superAdminLoader` is used only for
super-admin-only pages (`admin/stores`, `admin/resellers`).

**Decision:** use **`resellerFeatureLoader([EFeatures.Stores])`** for BOTH `collections.tsx`
and `reseller-commissions.tsx`, mirroring the owners precedent. Backend scopes the data by role.

**Open assumption (resolve in tasks):** `featureGate` also requires the user's `featureIds` to
include `EFeatures.Stores` (= 73). If resellers are NOT seeded that feature, `resellerFeatureLoader`
will still deny them at the feature step. **Fallback:** bare `resellerLoader` (role-only, no
feature gate) guarantees access by role and matches the design intent ("data scoping is backend").
Verify reseller `featureIds` seeding before committing to `resellerFeatureLoader`; if unseeded,
downgrade to `resellerLoader`.

**Symbol confirmations:** `EFeatures` is exported from `@store-mgmt/domain`
(`packages/domain/src/enums/index.ts`); `EFeatures.Stores = 73`, `EFeatures.Users = 72`.
`adminFeatureLoader`, `resellerFeatureLoader`, `resellerLoader`, `superAdminLoader` all exist in
`app/auth/routes/loaders.ts`.

### DG-4 — `Store.paymentStartDate` → `Date | null` is safe (nullability gate)

Every reader of the **domain** `Store.paymentStartDate` in `frontend-react/` app code was
grepped. None break under `Date | null`:

| Call-site | Reads it how | Null-safe? |
|-----------|-------------|------------|
| `management/stores/components/store-form.tsx:58-60` | `initialValues?.paymentStartDate ? new Date(...) : ''` | ✅ optional-chain + truthy ternary → null falls to `''` |
| `management/stores/routes/edit-store.tsx:103,119` | local `StoreFormValues.paymentStartDate: string` (form value, `values.paymentStartDate`) — NOT the domain field | ✅ separate type |
| `management/stores/lib/services/store-http-service.ts:19` | `UpdateStorePayload.paymentStartDate: string` (request payload) — NOT the domain field | ✅ separate type |
| tests (`store-list`, `store-card-list`, `owner-edit`, `store-routes`, `store-http-service`) | fixtures set `new Date()` / `'2024-01-01'` | ✅ `Date`/`string` assignable to `Date \| null` |

**Note on the http service (plan-vs-code):** the plan's Task 3 Step 1 says "update
`store-http-service.ts` mapping to `res.paymentStartDate ? new Date(...) : null`". **There is
no such mapping** — `getStore`/`listStores` return `response.data` via a raw cast; the runtime
value is actually a string, and `store-form` does the `new Date()` itself. So the nullable
change is a **type-only change** on the domain model plus the `StoreToCollect`/`ReSellerCommission`
additions. No runtime Date-conversion code exists to modify in the service. (Adding an explicit
null-normalizing map to `getStore` is OPTIONAL hardening, not required for correctness.)

### DG-5 — `readOnly` activation gate depends on backend sending `null` (not `''`) ⚠️

The plan's gate is `readOnly={!isSuperAdmin && initialValues?.paymentStartDate != null}`.
Because `store-http-service` raw-casts, `paymentStartDate` arrives at runtime as whatever the
backend serializes. If the backend sends **empty string** for a never-activated store,
`'' != null` is `true` → the picker locks incorrectly. The design spec mandates the backend
column becomes **nullable** and returns `null` when never activated, so `null != null` → `false`
→ interactive. **Contract:** backend MUST return `paymentStartDate: null` (JSON null) for
non-activated stores. Record as a cross-boundary assumption.

### DG-6 — Mount point confirmed

`app-layout.tsx` renders `<Navbar … />` (line 54) then `<Breadcrumbs />` (line 55) inside the
main column. `PaymentBanner` mounts **between** them. Both symbols exist and are imported there.

### DG-7 — Currency + i18n confirmed

- `formatCurrency(amount: number): string` at `~/shared/lib/format-currency` — uses
  `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`. Do NOT use
  `intl.formatNumber` for money (the `es` locale renders `US$` / comma decimals). Amounts in
  collections/commissions use `formatCurrency`.
- `es.ts` is a **flat object of quoted dotted keys** (e.g. `'STORES.PLAN.BILLING_NOTICE': '…'`).
  New keys follow the `BILLING.*` namespace. UI copy = neutral Latin American Spanish, NO voseo
  (no "tenés/pagás/registrá/vos"); impersonal/tuteo only.

## Banner state machine

`PaymentBanner` reads `status = user?.paymentStatus ?? 'NoAplica'` and renders:

| status | isInTrial | Rendered | Tone |
|--------|-----------|----------|------|
| `NoAplica` | — | nothing (`null`) | — |
| `AlDia` | — | nothing (`null`) | — |
| `PorVencer` / `EnGracia` | `true` | `BILLING.TRIAL_NOTICE` ({date}) | blue |
| `PorVencer` / `EnGracia` | `false` | `BILLING.DUE_NOTICE` ({date}) | amber |
| `Vencido` | any | `BILLING.OVERDUE_NOTICE` | red |

Due date formatted via `intl.formatDate(new Date(paymentDueDate), { day:'2-digit', month:'2-digit', year:'numeric' })`.
`role="status"` on the container (live-region a11y). Priority: `Vencido` wins over trial.

## Routing decisions

- Register both routes inside the existing authenticated `layout('shared/components/app-layout.tsx', { id: 'app-layout' }, [...])` block in `app/routes.ts`, alongside the `management/stores*` entries.
- Paths (deep-link only; no sidebar entry per scope): `management/stores/collections`,
  `management/stores/commissions`.
- The three existing `management/stores*` routes reuse one file with distinct `id`s; the two
  new routes are distinct files, so no `id` collision. Follow the `user-list.tsx` page shape:
  `export default function XxxPage()` + `export const clientLoader = <loader>` + `useState` list
  + `useEffect` load.

## Testing strategy

Strict TDD (failing test first). Vitest + `@testing-library/react` wrapped in
`<IntlProvider locale="es" messages={esMessages}>`. Mock `useAuthStore` (banner) and the
`store-http-service`/`auth-http-service` methods (routes/mapping). Coverage per the plan:
mapping defaults; 5 banner variants; PlanPicker readOnly (no Activar button, no `onChange`);
collections rows + mark-paid reload; commissions period/total formatting. Automated gate =
`vitest run` + `tsc --noEmit` + `pnpm -C packages/domain build` after each domain export change.
**Manual validation is DEFERRED** — it cannot pass until the backend ships the getMe fields and
3 endpoints.

## Rejected alternatives

- **Client-side entitlement/enforcement** (hide paid modules on the client when `Vencido`) —
  rejected. Backend already pre-filters `storeModuleIds`; duplicating it on the client would
  create a second source of truth and drift. Client stays a pure projection.
- **Deriving `paymentStatus`/due-date on the client** from `paymentStartDate` + config —
  rejected. The design spec computes status server-side on read (grace-day boundaries, trial
  window); re-deriving on the client risks off-by-one/clock-skew divergence.
- **New Zustand slice for billing** — rejected. Billing state is per-user and already arrives on
  `UserModel`; a separate store adds sync burden for zero benefit.
- **`adminFeatureLoader` for collections/commissions** (per plan) — rejected (DG-3): it denies
  resellers.

## Checklist (for tasks/apply)

- [ ] `UserModel` gains `paymentDueDate: string | null`, `isInTrial: boolean`, `paymentStatus: PaymentStatus`; `PaymentStatus` type added — rebuild domain.
- [ ] `getMe` rewritten to explicit map with `?? null / false / 'NoAplica'` (DG-1).
- [ ] Field is `isInTrial` everywhere (DG-2).
- [ ] `Store.paymentStartDate` → `Date | null`; `StoreToCollect`, `ReSellerCommission` added — rebuild domain (DG-4).
- [ ] `PaymentBanner` mounted between `<Navbar/>` and `<Breadcrumbs/>` (DG-6).
- [ ] `PlanPicker` gets `readOnly?: boolean`; `store-form` passes `!isSuperAdmin && initialValues?.paymentStartDate != null` (DG-5 backend-null contract noted).
- [ ] Collections + commissions use `resellerFeatureLoader([EFeatures.Stores])` (verify reseller feature seeding; else `resellerLoader`) (DG-3).
- [ ] `formatCurrency` for money; `BILLING.*` keys in `es.ts`, neutral LatAm, NO voseo (DG-7).

## Next step

`sdd-tasks` (after spec is ready) — mechanical breakdown mirroring the plan's 5 tasks, carrying
DG-1..DG-7 as explicit resolutions so apply doesn't chase the plan's ghost symbols.
