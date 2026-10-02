import { expect } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';
import { E2E_API_URL } from './backend-url';
import { readBearerToken } from './auth-storage';
import { RegisterPage } from './register-page';
import { newTestIdentity, type TestIdentity } from './identity';
import { readSelectedStoreId } from './session';

/**
 * Support for `store-module-pricing.spec.ts` (T6 of
 * `odd/tasks/store-module-pricing-admin-view.md`).
 *
 * NEW file — no existing spec or support helper is touched. It exists because
 * the spec's job is to prove the BROWSER and the SERVER agree on a per-store
 * module total, and a test that derived its expectation from the app's own
 * domain code would be asserting the function against itself. So everything
 * here reads the LIVE API and re-derives the plan partition independently.
 *
 * What lives here, and why it is not in the spec file:
 *   - the two per-store pricing endpoints (read + save) as typed API calls,
 *   - `GET /v1/plans`, so the expected plan grouping is computed from the live
 *     plan matrix and never from a hardcoded module id,
 *   - `expectedPlanGroups`, an INDEPENDENT mirror of
 *     `groupModulesByPlanDelta` (`packages/domain/src/commons/plan-module-groups.ts`).
 *     The VISUAL partition is the thing it mirrors, and the visual partition did
 *     NOT change with the price rule;
 *   - `isBillableRow` / `expectedBillableTotal`, INDEPENDENT mirrors of
 *     `ModulePriceCalculator.IsBillable` / `totalModulePricing` — the rule that
 *     decides WHICH rows a total counts: a row must be active (ticked) AND not
 *     price-included. This is a separate concern from the formula, and the
 *     formula mirror (`expectedCurrentPrice`) below deliberately does NOT encode
 *     it, so the two halves of the rule are proved independently;
 *   - `openModulePricingModal`, the gear-menu → modal navigation.
 */

/** One row of `GET /v1/stores/{storeId}/module-pricing`. */
export interface PricingReadRow {
  moduleId: number;
  name: string;
  isActive: boolean;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
  /**
   * The store's frozen `ModulePriceIncluded` (the catalog's when no snapshot
   * exists). Server-owned and part of the price rule, so the specs can tell a
   * chargeable row from a bundled one instead of guessing from the prices.
   */
  priceIncluded: boolean;
  currentPrice: number;
}

export interface PricingReadResult {
  storeId: string;
  modules: PricingReadRow[];
  totalCurrentPrice: number;
}

/** One echoed row of `PUT /v1/stores/{storeId}/module-pricing`. */
export interface PricingSaveRow {
  moduleId: number;
  isActive: boolean;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
  /** Server-resolved: the store's frozen `ModulePriceIncluded` for this row. */
  priceIncluded: boolean;
  currentPrice: number;
}

export interface PricingSaveResult {
  storeId: string;
  modules: PricingSaveRow[];
  totalCurrentPrice: number;
}

/** The slice of `GET /v1/plans` this fixture needs to rebuild the grouping. */
export interface PlanCatalogPlan {
  id: number;
  name: string;
  order: number;
  planType: string;
  modules: Array<{ moduleId: number }>;
}

/** One payload row for `PUT /v1/stores/{storeId}/module-pricing`. */
export interface PricingPayloadRow {
  moduleId: number;
  isSelected: boolean;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
}

type ApiEnvelope<T> =
  | { succeeded: true; data: T }
  | { succeeded: false; data: null; message: string | null };

async function requireBearerToken(page: Page): Promise<string> {
  const token = await readBearerToken(page);
  if (!token) {
    throw new Error(
      'store-module-pricing-fixture: no Bearer token in localStorage (`token` key). Restore a ' +
        'signed-in SuperAdmin persona before calling the module-pricing helpers.',
    );
  }
  return token;
}

async function readEnvelope<T>(page: Page, url: string, what: string): Promise<T> {
  const token = await requireBearerToken(page);
  const response = await page.request.get(url, { headers: { Authorization: `Bearer ${token}` } });
  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }
  if (!response.ok() || !body?.succeeded || body.data === null) {
    throw new Error(
      `store-module-pricing-fixture: ${what} failed (status ${response.status()}, message ` +
        `${body?.message ?? 'none'}) — the expectation this spec asserts against was never ` +
        'obtained, so any assertion built on it would be vacuous.',
    );
  }
  return body.data;
}

/** The live plan catalog — the single source for the expected grouping. */
export async function readPlanCatalog(page: Page): Promise<PlanCatalogPlan[]> {
  return readEnvelope<PlanCatalogPlan[]>(page, `${E2E_API_URL}/v1/plans`, 'GET /v1/plans');
}

