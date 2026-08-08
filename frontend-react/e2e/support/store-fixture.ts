import type { Page } from '@playwright/test';
import { E2E_API_URL } from './backend-url';
import { readBearerToken } from './auth-storage';

/**
 * S2-01 (design.md D1). Server-side SEEDING, not a user flow: this file
 * degrades an already-existing store to the free plan by issuing real
 * `GET`/`PUT` requests against `E2E_API_URL` with `page.request`, using the
 * Bearer token of the already-authenticated `owner-admin` session
 * (`readBearerToken`, `auth-storage.ts`). It never drives the browser UI.
 *
 * This precondition is reachable ONLY because of **H-15**
 * (`docs/testing/e2e-stage-1/README.md`): the backend has no server-side
 * lock on a store's module set — `UpdateStoreCommand.cs`'s only guard is
 * `IsSuperAdminOrOwnerAdmin` (`:71-72`). DG-7's lock is a UI-only guarantee
 * (`plan-picker.tsx:9-15`). If H-15 were ever fixed, this fixture — and the
 * spec it seeds — would lose its precondition.
 */

export interface ModuleCatalog {
  freeIds: number[];
  paidIds: number[];
  allIds: number[];
}

export interface FreePlanPrecondition extends ModuleCatalog {
  storeId: string;
  /** Non-null by contract — pinned in step 4 below. This is what S2-02 needs. */
  paymentStartDate: string;
}

interface CatalogModule {
  id: number;
  priceIncluded: boolean;
}

interface StoreSnapshot {
  name: string;
  address: string;
  modules: Array<{ id: number }>;
  paymentStartDate: string | null;
}

type ApiEnvelope<T> =
  | { data: T; succeeded: true }
  | { data: null; succeeded: false; message: string | null };

const STORES_FEATURE_ID = 73; // EFeatures.Stores (StoreRoleFeatures.cs:192-195)

async function requireBearerToken(page: Page): Promise<string> {
  const token = await readBearerToken(page);
  if (!token) {
    throw new Error(
      'store-fixture: no Bearer token found in localStorage (`token` key). Restore a signed-in ' +
        'persona (signedInPage) before calling readModuleCatalog()/degradeStoreToFreePlan().'
    );
  }
  return token;
}

