import type { AuditableBaseModel } from './base';

export interface Module {
  id: number;
  name: string;
  price: number;
  currentPrice: number;
  priceIncluded: boolean;
  discountText: string;
  selected: boolean;
  // Flat and percent discount, already on the wire: the backend `ModuleDto`
  // serializes both and this type used to drop them. Declared OPTIONAL because every
  // construction site predates these fields — promote to required only together with
  // the fixtures that build `Module` literals. Read them with `?? 0`.
  //
  // They carry real values on CATALOG modules (GET /v1/modules/ToStore), which is
  // where a per-store pricing editor must seed its inputs from.
  // CAVEAT: the backend's `StoreModule -> ModuleDto` AutoMapper map
  // (Application/Mappings/Administration/ModuleProfile.cs:20-31) has no rule for these
  // two, so modules nested in a Store/StorePlan/OwnerStoreWithPlan response report 0
  // for both while `currentPrice` IS computed from the real values. Do not seed
  // editable values from those.
  discountPrice?: number;
  percentDiscountPrice?: number;
  // The other input to THE price rule (`isActive && !priceIncluded`), additive on
  // `ModuleDto`. Required: every catalog read sends it, and the rule cannot be applied
  // to a row that does not say whether the module is live.
  isActive: boolean;
}

export interface Feature {
  id: number;
  name: string;
  moduleId: number;
  displayName: string;
  description: string;
  order: number;
  availableToStore: boolean;
}

export interface Store {
  id: string;
  name: string;
  displayName: string;
  ownerId: string;
  ownerName: string;
  address: string;
  description: string;
  approved: boolean;
  // Nullable ISO date string (backend `DateOnly?`, raw passthrough — no mapping
  // layer produces a `Date`). `null` means the store never activated the paid
  // plan. Cross-boundary assumption (DG-6): the backend MUST serialize JSON
  // `null` here (never `""`) for a never-activated store; not enforceable
  // client-side.
  paymentStartDate: string | null;
  // Nullable ISO date string (backend `DateOnly?`, raw passthrough). Null when the
  // billing clock never started (PaymentStartDate null) — never a 0001-01-01
  // sentinel. Computed server-side with the canonical GetNextDueDate calculation,
  // the same value the store plan view shows.
  nextPaymentDate: string | null;
  // Owner's contact phone (Owner.User.CellPhone). Nullable: the User entity allows
  // a missing cell phone, so the card renders no link when absent.
  ownerPhone: string | null;
  // Backend-serialized plan name ("Gratis" | "Pago" | "Superior" | "VIP") from
  // Store.StorePlanId — same source as StorePlan.planType. The super-admin store
  // cards and the plan filter read it; the frontend never infers the active plan
  // from module flags (that heuristic contradicted seeded membership).
  planType: string;
  // CANONICAL plan price (docs/plans/2026-09-15-store-plan-canonical-price-plan.md):
  // Σ over the plan's member modules from the LIVE catalog, same formula the plan
  // view (GET /v1/plans) uses — never the store's frozen module snapshot. Null
  // when the store is disapproved or its plan is missing/inactive: the card shows
  // the plan name only.
  planPrice: number | null;
  planCurrentPrice: number | null;
  modules: Module[];
  isActive: boolean;
}

export interface StorePlan {
  storeId: string;
  storeName: string;
  address: string;
  description: string;
  approved: boolean;
  isActive: boolean;
  paymentStartDate: string | null;
  // Nullable ISO date string (backend `DateOnly?`). Null when the store has no
  // calculable next billing date (never activated the paid plan).
  nextDueDate: string | null;
  modules: Module[];
  // Backend-serialized plan name ("Gratis" | "Pago" | "Superior") from
  // Store.StorePlanId — the frontend never infers the active plan from module
  // flags (that heuristic contradicted seeded membership).
  planType: string;
}

/**
 * Plan member module row of the plan catalog (GET /v1/plans). Backend prices
 * come from the live module catalog, same CurrentPriceServiceUtils as the
 * module catalog endpoint.
 */
export interface PlanModule {
  moduleId: number;
  name: string;
  order: number;
  priceIncluded: boolean;
  // The catalog module's live flag, additive on `PlanModuleDto`. Together with
  // `priceIncluded` it is what `isBillableModule` reads, so a client can tell a plan
  // module that reaches the plan total from one excluded by the rule.
  isActive: boolean;
  price: number;
  currentPrice: number;
  discountPrice: number;
  percentDiscountPrice: number;
  discountText: string;
  featureDescriptions: string[];
}

