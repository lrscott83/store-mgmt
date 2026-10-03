import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { E2E_API_URL } from './backend-url';
import { readBearerToken } from './auth-storage';

/**
 * Module seeding — shared E2E precondition fixture (MultiPayments 2026-09-19,
 * module-15 facts corrected 2026-10-03).
 *
 * ── The two modules are NOT interchangeable (2026-10-03) ──────────────────
 * A self-registered store is born on the **Pago** plan: `RegisterService.cs`
 * grants that plan's modules and deliberately withholds the Superior/VIP-only
 * ones — 13 Warehouses, 14 MultiStores, **15 MultiMonedas**, 16 MultiPayments,
 * 17 Elaboration. Module 15 ships with Superior and VIP ONLY
 * (`Catalog.MultiMonedasCatalogTests`). So a fresh store carries NEITHER 15 nor
 * 16, and every spec that needs either must seed it.
 *
 * An older version of this comment claimed the birth plan was Superior with
 * modules 2..15, "therefore no 16". That premise is what made this fixture seed
 * module 16 alone, and it is why three specs stayed red for weeks: the screens
 * they drive need module 15, which nobody seeded.
 *
 * `CHANNEL_RATES_MODULES` is the set for the "Tasas de Cambio" page. That page
 * is gated by MultiMonedas ALONE — the menu entry carries
 * `moduleIds: [EModules.MultiMonedas]` (menu-config.ts:430-433), the sidebar
 * drops items whose module is missing (sidebar.tsx:26-28), and the route
 * demands it (channel-rates.tsx:29-32). Module 16 does NOT grant it.
 *
 * Enabling a module is a SERVER-SIDE mutation, so a spec that seeds must mint a
 * PRIVATE identity (real register + login) — never the shared `signedInPage`
 * persona (see `e2e/README.md` §"Specs que mutan estado server-side").
 *
 * There is also a legitimate API path for module 15 — upgrading the store to
 * Superior via `POST /v1/stores/{id}/change-plan` (SuperAdmin-reserved) —
 * implemented in `store-multimonedas-fixture.ts::mintMultiMonedasOwner`. Prefer it
 * when a spec wants a whole plan; this fixture is for "keep the plan, add ONE
 * module".
 */

/** ModuleType.MultiPayments (domain enums/index.ts:74). Gates the multi-payment block. */
export const MULTIPAYMENTS_MODULE_ID = 16;

/** ModuleType.MultiMonedas (domain enums/index.ts:72). Gates every currency surface. */
export const MULTIMONEDAS_MODULE_ID = 15;

/**
 * Precondition of the "Tasas de Cambio" page and the cart currency selector:
 * MultiMonedas alone. Seeding module 16 instead leaves the page hidden.
 */
export const CHANNEL_RATES_MODULES: readonly number[] = [MULTIMONEDAS_MODULE_ID];

/**
 * Precondition of the multi-payment block: module 16 — plus module 15, because
 * every spec that drives that block also registers a channel rate or picks a
 * cart currency, and both of those need MultiMonedas.
 */
export const MULTI_PAYMENT_MODULES: readonly number[] = [
  MULTIMONEDAS_MODULE_ID,
  MULTIPAYMENTS_MODULE_ID,
];

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

interface StoreSnapshot {
  modules: Array<{ id: number }>;
}

type ApiEnvelope<T> =
  | { data: T; succeeded: true }
  | { data: null; succeeded: false; message: string | null };

async function readStoreModules(page: Page, storeId: string): Promise<number[]> {
  const response = await page.request.get(`${E2E_API_URL}/v1/stores/${storeId}`, {
    headers: { Authorization: `Bearer ${await requireBearer(page)}` },
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
        'while reading the store module set — cannot pin the module precondition without it.',
    );
  }
  return body.data.modules.map((module) => module.id);
}

async function requireBearer(page: Page): Promise<string> {
  const token = await readBearerToken(page);
  if (!token) {
    throw new Error(
      'multipayments-fixture: no Bearer token found in localStorage. Sign in a private identity ' +
        'before seeding or reading store modules.',
    );
  }
  return token;
}

/**
 * Adds one module's `StoreModule` row, keeping every module the store already
 * has (unlike `seedStoreModulesDirect`, this does NOT reset the plan or touch
 * `StoreRoleFeature`). The row is copied from the real `Module` catalog row with
 * `IsActive=true` and the store's own `TenantId` — the exact column list
 * `store-fixture.ts::seedStoreModulesDirect` uses.
 */
