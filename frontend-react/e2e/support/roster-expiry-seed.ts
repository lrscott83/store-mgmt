import type { Page } from '@playwright/test';
import { Client } from 'pg';

/**
 * Roster-expiry free-plan seeding (design: roster expiry varies by billing
 * plan — Paid stores expire 5 days after `NextDueDate`, free stores fall back
 * to the configured TTL of 35 days).
 *
 * The FREE branch is taken whenever `PlanType == "Free"` (BillingService.cs:58:
 * paid requires BOTH a paid module AND a non-null PaymentStartDate). To make
 * the free-plan scenario unambiguous and faithful to the requirement
 * ("free = StartPaymentDate is null"), this helper additionally nulls the
 * store's `PaymentStartDate` via direct DB. Together with the existing
 * `degradeStoreToFreePlan` from `store-fixture.ts` (which removes the paid
 * modules), the store then fully satisfies the free-plan preconditions.
 */

// Same default the README's documented backend mode uses; override with
// E2E_DB_URL (store-fixture.ts:170, global-teardown.ts:27).
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

/**
 * Sets `Store.PaymentStartDate` to NULL via direct-DB UPDATE so the store
 * cannot be considered a paid store. Mirrors the connection strategy of
 * `store-fixture.ts`'s `seedStoreModulesDirect` (pg Client, one transaction).
 * The `Store` row's other columns are untouched.
 */
export async function setPaymentStartDateNull(page: Page, storeId: string): Promise<void> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query('UPDATE "Store" SET "PaymentStartDate" = NULL WHERE "Id" = $1', [storeId]);
    await client.query('COMMIT');
  } catch (cause) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error(
      `roster-expiry-seed: setPaymentStartDateNull(${storeId}) failed — ` +
        `${cause instanceof Error ? cause.message : String(cause)}`
    );
  } finally {
    await client.end();
  }
}