/**
 * Plan catalog entry (GET /v1/plans): the three active plans — Gratis, Pago,
 * Superior (VIP excluded server-side) — with member modules and the computed
 * plan price (Σ member module currentPrice).
 */
export interface Plan {
  id: number;
  name: string;
  order: number;
  planType: string;
  price: number;
  modules: PlanModule[];
}

/**
 * Owner's "my stores" listing item (GET /v1/stores/my-stores): every store the
 * current user owns — active AND inactive — with the store's own module price
 * snapshot and the calculated next billing date. Distinct from Store/StorePlan:
 * it backs the owner's store cards view.
 */
export interface OwnerStoreWithPlan {
  id: string;
  name: string;
  isActive: boolean;
  approved: boolean;
  // Nullable ISO date string (backend `DateOnly?`). Null when the store never
  // activated the paid plan.
  paymentStartDate: string | null;
  // Nullable ISO date string (backend `DateOnly?`). Null when the billing clock
  // never started (paymentStartDate null) — same calculation as the plan view.
  nextDueDate: string | null;
  // Store's own module snapshot (prices frozen at activation).
  modules: Module[];
  // Backend-serialized plan name ("Gratis" | "Pago" | "Superior"), same source
  // as StorePlan.planType.
  planType: string;
  // CANONICAL plan price (docs/plans/2026-09-15-store-plan-canonical-price-plan.md):
  // Σ over the plan's member modules from the LIVE catalog, same formula the plan
  // view (GET /v1/plans) uses — never the store's frozen module snapshot. Null
  // when the store is disapproved or its plan is missing/inactive.
  planPrice: number | null;
  planCurrentPrice: number | null;
}

export interface StoreToCollect {
  storeId: string;
  storeName: string;
  ownerName: string;
  amount: number;
  nextDueDate: string | null;
  status: 'PorVencer' | 'EnGracia';
}

/**
 * One row of the per-store module pricing save (PUT
 * /v1/stores/{storeId}/module-pricing). The payload is the COMPLETE set the operator
 * was shown — every active, AvailableToStore module — each with a tick and the three
 * price fields. A module left out of the payload is NOT deactivated: absence means
 * "not part of this edit", never "remove".
 *
 * DELIBERATELY no `isActive`/`priceIncluded` here, unlike every other pricing shape:
 * the request row is `StoreModulePricingRequest(ModuleId, IsSelected, Price,
 * DiscountPrice, PercentDiscountPrice)` (UpdateStoreModulePricingCommand.cs:25-30) and the
 * server resolves BOTH rule flags itself — from the `StoreModule` snapshot the save just
 * wrote (insert/reactivate freeze them from the catalog), never from the request
 * (StoreModulePricingDto.cs:32-39). `isSelected` IS the tick that becomes `IsActive`.
 */
export interface StoreModulePricingPayload {
  moduleId: number;
  isSelected: boolean;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
}

/** Saved state of one row, echoed back by the save. */
export interface StoreModulePricingRow {
  moduleId: number;
  isActive: boolean;
  // The store's frozen `ModulePriceIncluded`, echoed server-side. The second input to
  // `isBillableModule`, and the reason this row can report a non-zero `currentPrice`
  // that never reaches the total.
  priceIncluded: boolean;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
  currentPrice: number;
}

/**
 * Result of the save: the echoed state of every submitted row plus the total over the
 * BILLABLE ones. `totalCurrentPrice` is the same arithmetic `totalModulePricing` computes
 * in the browser (the same `ModulePriceCalculator` rule, double accumulation on the server),
 * so the two can be compared directly — see the epsilon note in `module-pricing.ts` before
 * asserting exact equality.
 */
export interface StoreModulePricingResult {
  storeId: string;
  modules: StoreModulePricingRow[];
  totalCurrentPrice: number;
}

/**
 * One row of the per-store module pricing READ (GET /v1/stores/{storeId}/module-pricing):
 * the seed the editor opens with. A distinct type from `StoreModulePricingRow` because it
 * carries the module `name` — the read has to render on its own, while the save echo is keyed
 * purely by moduleId since the client already holds the names.
 */