async function seedStoreModuleRow(storeId: string, moduleId: number): Promise<void> {
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
      [storeId, moduleId],
    );
    await client.query('COMMIT');
  } catch (cause) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error(
      `multipayments-fixture: seeding module ${moduleId} for store ${storeId} failed — the ` +
        `precondition was not written: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  } finally {
    await client.end();
  }
}

/**
 * Seeds `moduleId` if the store lacks it, then pins the result through the real
 * API: if `storeModuleIds` still does not contain it, this throws a loud,
 * diagnosable error instead of letting the spec fail later on an invisible
 * missing selector.
 *
 * The CLIENT session still holds the old module set in `localStorage`, and the
 * app never re-fetches `/me` on reload while the cached profile is valid —
 * callers must refresh the session (drop the cached profile and reload) before
 * asserting module-gated UI.
 */
export async function enableStoreModule(
  page: Page,
  storeId: string,
  moduleId: number,
): Promise<void> {
  await requireBearer(page);
  if (!(await readStoreModules(page, storeId)).includes(moduleId)) {
    await seedStoreModuleRow(storeId, moduleId);
  }
  const after = await readStoreModules(page, storeId);
  if (!after.includes(moduleId)) {
    throw new Error(
      `multipayments-fixture: precondition mismatch — module ${moduleId} is still absent from ` +
        `store ${storeId} after the direct-DB insert (observed [${after.join(',')}]). ` +
        'Nothing downstream of this gate can be trusted.',
    );
  }
}

/** Seeds every module in `moduleIds`, in order, pinning each one. */
export async function enableStoreModules(
  page: Page,
  storeId: string,
  moduleIds: readonly number[],
): Promise<void> {
  for (const moduleId of moduleIds) {
    await enableStoreModule(page, storeId, moduleId);
  }
}

/**
 * Noisy precondition: `currentUser.storeModuleIds` must contain every id in
 * `moduleIds`. Throws with the observed set, so a stale client session reads as
 * "the session was not refreshed" instead of "the selector is broken".
 */
export async function assertModulesInSession(
  page: Page,
  moduleIds: readonly number[],
): Promise<void> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) {
    throw new Error(
      'multipayments-fixture: assertModulesInSession — localStorage.currentUser is empty. ' +
        'Refresh the session (drop the cached profile and reload) before running this guard.',
    );
  }
  let user: { storeModuleIds?: number[] };
  try {
    user = JSON.parse(raw) as typeof user;
  } catch (cause) {
    throw new Error(
      'multipayments-fixture: assertModulesInSession — localStorage.currentUser is not valid ' +
        `JSON: ${cause instanceof Error ? cause.message : String(cause)}.`,
    );
  }
  const observed = user.storeModuleIds ?? [];
  const missing = moduleIds.filter((id) => !observed.includes(id));
  if (missing.length > 0) {
    throw new Error(
      `multipayments-fixture: the client session is missing module(s) ${missing.join(',')} — ` +
        `observed [${observed.join(',')}]. The session was not refreshed after seeding, so the ` +
        'module-gated UI would not render and every assertion below would fail for the wrong ' +
        'reason.',
    );
  }
}

/**
 * Adds module 16 (`ModuleType.MultiPayments`) to `storeId`'s `StoreModule` rows,
 * keeping every module the store already has (unlike `seedStoreModulesDirect`,
 * this does NOT reset the plan or touch `StoreRoleFeature`).
 *
 * Scope note (2026-10-03): this seeds module 16 ONLY, which is correct for the
 * multi-payment block but NOT enough for any spec that opens the "Tasas de
 * Cambio" page or the cart currency selector — those need module 15. Call those
 * specs `enableStoreModules(page, storeId, CHANNEL_RATES_MODULES)`.
 */
export async function enableMultiPaymentsModule(page: Page, storeId: string): Promise<void> {
  await requireBearer(page);
  const before = await readStoreModules(page, storeId);
  if (before.includes(MULTIPAYMENTS_MODULE_ID)) {
    return;
  }
  await seedStoreModuleRow(storeId, MULTIPAYMENTS_MODULE_ID);
  const after = await readStoreModules(page, storeId);
  if (!after.includes(MULTIPAYMENTS_MODULE_ID)) {
    throw new Error(
      `multipayments-fixture: precondition mismatch — module ${MULTIPAYMENTS_MODULE_ID} is still ` +
        `absent from store ${storeId} after the direct-DB insert (observed [${after.join(',')}]). ` +
        'The MultiPayments UI cannot render without it, so nothing downstream would be trustworthy.',
    );
  }
}