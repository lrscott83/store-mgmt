import type {
  BaseResponseModel,
  Store,
  StorePlan,
  Module,
  Feature,
  Plan,
  Owner,
  OwnerStoreWithPlan,
  StoreToCollect,
  ReSellerCommission,
  SwitchMyStoreResult,
  StoreModulePricingPayload,
  StoreModulePricingResult,
  StoreModulePricingReadResult,
  ModuleCatalogPricingPayload,
  ModuleCatalogPricingResult,
} from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

interface CreateStorePayload {
  ownerId: string;
  name: string;
  address: string;
  description: string;
  approved: boolean;
  moduleIds: number[];
}

interface UpdateStorePayload {
  id: string;
  name: string;
  address: string;
  description: string;
  approved: boolean;
  /**
   * Undefined when there is no date to send (backend only applies a non-null
   * value; an empty string would fail DateOnly binding).
   */
  paymentStartDate?: string;
  /**
   * Optional plan id (StorePlanType) sent on activation. Omitted on data-only
   * updates, so the backend leaves the store's plan untouched.
   */
  planId?: number;
  /**
   * Optional since the store-data view and the plan view were split: the
   * data-only update omits it (backend leaves the plan untouched), while the
   * plan view sends the full set.
   */
  moduleIds?: number[];
  isActive: boolean;
}