export interface StoreModulePricingReadRow {
  moduleId: number;
  name: string;
  isActive: boolean;
  // The store's frozen `ModulePriceIncluded` when a row exists, else the catalog's — what
  // ticking the row WOULD freeze. The second input to `isBillableModule`, so the editor
  // can show the billable amount before the save.
  priceIncluded: boolean;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
  currentPrice: number;
}

/**
 * The pricing read: one row per module that is active and available to stores — the exact
 * universe the save payload must carry — plus the total over the BILLABLE rows
 * (`isBillableModule`: active and not price-included).
 *
 * This is the only trustworthy source of a store's own discount values: modules nested in a
 * `Store`/`StorePlan`/`OwnerStoreWithPlan` report 0 for both (the backend's
 * `StoreModule -> ModuleDto` AutoMapper map has no rule for them), so never seed an editor
 * from `store.modules[]`.
 */
export interface StoreModulePricingReadResult {
  storeId: string;
  modules: StoreModulePricingReadRow[];
  totalCurrentPrice: number;
}

/**
 * One row of the GLOBAL module catalog pricing save (PUT /v1/modules/pricing). Four fields
 * travel and the endpoint writes exactly them: `Price`, `DiscountPrice`,
 * `PercentDiscountPrice` and `IsActive`. Every other structural flag (AvailableToStore,
 * PriceIncluded, Name, Order) stays out of the payload's reach.
 *
 * There is no `isSelected` here, unlike the per-store payload: the catalog save carries no
 * tick for PRICING — every submitted row is priced — but `isActive` IS the module's own
 * activation switch, so a row is priced and (de)activated in the same save. A module omitted
 * from the table is simply not part of this edit (the catalog table the page shows is already
 * the complete saveable universe, `GET /v1/modules/catalog`).
 */
export interface ModuleCatalogPricingPayload {
  moduleId: number;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
  isActive: boolean;
}

/**
 * Saved state of one catalog row, echoed back by the save. Distinct from
 * `ModuleCatalogPricingPayload` because it adds the module `name` (so the echo can
 * identify the row) and the server-computed `currentPrice`.
 */
export interface ModuleCatalogPricingRow extends ModuleCatalogPricingPayload {
  name: string;
  currentPrice: number;
}

/**
 * Result of the catalog pricing save: the echoed state of every submitted row plus the
 * ungrouped total over the BILLABLE ones (`ModulePriceCalculator.CalculateTotal` on the
 * server, `totalModulePricing` in the browser). `totalCurrentPrice` is the backend's own
 * float32 arithmetic, so compare it with an epsilon against the browser total — see the
 * drift note in `module-pricing.ts`.
 */
export interface ModuleCatalogPricingResult {
  modules: ModuleCatalogPricingRow[];
  totalCurrentPrice: number;
}

export interface ReSellerCommission {
  year: number;
  month: number;
  paymentCount: number;
  totalCommission: number;
}

export interface OwnerStoreModule {
  storeId: string;
  storeName: string;
  storeModuleTotalCurrentPrice: number;
  // Nullable ISO date string (backend `DateOnly?`, raw passthrough). `null` means
  // the store has no calculable next payment date (never activated the paid plan).
  nextDueDate: string | null;
}

export interface Owner extends AuditableBaseModel {
  id: string;
  userId: string;
  login: string;
  fullName: string;
  cellPhone: string;
  email: string;
  description: string;
  guest: boolean;
  storeModules: OwnerStoreModule[];
  reSellerId: string;
  reSellerName: string;
  approved: boolean;
}

export interface ReSeller extends AuditableBaseModel {
  id: string;
  userId: string;
  // Returned by the reseller detail endpoint; omitted by the list endpoint.
  login?: string;
  fullName: string;
  percentDiscountPrice: number;
  discountPrice: number;
  cellPhone: string;
  email: string;
  description: string;
  guest: boolean;
}

export interface StoreUser {
  id: string;
  storeId: string;
  storeName: string;
  login: string;
  fullName: string;
  cellPhone: string;
  email: string;
  isActive: boolean;
}

export interface User {
  id: string;
  // Backend returns Login on both list (UserListDto) and detail (UserDto) responses.
  login: string;
  fullName: string;
  cellPhone: string;
  email: string;
  isActive: boolean;
}
