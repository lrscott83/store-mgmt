/**
 * Public plan pricing for the landing ("Precios") — owner request 2026-10-15.
 *
 * The landing is a public page with no session, so this reads the anonymous endpoint
 * (`GET /v1/public/plans`). It returns the REAL prices configured in the DB, restricted to the
 * modules that are active and available to stores. Prices are in USD.
 */
const API_URL = (import.meta.env['API_URL'] as string | undefined) ?? '';

export interface PublicPlanModulePricing {
  moduleId: number;
  name: string;
  /** Pre-discount price; 0 when the module is included in the plan. */
  basePrice: number;
  /** What the store pays; 0 when the module is included in the plan. */
  currentPrice: number;
}

export interface PublicPlanPricing {
  planType: string;
  name: string;
  order: number;
  basePrice: number;
  currentPrice: number;
  modules: PublicPlanModulePricing[];
}

/** Reads the public plan catalog. Throws when the request fails (the caller hides the section). */
export async function fetchPublicPlanPricing(): Promise<PublicPlanPricing[]> {
  const response = await fetch(`${API_URL}/v1/public/plans`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`public plans request failed with ${response.status}`);
  }
  const body = (await response.json()) as { data?: PublicPlanPricing[] | null };
  return body.data ?? [];
}