/** The store's own module pricing seed, exactly as the modal opens with it. */
export async function readStoreModulePricing(
  page: Page,
  storeId: string,
): Promise<PricingReadResult> {
  return readEnvelope<PricingReadResult>(
    page,
    `${E2E_API_URL}/v1/stores/${storeId}/module-pricing`,
    `GET /v1/stores/${storeId}/module-pricing`,
  );
}

/** Writes a whole pricing set for the store (the same endpoint the modal uses). */
export async function saveStoreModulePricing(
  page: Page,
  storeId: string,
  rows: PricingPayloadRow[],
): Promise<PricingSaveResult> {
  const token = await requireBearerToken(page);
  const response = await page.request.put(`${E2E_API_URL}/v1/stores/${storeId}/module-pricing`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { modules: rows },
  });
  let body: ApiEnvelope<PricingSaveResult> | null = null;
  try {
    body = (await response.json()) as ApiEnvelope<PricingSaveResult>;
  } catch {
    body = null;
  }
  if (!response.ok() || !body?.succeeded || body.data === null) {
    throw new Error(
      `store-module-pricing-fixture: PUT /v1/stores/${storeId}/module-pricing failed (status ` +
        `${response.status()}, message ${body?.message ?? 'none'}).`,
    );
  }
  return body.data;
}

/**
 * Baseline for the mutating tests: deactivates every module except
 * `moduleId` and sets that one's three price fields, so the store's total has
 * exactly one contributor and a browser-side assertion cannot drift on an
 * unrelated row.
 *
 * "Exactly one contributor" only holds when `moduleId` is BILLABLE: the price
 * rule excludes a price-included (bundled) row, so a bundled baseline would
 * leave the total at 0 and every assertion built on it vacuous. The helper
 * refuses that case instead of letting it pass silently — pick a non-bundled
 * row (see {@link isBillableRow}).
 *
 * Direct API, not UI, on purpose — this is SETUP, the same split
 * `store-fixture.ts` draws (the backend reads a module's absence from the
 * payload as "leave untouched", so the payload must be the full universe; the
 * modal does that too, but a precondition does not need the UI to be proven).
 */
export async function primeOnlyActiveModule(
  page: Page,
  storeId: string,
  moduleId: number,
  values: { price: number; discountPrice: number; percentDiscountPrice: number },
): Promise<PricingSaveResult> {
  const read = await readStoreModulePricing(page, storeId);
  const target = read.modules.find((row) => row.moduleId === moduleId);
  if (!target) {
    throw new Error(
      `store-module-pricing-fixture: primeOnlyActiveModule — module ${moduleId} is not in the ` +
        `store's pricing universe [${read.modules.map((r) => r.moduleId).join(',')}]. The ` +
        'deterministic baseline this test needs cannot be created.',
    );
  }
  if (!isBillableRow(target)) {
    throw new Error(
      `store-module-pricing-fixture: primeOnlyActiveModule — module ${moduleId} is price-included, ` +
        'so the price rule excludes it from every total and this baseline would contribute nothing. ' +
        'Pick a module with priceIncluded === false.',
    );
  }
  return saveStoreModulePricing(
    page,
    storeId,
    read.modules.map((row) => ({
      moduleId: row.moduleId,
      isSelected: row.moduleId === moduleId,
      price: row.moduleId === moduleId ? values.price : row.price,
      discountPrice: row.moduleId === moduleId ? values.discountPrice : row.discountPrice,
      percentDiscountPrice:
        row.moduleId === moduleId ? values.percentDiscountPrice : row.percentDiscountPrice,
    })),
  );
}

/**
 * The partition the modal must render, re-derived from the LIVE plan catalog.
 *
 * An INDEPENDENT mirror of `groupModulesByPlanDelta`, deliberately not an
 * import: importing the production function would make the test assert
 * `groupModulesByPlanDelta` against itself, which passes even if the modal
 * stopped using it. Two implementations that agree is the evidence; one
 * implementation compared to itself is not.
 *
 * `planType` is the group key the modal puts in `module-pricing-group-${key}`
 * — the empty string becoming `no-plan`.
 */
export function expectedPlanGroups(
  plans: readonly PlanCatalogPlan[],
  moduleIds: readonly number[],
): Array<{ planType: string; moduleIds: number[] }> {
  const ordered = [...plans].sort((a, b) => a.order - b.order);
  const claimed = new Set<number>();
  const groups: Array<{ planType: string; moduleIds: number[] }> = [];

  for (const plan of ordered) {
    const previous = ordered.filter((p) => p.order < plan.order).at(-1);
    const candidates = new Set(
      previous
        ? plan.modules
            .filter((m) => !previous.modules.some((pm) => pm.moduleId === m.moduleId))
            .map((m) => m.moduleId)
        : plan.modules.map((m) => m.moduleId),
    );
    const ids = moduleIds.filter((id) => {
      if (claimed.has(id) || !candidates.has(id)) return false;
      claimed.add(id);
      return true;
    });
    if (ids.length > 0) groups.push({ planType: plan.planType, moduleIds: ids });
  }

  const leftovers = moduleIds.filter((id) => !claimed.has(id));
  if (leftovers.length > 0) groups.push({ planType: '', moduleIds: leftovers });

  return groups;
}

