import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { E2E_API_URL } from './backend-url';
import { readBearerToken } from './auth-storage';

/**
 * S2-01 (design.md D1). Server-side SEEDING, not a user flow: this file
 * degrades an already-existing store to the free plan by writing the
 * `StoreModule` rows directly in the test database (`pg` Client, same
 * connection strategy as `global-teardown.ts`). The module catalog and the
 * post-condition verification still go through the real API
 * (`GET /v1/modules/ToStore`, `GET /v1/stores/{id}`) with `page.request`.
 * It never drives the browser UI.
 *
 * WHY DIRECT-DB AND NOT `PUT /v1/stores/{id}`: **H-15**
 * (`docs/testing/e2e-stage-1/README.md`) added a server-side one-way lock to
 * `UpdateStoreCommand.cs` — a non-SuperAdmin caller may no longer change the
 * module set of a store that has any active paid module (HTTP 400
 * `PlanLocked`). The owner-admin session this suite uses therefore cannot
 * degrade a paid store through the API anymore; the fixture seeds the
 * precondition at the persistence layer instead, exactly like the backend
 * E2E suite seeds its own fixtures. The `Store` row itself is untouched.
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
 * Degrades `storeId` to the free plan via direct-DB seeding (design.md D1,
 * H-15: the API now rejects non-SuperAdmin module-set changes on paid
 * stores, so PUT seeding is no longer available to this suite):
 *
 * 1. Read the real module catalog, split into free/paid/all ids.
 * 2. In one transaction: delete the store's `StoreRoleFeature` +
 *    `StoreModule` rows, then re-insert `StoreModule` rows for the free
 *    modules only — copied from the `Module` catalog (`PriceIncluded`,
 *    `Price`, etc.), carrying the store's `TenantId`. The `Store` row is
 *    untouched (`name`/`address`/`paymentStartDate` survive).
 * 3. Re-`GET` through the API and throw a loud, diagnosable error if the
 *    store did not end up exactly where step 2 asked it to — same
 *    precondition-pinning pattern as `plantRoster()`
 *    (`roster-fixture.ts:298-326`).
 */
export async function degradeStoreToFreePlan(
  page: Page,
  storeId: string
): Promise<FreePlanPrecondition> {
  const token = await requireBearerToken(page);
  const catalog = await readModuleCatalog(page);

  await seedStoreModulesDirect(storeId, catalog.freeIds);

  const reread = await fetchStore(page, storeId, token);
  const observedIds = [...reread.modules.map((m) => m.id)].sort((a, b) => a - b);
  const expectedIds = [...catalog.freeIds].sort((a, b) => a - b);
  const idsMatch =
    observedIds.length === expectedIds.length &&
    observedIds.every((id, index) => id === expectedIds[index]);

  if (!idsMatch) {
    throw new Error(
      `store-fixture: degradeStoreToFreePlan(${storeId}) precondition mismatch — expected module ` +
        `ids [${expectedIds.join(',')}] after the direct-DB seed, observed [${observedIds.join(',')}]. ` +
        'The free-plan precondition this spec relies on was not actually written.'
    );
  }
  if (!reread.paymentStartDate) {
    throw new Error(
      `store-fixture: degradeStoreToFreePlan(${storeId}) precondition mismatch — expected ` +
        'paymentStartDate to remain non-null after degrading to the free plan (the Store row is ' +
        'untouched by the direct-DB seed), observed null. S2-02 depends on this staying non-null.'
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

// Same default the README's documented backend mode uses; override with
// E2E_DB_URL when the backend was pointed somewhere else (global-teardown.ts:27).
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

/**
 * Rewrites `storeId`'s `StoreModule` rows to exactly the given `moduleIds`
 * in one transaction: `StoreRoleFeature` and `StoreModule` rows are deleted
 * first (both FK to the store; children-first order as in
 * `global-teardown.ts:30-78`), then the `StoreModule` rows are re-inserted
 * from the `Module` catalog (`ModulePriceIncluded`, `Price`,
 * `ModuleDiscountPrice`, `ModulePercentDiscountPrice` copied from `Module`;
 * `TenantId` from the `Store` row). Column list follows
 * `20240910194934_Create-Store-Module-Price.cs:82-99`.
 */
async function seedStoreModulesDirect(storeId: string, moduleIds: number[]): Promise<void> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query('DELETE FROM "StoreRoleFeature" WHERE "StoreId" = $1', [storeId]);
    await client.query('DELETE FROM "StoreModule" WHERE "StoreId" = $1', [storeId]);
    await client.query(
      `INSERT INTO "StoreModule"
         ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
          "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId", "IsActive",
          "CreatedDate", "CreatedBy", "UpdatedDate", "UpdatedBy")
       SELECT s."Id", m."Id", m."PriceIncluded", m."Price", m."Price",
              m."DiscountPrice", m."PercentDiscountPrice", s."TenantId", true,
              now(), '00000000-0000-0000-0000-000000000000', NULL, NULL
         FROM "Module" m, "Store" s
        WHERE m."Id" = ANY($2::int[]) AND s."Id" = $1`,
      [storeId, moduleIds]
    );
    await client.query('COMMIT');
  } catch (cause) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error(
      `store-fixture: seedStoreModulesDirect(${storeId}, [${moduleIds.join(',')}]) failed — ` +
        `free-plan seeding did not happen: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  } finally {
    await client.end();
  }
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
