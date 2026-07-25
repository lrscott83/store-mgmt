# Store Paid-Plan Billing — Frontend Implementation Plan (React)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Design spec (read first for full rationale & rules):** [`docs/superpowers/specs/2026-07-25-store-paid-plan-billing-enforcement-design.md`](../specs/2026-07-25-store-paid-plan-billing-enforcement-design.md)
**Companion plan (backend, implement BEFORE this):** [`docs/superpowers/plans/2026-07-25-store-paid-plan-billing-backend.md`](2026-07-25-store-paid-plan-billing-backend.md)

**Goal:** Surface the backend paid-plan billing state in the React app: extend `UserModel`/`getMe`, show a trial/due/overdue banner, lock the `PlanPicker` for an already-activated owner, and add the collections and reseller-commission views.

**Architecture:** New `getMe` fields flow through `auth-http-service` → `auth-store` → `useAuthStore().user`. A `PaymentBanner` mounted in `app-layout` reads that state. Two new routes (collections, commissions) call new `store-http-service` methods. All presentational; the backend already enforces entitlement (`storeModuleIds` is pre-filtered).

**Tech Stack:** React 19, React Router 7 (SPA, `app/routes.ts`), react-intl, Tailwind, Zustand (`auth-store`), Vitest + @testing-library/react (`<IntlProvider locale="es" messages={esMessages}>` wrapper). Package: `frontend-react/apps/web-store-pos`; shared types in `frontend-react/packages/domain`.

## Backend contract alignment (verified against code — 2026-07-25)

These facts were confirmed by reading the actual code (backend .NET + frontend React), not comments/specs. They override any conflicting assumption elsewhere in this plan:

- **JSON is camelCase.** ASP.NET Core MVC serializes camelCase by default (the entire existing frontend already consumes `data`/`fullName`/`succeeded`). So backend `PaymentDueDate`/`IsInTrial`/`PaymentStatus` arrive as `paymentDueDate`/`isInTrial`/`paymentStatus`, and the DTOs `StoreToCollectDto`/`ReSellerCommissionDto` arrive with camelCase keys. Field names in this plan align 1:1 — no remapping.
- **`getMe` and `store-http-service` are raw passthroughs.** `authHttpService.getMe()` is `return response.data.data` and `store-http-service` methods are `return response.data` — neither does any field mapping. The new fields flow through automatically once the **TypeScript types** are extended; do NOT add a mapping layer. Defensive defaulting lives at the consumer (the banner uses `?? 'NoAplica'`).
- **API paths stay `/v1/stores/...`.** `apiClient.baseURL = import.meta.env['API_URL']` (no `/api` appended in code); the `/api` prefix lives in the `API_URL` env value. Backend serves `api/v1/stores/...`; frontend code correctly calls `/v1/stores/...`. Do NOT add `/api` in code.
- **Route gating for the two new views = `resellerFeatureLoader([EFeatures.Owners])`** (super admin + reseller). This mirrors the backend gate `[HasPermission(StoreRoleFeatures.OwnersAdmin)]` (whose `HasRoles` = `{SuperAdmin, ReSeller}` + feature `Owners`) and the existing `admin/owners` routes. `adminFeatureLoader` is WRONG here — it authorizes `{SuperAdmin, OwnerAdmin}` and excludes the ReSeller.
- **Envelope** = `BaseResponseModel<T>` `{ data, succeeded, message, actionCode, errors }` (camelCase). New store-http methods return `BaseResponseModel<T>` (matching `store-http-service` style); `getMe` alone unwraps to `.data.data`.

## Global Constraints