/** The `data-testid` group key the modal derives from a plan type. */
export function planGroupTestId(planType: string): string {
  return `module-pricing-group-${planType || 'no-plan'}`;
}

// ── A plain OwnerAdmin, for the SuperAdmin-only half of the spec ───────────

/** Captured localStorage of a signed-in persona, replayable onto any page. */
export interface OwnerSnapshot {
  localStorage: Array<{ name: string; value: string }>;
  identity: TestIdentity;
  selectedStoreId: string;
  homePath: string;
}

/**
 * A non-promoted owner, minted with ONE registration and ZERO logins.
 *
 * The registration itself opens the session (2026-09-28 auto-login), so this
 * is the cheapest possible second persona — and it matters here because the
 * SuperAdmin-only test needs a caller that `/admin/stores` rejects. It exists
 * here rather than in `superadmin-session.ts` because that file is an existing
 * support helper this change is not allowed to touch.
 */
export async function mintPlainOwner(browser: Browser): Promise<OwnerSnapshot> {
  const context = await browser.newContext();
  const page = await context.newPage();

  const identity = newTestIdentity();
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  await page.waitForURL(/\/sales\/products$/);

  const selectedStoreId = await readSelectedStoreId(page);
  const homePath = new URL(page.url()).pathname;

  const state = await context.storageState();
  const origin = new URL(page.url()).origin;
  const originState = state.origins.find((o) => o.origin === origin);
  if (!originState) {
    throw new Error(
      'store-module-pricing-fixture: mintPlainOwner captured no localStorage for origin ' +
        `${origin} — the registration session did not persist.`,
    );
  }
  // Same filter every snapshot helper in this suite applies: the DEK half is
  // non-extractable and `enc:v1:` business entities would fail to decrypt in a
  // restored context.
  const localStorage = originState.localStorage.filter(
    (entry) =>
      entry.name !== 'lizoft.device-dek' &&
      !(entry.name.startsWith('lizoft.store-') && entry.value.startsWith('enc:v1:')),
  );

  await context.close();
  return { localStorage, identity, selectedStoreId, homePath };
}

/** Replays an {@link OwnerSnapshot} onto `page` (same shape as the suite's other appliers). */
export async function applyOwnerSnapshot(page: Page, snapshot: OwnerSnapshot): Promise<void> {
  await page.goto('/login');
  await page.evaluate((entries) => {
    for (const { name, value } of entries) {
      window.localStorage.setItem(name, value);
    }
  }, snapshot.localStorage);
  await page.goto(snapshot.homePath);
}

// ── Direct-DB probes, for proving an INSERT rather than a reactivation ─────

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

async function countStoreModuleRows(storeId: string, moduleId: number): Promise<number> {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT count(*)::int AS total FROM "StoreModule" WHERE "StoreId" = $1 AND "ModuleId" = $2',
      [storeId, moduleId],
    );
    return result.rows[0]?.total ?? 0;
  } finally {
    await client.end();
  }
}

/**
 * The first candidate module the store has NO `StoreModule` row for.
 *
 * Ticking one of those is a genuine INSERT, not a reactivation of a
 * soft-deactivated row — a distinction no API response can show, because the
 * read universe lists every catalog module either way. Hence the `pg` query.
 * Candidates are tried in order and the reason is reported when none qualifies.
 */
export async function findModuleWithoutStoreRow(
  storeId: string,
  candidateModuleIds: readonly number[],
): Promise<number> {
  const observed: string[] = [];
  for (const moduleId of candidateModuleIds) {
    const rows = await countStoreModuleRows(storeId, moduleId);
    observed.push(`${moduleId}:${rows}`);
    if (rows === 0) return moduleId;
  }
  throw new Error(
    `store-module-pricing-fixture: findModuleWithoutStoreRow — every candidate already has a ` +
      `StoreModule row (${observed.join(' ')}), so ticking one would only re-activate a ` +
      'soft-deactivated row and could NOT prove that the tick inserted a new one.',
  );
}

/**
 * Drives the real navigation: `/admin/stores` → the card's gear → the
 * "Precios de módulos" item → the modal with its table loaded.
 *
 * Scoped by `storeId`, never `.first()`: a SuperAdmin sees every store in the
 * database, so an unscoped locator would open some other store's editor.
 */