async function fetchStore(page: Page, storeId: string, token: string): Promise<StoreSnapshot> {
  const response = await page.request.get(`${E2E_API_URL}/v1/stores/${storeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body: ApiEnvelope<StoreSnapshot> | null = null;
  try {
    body = (await response.json()) as ApiEnvelope<StoreSnapshot>;
  } catch {
    body = null;
  }
  if (!response.ok() || !body?.succeeded) {
    throw new Error(
      `store-fixture: GET /v1/stores/${storeId} failed (status ${response.status()}) while reading ` +
        'the store — cannot seed or verify the free-plan precondition without it.'
    );
  }
  return body.data;
}

/**
 * Reads the real module catalog (`GET /v1/modules/ToStore`) and splits it by
 * `priceIncluded` — REQ-12: never hardcode the four ids in the test.
 */
export async function readModuleCatalog(page: Page): Promise<ModuleCatalog> {
  const token = await requireBearerToken(page);
  const response = await page.request.get(`${E2E_API_URL}/v1/modules/ToStore`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body: ApiEnvelope<CatalogModule[]> | null = null;
  try {
    body = (await response.json()) as ApiEnvelope<CatalogModule[]>;
  } catch {
    body = null;
  }
  if (!response.ok() || !body?.succeeded) {
    throw new Error(
      `store-fixture: GET /v1/modules/ToStore failed (status ${response.status()}) while reading ` +
        'the module catalog — cannot compute free/paid module ids without it.'
    );
  }
  const freeIds = body.data.filter((m) => m.priceIncluded).map((m) => m.id);
  const paidIds = body.data.filter((m) => !m.priceIncluded).map((m) => m.id);
  const allIds = body.data.map((m) => m.id);
  return { freeIds, paidIds, allIds };
}

/**
 * Degrades `storeId` to the free plan via a real `PUT /v1/stores/{id}`
 * (design.md D1, 4 steps — step 4 is mandatory, not optional):
 *
 * 1. Read the real module catalog, split into free/paid/all ids.
 * 2. Read the store's current `name`/`address` — `UpdateStoreCommand.cs:81-82`
 *    overwrites both unconditionally, so they have to be carried forward.
 * 3. `PUT` with `moduleIds: freeIds`.
 * 4. Re-`GET` and throw a loud, diagnosable error if the store did not end
 *    up exactly where step 3 asked it to — same precondition-pinning
 *    pattern as `plantRoster()` (`roster-fixture.ts:298-326`).
 */
export async function degradeStoreToFreePlan(
  page: Page,
  storeId: string
): Promise<FreePlanPrecondition> {
  const token = await requireBearerToken(page);
  const catalog = await readModuleCatalog(page);
  const { name, address } = await fetchStore(page, storeId, token);

  const putResponse = await page.request.put(`${E2E_API_URL}/v1/stores/${storeId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      id: storeId,
      name,
      address,
      description: null,
      approved: false,
      paymentStartDate: null,
      isActive: true,
      moduleIds: catalog.freeIds,
    },
  });
  let putBody: ApiEnvelope<boolean> | null = null;
  try {
    putBody = (await putResponse.json()) as ApiEnvelope<boolean>;
  } catch {
    putBody = null;
  }
  if (!putResponse.ok() || !putBody?.succeeded) {
    throw new Error(
      `store-fixture: PUT /v1/stores/${storeId} failed (status ${putResponse.status()}) while ` +
        `degrading the store to the free plan (moduleIds=[${catalog.freeIds.join(',')}]).`
    );
  }

  const reread = await fetchStore(page, storeId, token);
  const observedIds = [...reread.modules.map((m) => m.id)].sort((a, b) => a - b);
  const expectedIds = [...catalog.freeIds].sort((a, b) => a - b);
  const idsMatch =
    observedIds.length === expectedIds.length &&
    observedIds.every((id, index) => id === expectedIds[index]);

  if (!idsMatch) {
    throw new Error(
      `store-fixture: degradeStoreToFreePlan(${storeId}) precondition mismatch — expected module ` +
        `ids [${expectedIds.join(',')}] after the PUT, observed [${observedIds.join(',')}]. The ` +
        'free-plan precondition this spec relies on was not actually written.'
    );
  }
  if (!reread.paymentStartDate) {
    throw new Error(
      `store-fixture: degradeStoreToFreePlan(${storeId}) precondition mismatch — expected ` +
        'paymentStartDate to remain non-null after degrading to the free plan ' +
        '(UpdateStoreCommand.cs:96 only clears it when the store had none to begin with), observed ' +
        'null. S2-02 depends on this staying non-null.'
    );
  }

  return {
    storeId,
    freeIds: catalog.freeIds,
    paidIds: catalog.paidIds,
    allIds: catalog.allIds,
    paymentStartDate: reread.paymentStartDate,
  };
}

/**
 * REQ-13/D9: asserts `user.featureIds` contains the `Stores` feature (73)
 * BEFORE exercising anything else. Without it, `adminFeatureLoader`
 * (`loaders.ts:107-113`) logs the user out on `/management/stores` instead
 * of rendering the form (H-7/H-8) — a silent logout that would otherwise
 * fail every downstream assertion for the wrong, undiagnosable reason.
 * Noisy-failure pattern mirrored from `session.ts:164-171`
 * (`createStoreUserViaUi`'s redirect-to-/login guard).
 */
export async function assertStoresFeature(page: Page): Promise<void> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) {
    throw new Error(
      'store-fixture: assertStoresFeature — localStorage.currentUser is empty. Expected an ' +
        'already-authenticated OwnerAdmin session (signedInPage) before this guard runs.'
    );
  }

  let featureIds: number[];
  try {
    featureIds = (JSON.parse(raw) as { featureIds?: number[] }).featureIds ?? [];
  } catch (cause) {
    throw new Error(
      'store-fixture: assertStoresFeature — localStorage.currentUser is not valid JSON: ' +
        `${cause instanceof Error ? cause.message : String(cause)}.`
    );
  }

  if (!featureIds.includes(STORES_FEATURE_ID)) {
    throw new Error(
      `store-fixture: assertStoresFeature — user.featureIds does not include ` +
        `${STORES_FEATURE_ID} (feature Stores, module Management). Without it, ` +
        'adminFeatureLoader([EFeatures.Stores]) logs this user out of /management/stores instead ' +
        'of rendering the form (H-7/H-8) — every downstream assertion in this scenario would fail ' +
        'as a silent logout, not as a readable assertion failure.'
    );
  }
}