export const storeHttpService = {
  async listStores(): Promise<BaseResponseModel<Store[]>> {
    const response = await apiClient.get<BaseResponseModel<Store[]>>('/v1/stores/by-current-user');
    return response.data;
  },

  /**
   * Owner's "my stores" listing (GET /v1/stores/my-stores): every store the
   * current user owns — active AND inactive — with each store's module price
   * snapshot and the calculated next billing date. Backs the owner's store
   * cards view.
   */
  async getMyStores(): Promise<BaseResponseModel<OwnerStoreWithPlan[]>> {
    const response = await apiClient.get<BaseResponseModel<OwnerStoreWithPlan[]>>(
      '/v1/stores/my-stores',
    );
    return response.data;
  },

  /**
   * Sets a store's IsActive flag (both directions — activate AND deactivate).
   * The owner's lever over their stores; SuperAdmin keeps full reach.
   */
  async setStoreActivation(id: string, isActive: boolean): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(`/v1/stores/${id}/activation`, {
      isActive,
    });
    return response.data;
  },

  /**
   * Switches the current user's active store (PUT /v1/stores, SetMyStoreCommand).
   * The backend persists the target store as the session's SelectedStoreId.
   */
  async setMyStore(storeId: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>('/v1/stores', { storeId });
    return response.data;
  },

  /**
   * seamless-store-switch v2 — the in-session switch (PUT /v1/stores/switch,
   * SwitchMyStoreCommand): persists the selection AND returns the target
   * store's DEK wrapped under the current store's DEK, so the switch recovers
   * the new store's key with no password on any device.
   */
  async switchMyStore(
    storeId: string,
  ): Promise<BaseResponseModel<SwitchMyStoreResult>> {
    const response = await apiClient.put<BaseResponseModel<SwitchMyStoreResult>>(
      '/v1/stores/switch',
      { storeId },
    );
    return response.data;
  },

  async getStore(id: string): Promise<BaseResponseModel<Store>> {
    const response = await apiClient.get<BaseResponseModel<Store>>(`/v1/stores/${id}`);
    return response.data;
  },

  async getStorePlan(id: string): Promise<BaseResponseModel<StorePlan>> {
    const response = await apiClient.get<BaseResponseModel<StorePlan>>(`/v1/stores/${id}/plan`);
    return response.data;
  },

  async createStore(payload: CreateStorePayload): Promise<BaseResponseModel<Store>> {
    const response = await apiClient.post<BaseResponseModel<Store>>('/v1/stores', payload);
    return response.data;
  },

  async updateStore(id: string, payload: UpdateStorePayload): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.put<BaseResponseModel<boolean>>(`/v1/stores/${id}`, payload);
    return response.data;
  },

  /**
   * Toggles the store plan between Free and Paid (POST /v1/stores/{id}/toggle-plan,
   * no request body — direction is derived server-side from PaymentStartDate).
   */
  async toggleStorePlan(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      `/v1/stores/${id}/toggle-plan`,
    );
    return response.data;
  },

  /**
   * Owner-driven plan change (POST /v1/stores/{id}/change-plan, body
   * { storePlanId }): the backend validates ownership (403 for non-owners),
   * rewrites the store's module set to the target plan universe, keeps
   * PaymentStartDate untouched (the anchor is sacred) and pins
   * NextDueDateOverride = today when an overdue store upgrades to a paid plan.
   * The client sends only the plan id — no moduleIds, no store payload.
   */
  async changeStorePlan(id: string, storePlanId: number): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(
      `/v1/stores/${id}/change-plan`,
      { storePlanId },
    );
    return response.data;
  },

  /**
   * SuperAdmin authors ONE store's own module pricing (PUT
   * /v1/stores/{storeId}/module-pricing). `modules` must be the COMPLETE set the
   * operator was shown — every active, AvailableToStore module — because that
   * completeness is what makes "unticked" actionable: a ticked row is activated
   * (inserted or reactivated) and priced, an unticked row is deactivated (a soft
   * flag, never a delete), and a module OMITTED from the payload is left untouched.
   * The backend is SuperAdmin-only (403 for everyone else, owners included) and never
   * reads catalog prices as the store's price. Returns the saved state of every
   * submitted row plus the total over the ticked rows.
   */
  async updateStoreModulePricing(
    id: string,
    modules: StoreModulePricingPayload[],
  ): Promise<BaseResponseModel<StoreModulePricingResult>> {
    const response = await apiClient.put<BaseResponseModel<StoreModulePricingResult>>(
      `/v1/stores/${id}/module-pricing`,
      { modules },
    );
    return response.data;
  },

  /**
   * Seed for the per-store module pricing editor (GET /v1/stores/{storeId}/module-pricing).
   * One row per module that is active and available to stores — the same universe, from the
   * same backend call, as `getModulesToStore()`, and the exact list `updateStoreModulePricing`
   * expects as its payload. A row carries the store's own `isActive` and stored prices when a
   * StoreModule exists (inactive rows included), and `isActive: false` seeded with the live
   * catalog prices when it does not.
   *
   * Prefer this over `store.modules[]` for anything editable: the backend's
   * `StoreModule -> ModuleDto` map drops DiscountPrice/PercentDiscountPrice, so nested modules
   * report 0 for both. SuperAdmin-only, like the save.
   */
  async getStoreModulePricing(id: string): Promise<BaseResponseModel<StoreModulePricingReadResult>> {
    const response = await apiClient.get<BaseResponseModel<StoreModulePricingReadResult>>(
      `/v1/stores/${id}/module-pricing`,
    );
    return response.data;
  },

  async approveStore(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>('/v1/stores/approve', { id });
    return response.data;
  },

  async disapproveStore(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>('/v1/stores/disapprove', {
      id,
    });
    return response.data;
  },

  async getModulesToStore(): Promise<BaseResponseModel<Module[]>> {
    const response = await apiClient.get<BaseResponseModel<Module[]>>('/v1/modules/ToStore');
    return response.data;
  },

  /**
   * The SuperAdmin catalog editor's read (GET /v1/modules/catalog): every module available
   * to stores — ACTIVE OR NOT. Unlike `getModulesToStore()`, it does NOT filter `IsActive`,
   * so a deactivated module stays listed and its checkbox can switch it back on. Backs
   * `updateModulePricing` (PUT /v1/modules/pricing), whose payload now also carries
   * `isActive`.
   */
  async getModuleCatalog(): Promise<BaseResponseModel<Module[]>> {
    const response = await apiClient.get<BaseResponseModel<Module[]>>('/v1/modules/catalog');
    return response.data;
  },

  /**
   * SuperAdmin authors the GLOBAL module catalog prices (PUT /v1/modules/pricing): the
   * base price, the flat discount and the percent discount of every module in one save.
   *
   * Distinct from `updateStoreModulePricing`: that one writes frozen per-store copies on
   * `StoreModule` rows and never reads the catalog as a store's price, so editing the
   * catalog can never silently reprice a store. The payload is the COMPLETE table the
   * editor showed — `GET /v1/modules/ToStore` already returns exactly the active,
   * AvailableToStore universe, and a module id the backend does not know aborts the WHOLE
   * save rather than applying it partially. SuperAdmin-only (403 for everyone else).
   *
   * Returns the saved state of every submitted row plus the total over the whole table,
   * with `currentPrice` recomputed by the backend's shared formula.
   */
  async updateModulePricing(
    modules: ModuleCatalogPricingPayload[],
  ): Promise<BaseResponseModel<ModuleCatalogPricingResult>> {
    const response = await apiClient.put<BaseResponseModel<ModuleCatalogPricingResult>>(
      '/v1/modules/pricing',
      { modules },
    );
    return response.data;
  },

  /**
   * Plan catalog (GET /v1/plans): the three active plans — Gratis, Pago,
   * Superior — with member modules and computed prices. VIP is excluded
   * server-side; raw passthrough, no client mapping.
   */
  async getPlans(): Promise<BaseResponseModel<Plan[]>> {
    const response = await apiClient.get<BaseResponseModel<Plan[]>>('/v1/plans');
    return response.data;
  },

  /**
   * Feature catalog (GET /v1/Features/available): real Feature descriptions
   * feeding the "?" tooltips on the plan panels. Group client-side by
   * ModuleId. Raw passthrough, no client mapping.
   */
  async getFeaturesToStore(): Promise<BaseResponseModel<Feature[]>> {
    const response = await apiClient.get<BaseResponseModel<Feature[]>>('/v1/Features/available');
    return response.data;
  },

  async listOwners(): Promise<BaseResponseModel<Owner[]>> {
    const response = await apiClient.get<BaseResponseModel<Owner[]>>('/v1/owners/all/true');
    return response.data;
  },

  async getStoresToCollect(): Promise<BaseResponseModel<StoreToCollect[]>> {
    const response =
      await apiClient.get<BaseResponseModel<StoreToCollect[]>>('/v1/stores/to-collect');
    return response.data;
  },

  async registerStorePayment(id: string): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>(`/v1/stores/${id}/payments`);
    return response.data;
  },

  async getReSellerCommissions(): Promise<BaseResponseModel<ReSellerCommission[]>> {
    const response = await apiClient.get<BaseResponseModel<ReSellerCommission[]>>(
      '/v1/stores/reseller-commissions',
    );
    return response.data;
  },
};