- **This plan depends on the BACKEND plan being merged** — it consumes `GetMe` fields `paymentDueDate` (ISO date string | null), `isInTrial` (bool), `paymentStatus` (`"NoAplica"|"AlDia"|"PorVencer"|"EnGracia"|"Vencido"`), and endpoints `GET /v1/stores/to-collect`, `GET /v1/stores/reseller-commissions`, `POST /v1/stores/{storeId}/payments`.
- **UI copy = neutral Latin American Spanish. NO voseo** (no "tenés/pagás/registrá/vos"). Impersonal/tuteo only.
- **Strict TDD:** failing test first (`./node_modules/.bin/vitest run <path>` from `frontend-react/apps/web-store-pos`), then implement.
- **After changing any `@store-mgmt/domain` export, run `pnpm -C frontend-react/packages/domain build`** (apps typecheck against `dist/`).
- **Typecheck:** `pnpm -C frontend-react/apps/web-store-pos exec tsc --noEmit`.
- **Follow existing patterns:** component files kebab-case; routes `export default function XxxPage()` + `export const clientLoader = adminFeatureLoader([...])`; currency via `~/shared/lib/format-currency`.
- Commit per task on the current branch. Conventional commits, NO AI attribution.

---

### Task 1: Extend `UserModel` + `getMe` mapping with payment state

**Files:**
- Modify: `frontend-react/packages/domain/src/models/auth.ts`
- Modify: `frontend-react/apps/web-store-pos/app/shared/lib/http/auth-http-service.ts`
- Test: `frontend-react/apps/web-store-pos/app/shared/lib/http/__tests__/auth-http-service.test.ts` (extend existing, or create)

**Interfaces:**
- Produces: `PaymentStatus` type; `UserModel.paymentDueDate: string | null`, `UserModel.isInTrial: boolean`, `UserModel.paymentStatus: PaymentStatus`.

- [ ] **Step 1: Add types to the domain package**

In `packages/domain/src/models/auth.ts`:
```ts
export type PaymentStatus = 'NoAplica' | 'AlDia' | 'PorVencer' | 'EnGracia' | 'Vencido';
```
and add to `UserModel`:
```ts
  paymentDueDate: string | null;
  isInTrial: boolean;
  paymentStatus: PaymentStatus;
```
Run `pnpm -C frontend-react/packages/domain build`.

- [ ] **Step 2: Write the failing passthrough test**

