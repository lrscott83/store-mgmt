import type { AuditableBaseModel } from './base';

export interface Module {
  id: number;
  name: string;
  price: number;
  currentPrice: number;
  priceIncluded: boolean;
  discountText: string;
  selected: boolean;
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
}

export interface StoreToCollect {
  storeId: string;
  storeName: string;
  ownerName: string;
  amount: number;
  nextDueDate: string | null;
  status: 'PorVencer' | 'EnGracia';
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