export async function openModulePricingModal(page: Page, storeId: string): Promise<Locator> {
  await page.goto('/admin/stores');
  // The default filter is "No Gratis"; "Todos" guarantees the target card is
  // rendered whatever plan it sits on.
  const allFilter = page.getByRole('button', { name: /^Todos/ });
  if (await allFilter.isVisible().catch(() => false)) {
    await allFilter.click();
  }

  const gear = page.locator(`[data-testid="store-actions-toggle-${storeId}"]`);
  await expect(gear).toBeVisible();
  await gear.click();

  const item = page.locator(`[data-testid="store-module-pricing-action-${storeId}"]`);
  await expect(item).toBeVisible();
  await item.click();

  const modal = page.locator(`[data-testid="store-module-pricing-modal-${storeId}"]`);
  await expect(modal).toBeVisible();
  await expect(modal.locator('[data-testid="module-pricing-table"]')).toBeVisible();
  return modal;
}

/** `"8.68 USD"` → `8.68` (the shape `formatPlanPrice` produces). */
export function parsePlanPrice(text: string): number {
  const match = /^\s*(-?[\d.,]+)\s*USD\s*$/.exec(text);
  if (!match) {
    throw new Error(
      `store-module-pricing-fixture: parsePlanPrice("${text}") — expected the "<amount> USD" ` +
        'shape produced by formatPlanPrice (price-utils.ts:21).',
    );
  }
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) {
    throw new Error(
      `store-module-pricing-fixture: parsePlanPrice("${text}") — "${match[1]}" is not a number.`,
    );
  }
  return value;
}

/**
 * Tolerance for a browser-computed value and a server-computed value of the
 * SAME quantity. Never `===`, and never exact: two independent effects widen
 * the gap.
 *
 *   1. Precision. The backend evaluates the formula in `float` (32-bit) and the
 *      browser in `number` (64-bit); they agree to roughly seven significant
 *      digits (`module-pricing.ts` documents the drift).
 *   2. Display rounding. What the test reads is TEXT, and both the per-row
 *      "Precio actual" and the total go through `Intl.NumberFormat` with
 *      `maximumFractionDigits: 2` — so a true 8.6763 is rendered "8.68". Half a
 *      cent is the hard floor here, not a safety margin.
 *
 * Half a cent stays far below any arithmetic disagreement these values can
 * produce: swapping the discount order on a 10/10%/0.5 module moves the total
 * from 8.5 to 8.55, and dropping the zero clamp moves it by the whole
 * difference — a 0.005 tolerance catches neither.
 */
export const PRICING_EPSILON = 0.005;

export function expectPricesClose(actual: number, expected: number, what: string): void {
  if (Math.abs(actual - expected) > PRICING_EPSILON) {
    throw new Error(
      `store-module-pricing-fixture: ${what} — expected ${expected}, observed ${actual} ` +
        `(difference ${Math.abs(actual - expected)} exceeds epsilon ${PRICING_EPSILON}).`,
    );
  }
}

/**
 * The independent browser-side copy of `GetCurrentPrice` — the FORMULA only,
 * deliberately without the "which rows count" half of the rule. Written out here
 * rather than imported for the same reason as `expectedPlanGroups`: a test that
 * computes its expectation with the code under test proves nothing.
 */
export function expectedCurrentPrice(
  price: number,
  percentDiscountPrice: number,
  discountPrice: number,
): number {
  const current = price - (price * percentDiscountPrice) / 100 - discountPrice;
  return current < 0 ? 0 : current;
}

/**
 * The independent copy of the OTHER half of the price rule —
 * `ModulePriceCalculator.IsBillable` (backend) / `isBillableModule` (domain) —
 * which decides WHETHER a row reaches a total at all:
 *
 *   billable  ⇔  isActive && !priceIncluded
 *
 * A row that is unticked contributes nothing (it is not part of the store), and
 * a row whose price is already included in what the store pays contributes
 * nothing either, however large its price is.
 *
 * Kept apart from {@link expectedCurrentPrice} on purpose: the formula is one
 * clause of the rule and the filter is another, and a single helper that did
 * both would let a bug in either hide behind the other.
 */
export function isBillableRow(row: { isActive: boolean; priceIncluded: boolean }): boolean {
  return row.isActive && !row.priceIncluded;
}

/** The two rule flags a priced row must carry for {@link isBillableRow} to judge it. */
export interface PricedRow {
  isActive: boolean;
  priceIncluded: boolean;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
}

/**
 * Σ {@link expectedCurrentPrice} over the BILLABLE rows only — the expectation a
 * total on screen must equal, re-derived instead of read off the code under
 * test. Mirrors `totalModulePricing(...).currentPrice`.
 */
export function expectedBillableTotal(rows: readonly PricedRow[]): number {
  return rows
    .filter(isBillableRow)
    .reduce(
      (sum, row) =>
        sum + expectedCurrentPrice(row.price, row.percentDiscountPrice, row.discountPrice),
      0,
    );
}