`getMe()` is a raw passthrough (`return response.data.data`) — there is NO mapping layer and none should be added. This test only proves the new fields survive the passthrough once the type is extended (it fails to compile until Step 1's type change lands). The axios body is `{ data: UserModel }`, so `apiClient.get` resolves to `{ data: { data: {...} } }` (note the double nesting):
```ts
it('carries payment billing fields from getMe', async () => {
  // mock apiClient.get to resolve { data: { data: { ...user, paymentDueDate: '2026-03-10', isInTrial: true, paymentStatus: 'PorVencer' } } }
  const user = await authHttpService.getMe();
  expect(user.paymentDueDate).toBe('2026-03-10');
  expect(user.isInTrial).toBe(true);
  expect(user.paymentStatus).toBe('PorVencer');
});
```

- [ ] **Step 3: Run — verify it fails.** `./node_modules/.bin/vitest run app/shared/lib/http/__tests__/auth-http-service.test.ts`

- [ ] **Step 4: No mapping to add — passthrough already carries the fields**

Do NOT touch `getMe`'s body. Once `UserModel` (Step 1) declares the three fields, the existing `return response.data.data` carries them through with no code change. The backend always serializes them (`CurrentUserDto` defaults `PaymentStatus` to `"NoAplica"`, `IsInTrial` to `false`, `PaymentDueDate` to `null`), so there is nothing to default here; the banner (Task 2) still guards with `?? 'NoAplica'` for the pre-backend/offline case where an older payload lacks them.

- [ ] **Step 5: Run — verify it passes; typecheck.**

- [ ] **Step 6: Commit**
```bash
git add frontend-react/packages/domain/src/models/auth.ts frontend-react/apps/web-store-pos/app/shared/lib/http/auth-http-service.ts frontend-react/apps/web-store-pos/app/shared/lib/http/__tests__/
git commit -m "feat(ui): carry payment/trial state on UserModel from getMe"
```

---

### Task 2: `PaymentBanner` in the app shell

**Files:**
- Create: `frontend-react/apps/web-store-pos/app/shared/components/payment-banner.tsx`
- Create: `frontend-react/apps/web-store-pos/app/shared/components/__tests__/payment-banner.test.tsx`
- Modify: `frontend-react/apps/web-store-pos/app/shared/components/app-layout.tsx`
- Modify: `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts`

**Interfaces:**
- Consumes: `useAuthStore().user` (Task 1 fields).
- Produces: `PaymentBanner` (default export), rendered between `<Navbar/>` and `<Breadcrumbs/>`.

- [ ] **Step 1: Add i18n keys (neutral LatAm Spanish)**

In `es.ts` (a new `// Billing` block):
```ts
  'BILLING.TRIAL_NOTICE': 'Estás usando el plan Pago en modo prueba. Última fecha de pago: {date}.',
  'BILLING.DUE_NOTICE': 'Tu plan Pago vence el {date}. Registra el pago para no perderlo.',
  'BILLING.OVERDUE_NOTICE': 'Tu plan Pago venció por falta de pago. La tienda está en el plan Gratis hasta que se registre el pago.',
```

- [ ] **Step 2: Write the failing tests**

`payment-banner.test.tsx` — mock `useAuthStore` (as in `inventory-components.test.tsx`). Cases:
```tsx
it('renders trial notice with the due date when isInTrial', () => { /* user paymentStatus='PorVencer', isInTrial=true, paymentDueDate='2026-03-10' → getByText matches /modo prueba/ and the formatted date */ });
it('renders due notice when PorVencer/EnGracia and not trial', () => { /* /vence el/ */ });
it('renders overdue notice when Vencido', () => { /* /venció por falta de pago/ */ });
it('renders nothing when NoAplica', () => { /* container empty */ });
it('renders nothing when AlDia', () => { /* container empty */ });
```

- [ ] **Step 3: Run — verify it fails.**

- [ ] **Step 4: Implement `PaymentBanner`**
```tsx
import { useIntl } from 'react-intl';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

export function PaymentBanner() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const status = user?.paymentStatus ?? 'NoAplica';
  if (status === 'NoAplica' || status === 'AlDia') return null;

  const date = user?.paymentDueDate
    ? intl.formatDate(new Date(user.paymentDueDate), { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  let messageId: string;
  let tone: string;
  if (status === 'Vencido') { messageId = 'BILLING.OVERDUE_NOTICE'; tone = 'bg-red-50 border-red-200 text-red-800'; }
  else if (user?.isInTrial) { messageId = 'BILLING.TRIAL_NOTICE'; tone = 'bg-blue-50 border-blue-200 text-blue-800'; }
  else { messageId = 'BILLING.DUE_NOTICE'; tone = 'bg-amber-50 border-amber-200 text-amber-800'; }

  return (
    <div className={`border-b px-4 py-2 text-sm ${tone}`} role="status">
      {intl.formatMessage({ id: messageId }, { date })}
    </div>
  );
}

export default PaymentBanner;
```

- [ ] **Step 5: Mount it in `app-layout.tsx`** — import and place directly above `<Breadcrumbs />`:
```tsx
        <Navbar isSidebarOpen={isSidebarOpen} onSidebarToggle={() => setIsSidebarOpen((v) => !v)} />
        <PaymentBanner />
        <Breadcrumbs />
```

- [ ] **Step 6: Run — verify it passes; typecheck; commit**
```bash
git add frontend-react/apps/web-store-pos/app/shared/components/payment-banner.tsx frontend-react/apps/web-store-pos/app/shared/components/__tests__/payment-banner.test.tsx frontend-react/apps/web-store-pos/app/shared/components/app-layout.tsx frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts
git commit -m "feat(ui): trial/due/overdue payment banner in app shell"
```

---

### Task 3: `PlanPicker` read-only lock after activation

**Files:**
- Modify: `frontend-react/packages/domain/src/models/store.ts` (`Store.paymentStartDate` → `string | null`)
- Modify: `frontend-react/apps/web-store-pos/app/management/stores/components/plan-picker.tsx` (add `readOnly` prop — current props are only `{ modules, onChange }`)
- Modify: `frontend-react/apps/web-store-pos/app/management/stores/components/store-form.tsx` (pass `readOnly`; `store-form` already holds `isSuperAdmin` + `initialValues`)
- Test: `frontend-react/apps/web-store-pos/app/management/stores/components/__tests__/plan-picker.test.tsx` (extend)

**Interfaces:**
- Consumes: `Store.paymentStartDate`, `store-form`'s `isSuperAdmin`.
- Produces: `PlanPicker` accepts `readOnly?: boolean`; when true, tabs still render but no "Activar este plan" button and no plan switching (the current plan is shown, no `onChange` fires).

- [ ] **Step 1: Make `Store.paymentStartDate` nullable (and truthfully typed)**

In `packages/domain/src/models/store.ts`: `paymentStartDate: string | null;` — NOT `Date`. `store-http-service` does **no mapping** (raw passthrough), so at runtime this field is the backend's ISO date string (`"2026-03-10"`) or `null` (backend `DateOnly?` → JSON string/null). Rebuild domain. **No `store-http-service.ts` change** — there is no mapping layer to update. `store-form.tsx` already coerces it for the date input (`initialValues?.paymentStartDate ? new Date(initialValues.paymentStartDate)... : ''`), which works for a string and yields `''` for `null`; the read-only gate uses `initialValues?.paymentStartDate != null`.

- [ ] **Step 2: Write the failing test**
```tsx
it('does not render the Activar button when readOnly', async () => {
  const { PlanPicker } = await import('../plan-picker');
  render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} readOnly /></Wrapper>);
  fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
  expect(screen.queryByRole('button', { name: 'Activar este plan' })).not.toBeInTheDocument();
});

it('does not call onChange when readOnly (no activation possible)', async () => {
  const { PlanPicker } = await import('../plan-picker');
  const onChange = vi.fn();
  render(<Wrapper><PlanPicker modules={CATALOG} onChange={onChange} readOnly /></Wrapper>);
  fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run — verify it fails.**

- [ ] **Step 4: Add `readOnly` to `PlanPicker`**

Add `readOnly?: boolean` to props (default `false`). In the panel action area, render the "Activar este plan" button only when `!readOnly`:
```tsx
        {selected === tab ? (
          <p className="text-sm font-medium text-primary">{t('STORES.PLAN.SELECTED')}</p>
        ) : readOnly ? null : (
          <button type="button" onClick={() => choosePlan(tab)} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white">
            {t('STORES.PLAN.ACTIVATE')}
          </button>
        )}
```

- [ ] **Step 5: Pass `readOnly` from `store-form.tsx`**
```tsx
          <PlanPicker
            modules={modules}
            onChange={setModuleIds}
            readOnly={!isSuperAdmin && initialValues?.paymentStartDate != null}
          />
```
(Owner already activated → locked; super admin keeps control; create mode has no `paymentStartDate` → interactive.)

- [ ] **Step 6: Run — verify it passes; typecheck; commit**
```bash
git add frontend-react/packages/domain/src/models/store.ts frontend-react/apps/web-store-pos/app/management/stores/lib/services/store-http-service.ts frontend-react/apps/web-store-pos/app/management/stores/components/plan-picker.tsx frontend-react/apps/web-store-pos/app/management/stores/components/store-form.tsx frontend-react/apps/web-store-pos/app/management/stores/components/__tests__/plan-picker.test.tsx
git commit -m "feat(ui): lock PlanPicker read-only once the paid plan is activated"
```

---

### Task 4: Collections view (stores to collect)

**Files:**
- Modify: `frontend-react/apps/web-store-pos/app/management/stores/lib/services/store-http-service.ts` (`getStoresToCollect`, `registerStorePayment`)
- Create: `frontend-react/apps/web-store-pos/app/management/stores/routes/collections.tsx`
- Modify: `frontend-react/apps/web-store-pos/app/routes.ts` (register route)
- Modify: `es.ts` (collections labels)
- Test: `frontend-react/apps/web-store-pos/app/management/stores/routes/__tests__/collections.test.tsx`

**Interfaces:**
- Consumes: `GET /v1/stores/to-collect` → `StoreToCollect[]`; `POST /v1/stores/{storeId}/payments`.
- Produces: `CollectionsPage` (default export) + `clientLoader`.

- [ ] **Step 1: Types + http methods + i18n**

Add to domain (`store.ts`):
```ts
export interface StoreToCollect {
  storeId: string;
  storeName: string;
  ownerName: string;
  amount: number;
  nextDueDate: string | null;
  status: 'PorVencer' | 'EnGracia';
}
```
Rebuild domain. In `store-http-service.ts`:
```ts
  async getStoresToCollect(): Promise<BaseResponseModel<StoreToCollect[]>> {
    return (await apiClient.get<BaseResponseModel<StoreToCollect[]>>('/v1/stores/to-collect')).data;
  },
  async registerStorePayment(storeId: string): Promise<BaseResponseModel<boolean>> {
    return (await apiClient.post<BaseResponseModel<boolean>>(`/v1/stores/${storeId}/payments`, {})).data;
  },
```
i18n:
```ts
  'BILLING.COLLECTIONS.TITLE': 'Cobros pendientes',
  'BILLING.COLLECTIONS.EMPTY': 'No hay cobros pendientes.',
  'BILLING.COLLECTIONS.STORE': 'Tienda',
  'BILLING.COLLECTIONS.OWNER': 'Propietario',
  'BILLING.COLLECTIONS.AMOUNT': 'Monto',
  'BILLING.COLLECTIONS.DUE_DATE': 'Vence',
  'BILLING.COLLECTIONS.STATUS': 'Estado',
  'BILLING.COLLECTIONS.MARK_PAID': 'Registrar pago',
  'BILLING.STATUS.PorVencer': 'Por vencer',
  'BILLING.STATUS.EnGracia': 'En gracia',
```

- [ ] **Step 2: Write the failing test** — mock `store-http-service.getStoresToCollect` to resolve two rows; assert the table renders both store names, amounts formatted via `formatCurrency`, status labels, and that clicking "Registrar pago" calls `registerStorePayment(storeId)` then reloads the list.

- [ ] **Step 3: Run — verify it fails.**

- [ ] **Step 4: Implement `collections.tsx`** — follow the `user-list.tsx` shape (loader export + `useState`/`useEffect` fetch via the module http service), but gate for super admin + reseller: `export const clientLoader = resellerFeatureLoader([EFeatures.Owners]);` (import from `~/auth/routes/loaders`). This mirrors the backend `[HasPermission(StoreRoleFeatures.OwnersAdmin)]` and the `admin/owners` routes — do NOT use `adminFeatureLoader` (it excludes the ReSeller). `useEffect` load via `getStoresToCollect`, a table with columns (store/owner/amount/due/status) + a "Registrar pago" button per row calling `registerStorePayment` then reloading. Amount via `formatCurrency`. Empty-state text `BILLING.COLLECTIONS.EMPTY`.

- [ ] **Step 5: Register the route** in `app/routes.ts` inside the `app-layout` children array (same place `admin/owners` is registered — the per-route `clientLoader` above is the gate), path e.g. `management/stores/collections`.

- [ ] **Step 6: Run — verify it passes; typecheck; commit**
```bash
git add frontend-react/packages/domain/src/models/store.ts frontend-react/apps/web-store-pos/app/management/stores/lib/services/store-http-service.ts frontend-react/apps/web-store-pos/app/management/stores/routes/collections.tsx frontend-react/apps/web-store-pos/app/routes.ts frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts frontend-react/apps/web-store-pos/app/management/stores/routes/__tests__/collections.test.tsx
git commit -m "feat(ui): collections view (stores due/in grace) with mark-paid action"
```

---

### Task 5: Reseller commission view

**Files:**
- Modify: `store-http-service.ts` (`getReSellerCommissions`)
- Create: `frontend-react/apps/web-store-pos/app/management/stores/routes/reseller-commissions.tsx`
- Modify: `app/routes.ts`, `es.ts`
- Test: `.../__tests__/reseller-commissions.test.tsx`

**Interfaces:**
- Consumes: `GET /v1/stores/reseller-commissions` → `ReSellerCommission[]`.
- Produces: `ReSellerCommissionsPage` (default export) + `clientLoader`.

- [ ] **Step 1: Type + http method + i18n**

Domain (`store.ts`):
```ts
export interface ReSellerCommission {
  year: number;
  month: number;
  paymentCount: number;
  totalCommission: number;
}
```
Rebuild domain. `store-http-service.ts`:
```ts
  async getReSellerCommissions(): Promise<BaseResponseModel<ReSellerCommission[]>> {
    return (await apiClient.get<BaseResponseModel<ReSellerCommission[]>>('/v1/stores/reseller-commissions')).data;
  },
```
i18n:
```ts
  'BILLING.COMMISSIONS.TITLE': 'Comisiones',
  'BILLING.COMMISSIONS.EMPTY': 'No hay comisiones registradas.',
  'BILLING.COMMISSIONS.PERIOD': 'Período',
  'BILLING.COMMISSIONS.COUNT': 'Pagos',
  'BILLING.COMMISSIONS.TOTAL': 'Total',
```

- [ ] **Step 2: Write the failing test** — mock `getReSellerCommissions` to resolve `[{year:2026,month:5,paymentCount:2,totalCommission:800},{year:2026,month:6,paymentCount:1,totalCommission:200}]`; assert rows render period `05/2026`, `06/2026`, counts, and totals via `formatCurrency`.

- [ ] **Step 3: Run — verify it fails.**

- [ ] **Step 4: Implement `reseller-commissions.tsx`** — same `user-list.tsx` shape; `export const clientLoader = resellerFeatureLoader([EFeatures.Owners]);` (import from `~/auth/routes/loaders`) — super admin + reseller, mirroring the backend `[HasPermission(StoreRoleFeatures.OwnersAdmin)]`; the backend scopes the rows (reseller sees only their own). Do NOT use `adminFeatureLoader`. Table columns period (`String(month).padStart(2,'0')/year`), count, total (`formatCurrency`). Empty-state `BILLING.COMMISSIONS.EMPTY`.

- [ ] **Step 5: Register the route** in `app/routes.ts` (path e.g. `management/stores/commissions`).

- [ ] **Step 6: Run — verify it passes; typecheck; commit**
```bash
git add frontend-react/packages/domain/src/models/store.ts frontend-react/apps/web-store-pos/app/management/stores/lib/services/store-http-service.ts frontend-react/apps/web-store-pos/app/management/stores/routes/reseller-commissions.tsx frontend-react/apps/web-store-pos/app/routes.ts frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts frontend-react/apps/web-store-pos/app/management/stores/routes/__tests__/reseller-commissions.test.tsx
git commit -m "feat(ui): reseller commission view (totals by period)"
```

---

## Final validation

- [ ] `pnpm -C frontend-react/packages/domain build` — domain types current.
- [ ] `./node_modules/.bin/vitest run app/management/stores app/shared` (from `frontend-react/apps/web-store-pos`) — green.
- [ ] `pnpm -C frontend-react/apps/web-store-pos exec tsc --noEmit` — clean.
- [ ] Manual: with a store in trial the banner shows the due date; overdue store shows the free plan + overdue banner; an activated owner sees the PlanPicker read-only; super admin/reseller see collections + commissions.

## Notes

- Menu/sidebar entries for the two new routes are optional and not in scope here (deep-link routes are enough); add them following `menu-config.ts` if desired.
- The mark-paid action reuses `POST /v1/stores/{storeId}/payments`; the backend authorizes super admin + owning reseller.
