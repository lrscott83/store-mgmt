import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { E2E_API_URL } from './backend-url';
import { readBearerToken } from './auth-storage';

/**
 * multipayments (módulo 16) — E2E precondition fixture.
 *
 * The MultiPayments UI and the cart currency selector render ONLY when the
 * client session's `currentUser.storeModuleIds` includes module 16
 * (`hasMultiPaymentsModuleAvailable`, authorization-service.ts). Module 16 is
 * VIP-only: a freshly self-registered store is born on the Superior plan with
 * modules 2..15 and therefore does NOT have it.
 *
 * Enabling the module for a store is a SERVER-SIDE mutation, so a spec that
 * uses this helper must mint a PRIVATE identity (real register + login) — it
 * must NOT consume the shared `signedInPage` persona cache (see
 * `e2e/README.md` §"Specs que mutan estado server-side"). This file mirrors the
 * direct-DB seeding pattern of `store-fixture.ts::seedStoreModulesDirect` and
 * re-verifies the post-condition through the real API before returning control.
 */

export const MULTIPAYMENTS_MODULE_ID = 16;

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

interface StoreSnapshot {
  modules: Array<{ id: number }>;
}

type ApiEnvelope<T> =
  | { data: T; succeeded: true }
  | { data: null; succeeded: false; message: string | null };

async function readStoreModules(page: Page, storeId: string, token: string): Promise<number[]> {
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
      `multipayments-fixture: GET /v1/stores/${storeId} failed (status ${response.status()}) ` +
        'while reading the store module set — cannot pin the MultiPayments precondition without it.',
    );
  }
  return body.data.modules.map((module) => module.id);
}

/**
 * Adds module 16 (`ModuleType.MultiPayments`) to `storeId`'s `StoreModule`
 * rows, keeping every module the store already has (unlike
 * `seedStoreModulesDirect`, this does NOT reset the plan or touch
 * `StoreRoleFeature`).
 *
 * The new row is copied from the real `Module` catalog row (id 16 is a seeded
 * migration row: `PriceIncluded=false`, `Price=10`), with `IsActive=true` and
 * the store's own `TenantId` — the exact column list `seedStoreModulesDirect`
 * uses. The API read afterwards is the precondition pin: if `storeModuleIds`
 * does not end up containing 16, this throws a loud, diagnosable error instead
 * of letting the spec fail later on an invisible missing selector.
 *
 * The CLIENT session still holds the old module set in `localStorage` —
 * callers must refresh it (`/v1/auth/me`) before asserting the module-gated UI.
 */
export async function enableMultiPaymentsModule(page: Page, storeId: string): Promise<void> {
  const token = await readBearerToken(page);
  if (!token) {
    throw new Error(
      'multipayments-fixture: no Bearer token found in localStorage. Sign in a private identity ' +
        'before calling enableMultiPaymentsModule().',
    );
  }

  const before = await readStoreModules(page, storeId, token);
  if (before.includes(MULTIPAYMENTS_MODULE_ID)) {
    return;
  }

  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO "StoreModule"
         ("StoreId", "ModuleId", "ModulePriceIncluded", "Price", "ModulePrice",
          "ModuleDiscountPrice", "ModulePercentDiscountPrice", "TenantId", "IsActive",
          "CreatedDate", "CreatedBy", "UpdatedDate", "UpdatedBy")
       SELECT s."Id", m."Id", m."PriceIncluded", m."Price", m."Price",
              m."DiscountPrice", m."PercentDiscountPrice", s."TenantId", true,
              now(), '00000000-0000-0000-0000-000000000000', NULL, NULL
         FROM "Module" m, "Store" s
        WHERE m."Id" = $2 AND s."Id" = $1
          AND NOT EXISTS (
            SELECT 1 FROM "StoreModule" sm
             WHERE sm."StoreId" = $1 AND sm."ModuleId" = $2
          )`,
      [storeId, MULTIPAYMENTS_MODULE_ID],
    );
    await client.query('COMMIT');
  } catch (cause) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error(
      `multipayments-fixture: enabling module ${MULTIPAYMENTS_MODULE_ID} for store ${storeId} ` +
        `failed — the precondition was not written: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  } finally {
    await client.end();
  }

  const after = await readStoreModules(page, storeId, token);
  if (!after.includes(MULTIPAYMENTS_MODULE_ID)) {
    throw new Error(
      `multipayments-fixture: precondition mismatch — module ${MULTIPAYMENTS_MODULE_ID} is still ` +
        `absent from store ${storeId} after the direct-DB insert (observed [${after.join(',')}]). ` +
        'The MultiPayments UI cannot render without it, so nothing downstream would be trustworthy.',
    );
  }
}
