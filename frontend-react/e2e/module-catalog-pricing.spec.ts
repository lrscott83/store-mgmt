import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { E2E_API_URL } from './support/backend-url';
import { readBearerToken } from './support/auth-storage';
import { applySuperAdminSnapshot, mintSuperAdmin } from './support/superadmin-session';
import {
  expectedCurrentPrice,
  expectedPlanGroups,
  expectPricesClose,
  parsePlanPrice,
  readPlanCatalog,
  type PlanCatalogPlan,
} from './support/store-module-pricing-fixture';

/**
 * module-catalog-pricing (T6 of `odd/tasks/module-catalog-pricing-admin-page.md`)
 *
 * NEW spec file — no existing spec and no existing `e2e/support/*` helper is
 * modified. It drives the REAL SuperAdmin page `/admin/modules`, the REAL API
 * and the REAL test database, and covers the four behaviours T6 names:
 *
 *   MCP1 — the page opens for a SuperAdmin and lists the whole editable module
 *          catalog grouped by plan: one heading per non-empty group, every
 *          module in EXACTLY one group, its name shown, and its three price
 *          inputs seeded from the live catalog read.
 *   MCP2 — a module that carries a discount shows its base price struck through
 *          next to the real final price, a module with no discount shows no
 *          strikethrough at all, and the same offer treatment is applied to the
 *          group's total.
 *   MCP3 — editing price / % discount / flat discount and pressing "Guardar"
 *          persists them: the values are still there after a full page reload,
 *          the live catalog read reports them, and no OTHER module moved.
 *   MCP4 — typing a price recomputes the row AND the group total live in the
 *          browser, with no request at all until "Guardar", and the total the
 *          page then shows is the one the server computed.
 *
 * NO non-SuperAdmin test, deliberately: the maintainer declined vacuous role
 * pins for this feature. The route is behind `superAdminLoader` and the menu
 * item behind `rolesOnly`, so the gate is structural — a role test here could
 * only assert what those two lines already assert.
 *
 * ── THE CATALOG IS GLOBAL SEED DATA SHARED WITH THE WHOLE SUITE ─────────────
 * This is the only page in the suite that edits rows every other test reads.
 * `beforeAll` snapshots the ENTIRE `Module` table (not only the rows this page
 * can render) straight from PostgreSQL, and `afterAll` writes every one of those
 * three columns back inside ONE transaction and then READS THEM BACK to prove
 * the restore landed. If PostgreSQL refuses the direct restore, the fallback is
 * `PUT /v1/modules/pricing` — the endpoint the page itself uses — followed by a
 * read-back proof, so the fallback is not a best-effort that could quietly
 * leave the catalog repriced. A restore that cannot be PROVEN fails the run on
 * purpose: a leaked repricing would silently poison the backend E2E suite and
 * every plan-catalog spec that runs after this one.
 *
 * `CurrentPrice` is not a column — `ModuleProfile` computes it in the mapper —
 * so restoring the three persisted pricing columns restores the whole catalog
 * pricing state by construction.
 *
 * ORDER MATTERS, and deliberately so. The suite is `serial` because
 * `mintSuperAdmin` is paid for once in `beforeAll` and replayed per test, and
 * because MCP3 leaves the edited module on an offer whose numbers MCP4 then
 * measures. Every test reads the LIVE state through the API first, and never a
 * value remembered from an earlier test — so a retry after a partial failure
 * re-derives its own expectations instead of re-asserting a stale one.
 *
 * Cost: 1 registration + 1 login (the re-login `mintSuperAdmin` needs for the
 * `super_admin` claim). Zero extra logins.
 */

/** One row of `GET /v1/modules/ToStore` — the catalog exactly as the page reads it. */
interface CatalogRow {
  id: number;
  name: string;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
  currentPrice: number;
}

/** The three columns this page can move, per module. What the restore writes back. */
interface CatalogPricingSnapshot {
  id: number;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
}

/** One payload row for `PUT /v1/modules/pricing`. */
interface CatalogPricingPayloadRow {
  moduleId: number;
  price: number;
  discountPrice: number;
  percentDiscountPrice: number;
}

/** The slice of the save echo this spec reads. */
interface CatalogSaveResult {
  modules: Array<{ moduleId: number; currentPrice: number }>;
  totalCurrentPrice: number;
}

type ApiEnvelope<T> =
  | { succeeded: true; data: T; message: string | null }
  | { succeeded: false; data: null; message: string | null };

/** Same connection string `global-teardown.ts` uses, so both agree on the database. */
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

/** Only the editable universe; a value outside it would make an edit unobservable. */
const CATALOG_UNIVERSE = 'module-catalog-price-';

// ── Locators ────────────────────────────────────────────────────────────────

/** The key a group is rendered under: its planType, or `no-plan` for the catch-all. */
const planKey = (planType: string): string => planType || 'no-plan';
const groupTestId = (planType: string): string => `module-catalog-group-${planKey(planType)}`;
const groupTotalTestId = (planType: string): string => `module-catalog-group-total-${planKey(planType)}`;
const groupBaseTotalTestId = (planType: string): string =>
  `module-catalog-group-base-${planKey(planType)}`;
const priceInputTestId = (moduleId: number): string => `${CATALOG_UNIVERSE}${moduleId}`;
const percentInputTestId = (moduleId: number): string => `module-catalog-percent-${moduleId}`;
const discountInputTestId = (moduleId: number): string => `module-catalog-discount-${moduleId}`;
const currentTestId = (moduleId: number): string => `module-catalog-current-${moduleId}`;
const baseTestId = (moduleId: number): string => `module-catalog-base-${moduleId}`;

/**
 * Group HEADINGS only.
 *
 * Scoped to `<th>` on purpose: `module-catalog-group-` is a PREFIX of both
 * `module-catalog-group-total-` and `module-catalog-group-base-`, so the bare
 * `[data-testid^="module-catalog-group-"]` would also select the total cells and
 * the crossed-out base totals, and the heading count would come out wrong.
 */
const groupHeadings = (page: Page) => page.locator('th[data-testid^="module-catalog-group-"]');

/** Every module row, in render order — the flattened view of the grouping. */
const moduleRows = (page: Page) => page.locator(`[data-testid^="${CATALOG_UNIVERSE}"]`);

/** The `<tbody>` that owns a given group's heading, and therefore its rows. */
const groupBody = (page: Page, planType: string) =>
  page.locator(`tbody:has([data-testid="${groupTestId(planType)}"])`);

/** Module ids of a `<tbody>`, in render order. */
async function groupModuleIds(page: Page, planType: string): Promise<number[]> {
  return groupBody(page, planType)
    .locator(`[data-testid^="${CATALOG_UNIVERSE}"]`)
    .evaluateAll((elements, prefix) =>
      elements.map((element) => Number(element.getAttribute('data-testid')?.slice(prefix.length))),
    CATALOG_UNIVERSE);
}

/** Counts the `PUT /v1/modules/pricing` requests the PAGE issues. */
function countCatalogPricingPuts(page: Page): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/v1/modules/pricing')) {
      count += 1;
    }
  });
  return () => count;
}

/**
 * A cell's text with its struck-through figures REMOVED.
 *
 * Both money cells render two numbers when a module is on an offer — the
 * crossed-out base and the real final price — so `innerText` on them comes back
 * as `"10 USD5 USD"` and a bare number parse would read `"105"`. Cloning the
 * node and dropping its `<s>` elements isolates the figure the operator actually
 * pays, which is the one every assertion here is about.
 */
async function readCellWithoutStrike(page: Page, testId: string): Promise<string> {
  return page
    .getByTestId(testId)
    .evaluate((cell) => {
      const clone = cell.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('s').forEach((node) => node.remove());
      return (clone.textContent ?? '').trim();
    });
}

/** The final price a row shows, crossed-out base excluded. */
async function expectRowFinalPrice(page: Page, moduleId: number, expected: string): Promise<void> {
  await expect(page.getByTestId(currentTestId(moduleId))).toBeVisible();
  await expect
    .poll(() => readCellWithoutStrike(page, currentTestId(moduleId)), {
      message: `the final price of module ${moduleId}`,
      timeout: 10_000,
    })
    .toBe(expected);
}

/**
 * A group's total, crossed-out base excluded, compared against an independently
 * computed sum — with a real retry window, because the total is recomputed on
 * the keystroke's re-render rather than set synchronously with the input event.
 */
async function expectGroupTotal(
  page: Page,
  planType: string,
  expectedTotal: number,
  what: string,
): Promise<void> {
  await expect(page.getByTestId(groupTotalTestId(planType))).toBeVisible();
  const deadline = Date.now() + 10_000;
  let lastFailure: unknown;
  for (;;) {
    try {
      expectPricesClose(
        parsePlanPrice(await readCellWithoutStrike(page, groupTotalTestId(planType))),
        expectedTotal,
        what,
      );
      return;
    } catch (error) {
      lastFailure = error;
      if (Date.now() > deadline) throw lastFailure;
      await page.waitForTimeout(150);
    }
  }
}

// ── Browser-independent expectations ─────────────────────────────────────────

/**
 * An INDEPENDENT mirror of `formatPlanAmount` (shared/lib/price-utils.ts:13) —
 * `Intl.NumberFormat('en-US')`, no currency, at most two decimals.
 *
 * Written out here for the same reason `parsePlanPrice` and
 * `expectedCurrentPrice` are written out in `store-module-pricing-fixture.ts`: a
 * test that formats its expectation with the app's own formatter asserts the
 * formatter against itself, and passes even when it is wrong.
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function isOnOffer(row: { percentDiscountPrice: number; discountPrice: number }): boolean {
  return row.percentDiscountPrice > 0 || row.discountPrice > 0;
}

function effectiveOf(row: CatalogRow): number {
  return expectedCurrentPrice(row.price, row.percentDiscountPrice, row.discountPrice);
}

/** One set of three prices, as typed into a row. */
interface Edit {
  price: number;
  percentDiscountPrice: number;
  discountPrice: number;
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function requireBearerToken(page: Page): Promise<string> {
  const token = await readBearerToken(page);
  if (!token) {
    throw new Error(
      'module-catalog-pricing: no Bearer token in localStorage (`token` key). Restore a ' +
        'signed-in SuperAdmin persona before calling the catalog helpers.',
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
      `module-catalog-pricing: ${what} failed (status ${response.status()}, message ` +
        `${body?.message ?? 'none'}) — the expectation this spec asserts against was never ` +
        'obtained, so any assertion built on it would be vacuous.',
    );
  }
  return body.data;
}

/** The live catalog, exactly as the page's own clientLoader read it. */
async function readCatalog(page: Page): Promise<CatalogRow[]> {
  return readEnvelope<CatalogRow[]>(page, `${E2E_API_URL}/v1/modules/ToStore`, 'GET /v1/modules/ToStore');
}

/** Writes catalog pricing through the same endpoint the page's "Guardar" uses. */
async function saveCatalogPricing(
  page: Page,
  rows: readonly CatalogPricingPayloadRow[],
): Promise<CatalogSaveResult> {
  const token = await requireBearerToken(page);
  const response = await page.request.put(`${E2E_API_URL}/v1/modules/pricing`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { modules: rows },
  });
  let body: ApiEnvelope<CatalogSaveResult> | null = null;
  try {
    body = (await response.json()) as ApiEnvelope<CatalogSaveResult>;
  } catch {
    body = null;
  }
  if (!response.ok() || !body?.succeeded || body.data === null) {
    throw new Error(
      `module-catalog-pricing: PUT /v1/modules/pricing failed (status ${response.status()}, ` +
        `message ${body?.message ?? 'none'}).`,
    );
  }
  return body.data;
}

// ── Direct-database snapshot / restore ──────────────────────────────────────

/** The WHOLE `Module` table, straight from PostgreSQL. The restore baseline. */
async function readCatalogPricingSnapshot(): Promise<CatalogPricingSnapshot[]> {
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL,
  });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT "Id", "Price", "DiscountPrice", "PercentDiscountPrice" FROM "Module" ORDER BY "Id"',
    );
    return result.rows.map((row) => ({
      id: Number(row['Id']),
      price: Number(row['Price']),
      discountPrice: Number(row['DiscountPrice']),
      percentDiscountPrice: Number(row['PercentDiscountPrice']),
    }));
  } finally {
    await client.end();
  }
}

/**
 * Writes the whole snapshot back in ONE transaction and reads it back, so a
 * partial restore is impossible and an unproven one is an error rather than a
 * hope.
 */
async function writeCatalogPricingSnapshot(
  snapshot: readonly CatalogPricingSnapshot[],
): Promise<void> {
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL,
  });
  try {
    await client.connect();
    await client.query('BEGIN');
    try {
      for (const row of snapshot) {
        await client.query(
          'UPDATE "Module" SET "Price" = $2, "DiscountPrice" = $3, "PercentDiscountPrice" = $4 WHERE "Id" = $1',
          [row.id, row.price, row.discountPrice, row.percentDiscountPrice],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    assertCatalogMatches(await readCatalogPricingSnapshot(), snapshot, 'the direct-database restore');
  } finally {
    await client.end();
  }
}

/** Every snapshot row must be back to its original three numbers, or the run fails. */
function assertCatalogMatches(
  actual: readonly CatalogPricingSnapshot[],
  expected: readonly CatalogPricingSnapshot[],
  what: string,
): void {
  const byId = new Map(actual.map((row) => [row.id, row]));
  const problems: string[] = [];
  for (const row of expected) {
    const observed = byId.get(row.id);
    if (!observed) {
      problems.push(`module ${row.id}: row missing`);
      continue;
    }
    for (const field of ['price', 'discountPrice', 'percentDiscountPrice'] as const) {
      // 0.001 is orders of magnitude above the float32 error of a value this
      // small, and orders of magnitude below any difference a leaked edit makes.
      if (Math.abs(observed[field] - row[field]) > 0.001) {
        problems.push(
          `module ${row.id} ${field}: expected ${row[field]}, observed ${observed[field]}`,
        );
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `module-catalog-pricing: ${what} did NOT put the shared module catalog back — this run ` +
        `would poison every spec that reads it afterwards:\n  ${problems.join('\n  ')}`,
    );
  }
}

// ── Suite state ─────────────────────────────────────────────────────────────

let superAdmin: Awaited<ReturnType<typeof mintSuperAdmin>>;
let baseline: CatalogPricingSnapshot[] = [];
let plans: PlanCatalogPlan[] = [];
/** The one module MCP3 and MCP4 edit. Chosen once, from the live state. */
let target: { moduleId: number; planType: string; name: string };

function catalogById(catalog: readonly CatalogRow[]): Map<number, CatalogRow> {
  return new Map(catalog.map((row) => [row.id, row]));
}

function requireRow(catalog: readonly CatalogRow[], moduleId: number, context: string): CatalogRow {
  const row = catalog.find((entry) => entry.id === moduleId);
  if (!row) {
    throw new Error(
      `module-catalog-pricing: module ${moduleId} ${context} is not in the live catalog read, so ` +
        'the expectation built on it does not exist and would be vacuous.',
    );
  }
  return row;
}

/** Σ effective price over a group's module ids, with optional per-row overrides. */
function groupEffectiveTotal(
  groupModuleIds: readonly number[],
  catalog: readonly CatalogRow[],
  overrides: ReadonlyMap<number, Edit> = new Map(),
): number {
  return groupModuleIds.reduce((sum, moduleId) => {
    const row = requireRow(catalog, moduleId, 'in a rendered plan group');
    const override = overrides.get(moduleId);
    return sum + (override ? expectedCurrentPrice(override.price, override.percentDiscountPrice, override.discountPrice) : effectiveOf(row));
  }, 0);
}

/** Σ base price over a group's module ids — the struck-through figure. */
function groupBaseTotal(
  groupModuleIds: readonly number[],
  catalog: readonly CatalogRow[],
  overrides: ReadonlyMap<number, Edit> = new Map(),
): number {
  return groupModuleIds.reduce((sum, moduleId) => {
    const row = requireRow(catalog, moduleId, 'in a rendered plan group');
    return sum + (overrides.get(moduleId)?.price ?? row.price);
  }, 0);
}

/**
 * The module the mutating tests edit: the first one, scanning the groups in the
 * order the page renders them, that carries NO discount.
 *
 * Preferred because it makes MCP3's offer proof the strongest kind — a module
 * that was NOT on offer becomes one, from the keystrokes alone. If some earlier
 * run left every module on offer, the first module of the first group is taken
 * instead so the mutation coverage is never silently dropped: "not on offer" is
 * a nicety here, not what the test is about.
 */
function chooseTarget(
  groups: ReadonlyArray<{ planType: string; moduleIds: number[] }>,
  catalog: readonly CatalogRow[],
): { moduleId: number; planType: string; name: string } {
  for (const group of groups) {
    for (const moduleId of group.moduleIds) {
      const row = catalog.find((entry) => entry.id === moduleId);
      if (row && !isOnOffer(row)) {
        return { moduleId, planType: group.planType, name: row.name };
      }
    }
  }
  for (const group of groups) {
    const first = group.moduleIds[0];
    const row = first === undefined ? undefined : catalog.find((entry) => entry.id === first);
    if (row) return { moduleId: first, planType: group.planType, name: row.name };
  }
  throw new Error(
    'module-catalog-pricing: the live catalog produced no plan group at all, so there is nothing ' +
      'for this spec to edit and every assertion would be vacuous.',
  );
}

/** A price guaranteed to differ from the current one, so "the total moved" is provable. */
function pickEditPrice(currentPrice: number): number {
  return currentPrice === 25 ? 26 : 25;
}

// ── Page navigation ──────────────────────────────────────────────────────────

async function waitForCatalogTable(page: Page): Promise<void> {
  await expect(page.getByTestId('module-catalog-table')).toBeVisible();
  await expect(moduleRows(page).first()).toBeVisible();
}

/** Signs the SuperAdmin in on this test's own page, so `page.request` can authenticate. */
async function signInSuperAdmin(page: Page): Promise<void> {
  await applySuperAdminSnapshot(page, superAdmin);
}

/** The real navigation: the SuperAdmin's home, then the catalog page with its table loaded. */
async function openCatalogPage(page: Page): Promise<void> {
  await signInSuperAdmin(page);
  await page.goto('/admin/modules');
  await waitForCatalogTable(page);
}

/** A genuine reload — the state must come back from the server, not from the draft. */
async function reloadCatalogPage(page: Page): Promise<void> {
  await page.reload();
  await waitForCatalogTable(page);
}

async function typeEdit(page: Page, moduleId: number, edit: Edit): Promise<void> {
  await page.getByTestId(priceInputTestId(moduleId)).fill(String(edit.price));
  await page.getByTestId(percentInputTestId(moduleId)).fill(String(edit.percentDiscountPrice));
  await page.getByTestId(discountInputTestId(moduleId)).fill(String(edit.discountPrice));
}

/** Clicks "Guardar" and hands back the server's own answer. */
async function saveAndReadEcho(page: Page): Promise<CatalogSaveResult> {
  const pending = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().includes('/v1/modules/pricing'),
  );
  await page.getByTestId('module-catalog-save').click();
  const response = await pending;
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as ApiEnvelope<CatalogSaveResult>;
  if (!body.succeeded || body.data === null) {
    throw new Error(
      `module-catalog-pricing: the save reported HTTP ${response.status()} but no usable body ` +
        `(message ${body.message ?? 'none'}).`,
    );
  }
  return body.data;
}

test.describe.serial('SuperAdmin module catalog pricing', () => {
  test.beforeAll(async ({ browser }) => {
    superAdmin = await mintSuperAdmin(browser);
    // The WHOLE table, not only the rows this page can render: a restore that
    // knew just the visible universe would silently skip anything else.
    baseline = await readCatalogPricingSnapshot();
    if (baseline.length === 0) {
      throw new Error(
        'module-catalog-pricing: the "Module" table is empty, so there is no catalog to edit and ' +
          'no baseline to restore. The precondition this spec depends on is missing.',
      );
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await applySuperAdminSnapshot(page, superAdmin);
      plans = await readPlanCatalog(page);
      const catalog = await readCatalog(page);
      target = chooseTarget(
        expectedPlanGroups(
          plans,
          catalog.map((row) => row.id),
        ),
        catalog,
      );
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    // A failed beforeAll aborts the describe, so no test ran and nothing was
    // mutated: there is nothing to put back.
    if (baseline.length === 0) return;
    try {
      await writeCatalogPricingSnapshot(baseline);
      return;
    } catch (dbError) {
      // PostgreSQL refused the direct restore. Fall back to the endpoint the
      // page itself uses — same three columns, same validator — and prove the
      // result by reading it back, so the fallback is not a best-effort that
      // could quietly leave the catalog repriced.
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await applySuperAdminSnapshot(page, superAdmin);
        await saveCatalogPricing(
          page,
          baseline.map((row) => ({
            moduleId: row.id,
            price: row.price,
            discountPrice: row.discountPrice,
            percentDiscountPrice: row.percentDiscountPrice,
          })),
        );
        const after = await readCatalog(page);
        assertCatalogMatches(
          after.map((row) => ({
            id: row.id,
            price: row.price,
            discountPrice: row.discountPrice,
            percentDiscountPrice: row.percentDiscountPrice,
          })),
          baseline,
          `the API restore (the direct-database restore failed with: ${String(dbError)})`,
        );
      } finally {
        await context.close();
      }
    }
  });

  test('MCP1 — the page opens grouped by plan, listing every module with its live prices', async ({
    page,
  }) => {
    // Read the truth first: a table showing anything else would be the defect,
    // and reading afterwards could not tell which side moved.
    await signInSuperAdmin(page);
    const catalog = await readCatalog(page);
    expect(catalog.length).toBeGreaterThan(0);
    const catalogIds = catalog.map((row) => row.id);

    await page.goto('/admin/modules');
    await waitForCatalogTable(page);

    await expect(page.getByRole('heading', { name: 'Precios de los módulos' })).toBeVisible();

    // The partition the page must render, re-derived from the LIVE plan matrix
    // so the expectation cannot go stale the way a hardcoded module list would.
    const expected = expectedPlanGroups(plans, catalogIds);
    expect(expected.length).toBeGreaterThan(0);

    // One heading per NON-EMPTY group, in the plan `order` the catalog reports.
    const headings = groupHeadings(page);
    await expect(headings).toHaveCount(expected.length);
    for (let index = 0; index < expected.length; index += 1) {
      const header = headings.nth(index);
      await expect(header).toHaveAttribute('data-testid', groupTestId(expected[index].planType));
      await expect(header).toBeVisible();
      // Non-empty, but not a hardcoded Spanish string: the heading wording is
      // translated per plan, so pinning text here would test the dictionary
      // rather than the grouping. The catch-all IS pinned, because "Otros
      // planes" is this feature's own label and nothing else renders it.
      const heading = (await header.innerText()).trim();
      expect(heading.length).toBeGreaterThan(0);
      if (expected[index].planType === '') {
        expect(heading).toBe('Otros planes');
      }
    }

    // TOTALITY: the groups cover the universe exactly once. A module rendered
    // twice would be saved twice, and one rendered in NO group would be missing
    // from the save payload — which the backend reads as "leave untouched", the
    // silent skip the plan calls out.
    const renderedIds = await moduleRows(page).evaluateAll(
      (elements, prefix) =>
        elements.map((element) => Number(element.getAttribute('data-testid')?.slice(prefix.length))),
      CATALOG_UNIVERSE,
    );
    expect(new Set(renderedIds).size).toBe(renderedIds.length);
    expect(renderedIds.slice().sort((a, b) => a - b)).toEqual(catalogIds.slice().sort((a, b) => a - b));

    // Each group holds exactly the modules the delta rule gives it.
    for (const group of expected) {
      expect(await groupModuleIds(page, group.planType)).toEqual(group.moduleIds);
    }

    // Every module is NAMED, and its three inputs hold the live catalog values —
    // not zeros, and not a per-store copy.
    for (const row of catalog) {
      const moduleRow = page.locator(`tr:has([data-testid="${priceInputTestId(row.id)}"])`);
      await expect(moduleRow.locator('td').first()).toHaveText(row.name);
      await expect(page.getByTestId(priceInputTestId(row.id))).toHaveValue(String(row.price));
      await expect(page.getByTestId(percentInputTestId(row.id))).toHaveValue(
        String(row.percentDiscountPrice),
      );
      await expect(page.getByTestId(discountInputTestId(row.id))).toHaveValue(
        String(row.discountPrice),
      );
    }
  });

  test('MCP2 — a discounted module shows its old price crossed out beside the real final price', async ({
    page,
  }) => {
    await signInSuperAdmin(page);
    const catalog = await readCatalog(page);
    // Prefer a module whose base and final prices actually differ: with equal
    // values a crossed-out base would be indistinguishable from a missing one.
    const offered =
      catalog.find((row) => isOnOffer(row) && Math.abs(effectiveOf(row) - row.price) > 0.001) ??
      catalog.find((row) => isOnOffer(row));
    if (!offered) {
      throw new Error(
        'module-catalog-pricing: no module in the live catalog carries a discount, so there is no ' +
          'offer to display and the crossed-out price proof would be vacuous.',
      );
    }
    const plain = catalog.find((row) => !isOnOffer(row));
    if (!plain) {
      throw new Error(
        'module-catalog-pricing: every module is on offer, so there is no un-discounted row to ' +
          'prove that the crossed-out base is not shown unconditionally.',
      );
    }

    await page.goto('/admin/modules');
    await waitForCatalogTable(page);

    // The offer: base struck through, real final price beside it.
    const base = page.getByTestId(baseTestId(offered.id));
    await expect(base).toHaveText(formatAmount(offered.price));
    const cell = page.getByTestId(currentTestId(offered.id));
    // Exactly ONE struck-through figure in the cell — the base. If the app also
    // struck the final price, this count would be 2.
    await expect(cell.locator('s')).toHaveCount(1);
    await expectRowFinalPrice(page, offered.id, formatAmount(effectiveOf(offered)));

    // No discount, no strikethrough: the crossed-out base appears for an offer only.
    await expect(page.getByTestId(baseTestId(plain.id))).toHaveCount(0);

    // The same treatment on the group total.
    const groups = expectedPlanGroups(
      plans,
      catalog.map((row) => row.id),
    );
    const offeredGroup = groups.find((group) => group.moduleIds.includes(offered.id));
    if (!offeredGroup) {
      throw new Error(
        `module-catalog-pricing: module ${offered.id} is on offer but belongs to no rendered plan ` +
          'group, so its group total cannot be asserted.',
      );
    }
    await expect(page.getByTestId(groupBaseTotalTestId(offeredGroup.planType))).toHaveText(
      `${formatAmount(groupBaseTotal(offeredGroup.moduleIds, catalog))} USD`,
    );
    await expectGroupTotal(
      page,
      offeredGroup.planType,
      groupEffectiveTotal(offeredGroup.moduleIds, catalog),
      'the group total of a group that contains an offer',
    );

    // And a group with NO offer at all shows no crossed-out total. Conditional
    // because the seeded catalog has a discount in every group, and skipping the
    // branch is honest where the precondition does not exist.
    const plainGroup = groups.find(
      (group) => !group.moduleIds.some((moduleId) => isOnOffer(requireRow(catalog, moduleId, 'in a plan group'))),
    );
    if (plainGroup) {
      await expect(page.getByTestId(groupBaseTotalTestId(plainGroup.planType))).toHaveCount(0);
    }
  });

  test('MCP3 — editing price, percent and flat discount, saving and reloading keeps the new values', async ({
    page,
  }) => {
    await signInSuperAdmin(page);
    const before = await readCatalog(page);
    const beforeById = catalogById(before);
    requireRow(before, target.moduleId, 'the module this spec edits');
    const groups = expectedPlanGroups(
      plans,
      before.map((row) => row.id),
    );
    const group = groups.find((entry) => entry.planType === target.planType);
    if (!group) {
      throw new Error(
        `module-catalog-pricing: the edited module's plan group (${planKey(target.planType)}) is ` +
          'not among the groups the page renders.',
      );
    }

    // 20 - 20*10/100 - 2 = 16: the row's final price, computed independently.
    const edit: Edit = { price: 20, percentDiscountPrice: 10, discountPrice: 2 };
    const expectedEffective = expectedCurrentPrice(
      edit.price,
      edit.percentDiscountPrice,
      edit.discountPrice,
    );

    await page.goto('/admin/modules');
    await waitForCatalogTable(page);

    await typeEdit(page, target.moduleId, edit);

    // Live, before any save: the row's final price and the group's total both move.
    await expectRowFinalPrice(page, target.moduleId, formatAmount(expectedEffective));
    // The module is on an offer now, so its base price appears crossed out.
    await expect(page.getByTestId(baseTestId(target.moduleId))).toHaveText(formatAmount(edit.price));
    await expectGroupTotal(
      page,
      group.planType,
      groupEffectiveTotal(group.moduleIds, before, new Map([[target.moduleId, edit]])),
      'the group total after typing the new prices',
    );

    // Save. The PUT carries the WHOLE table; the echo is the server's own
    // arithmetic over the submitted values, in float32.
    const echo = await saveAndReadEcho(page);
    const echoed = echo.modules.find((row) => row.moduleId === target.moduleId);
    expectPricesClose(
      echoed?.currentPrice ?? -1,
      expectedEffective,
      'the final price the server computed and echoed',
    );

    // Reloaded from the SERVER, not held in the draft: the values survive a
    // full page reload, which is what makes this a persistence proof.
    await reloadCatalogPage(page);
    await expect(page.getByTestId(priceInputTestId(target.moduleId))).toHaveValue(String(edit.price));
    await expect(page.getByTestId(percentInputTestId(target.moduleId))).toHaveValue(
      String(edit.percentDiscountPrice),
    );
    await expect(page.getByTestId(discountInputTestId(target.moduleId))).toHaveValue(
      String(edit.discountPrice),
    );
    await expectRowFinalPrice(page, target.moduleId, formatAmount(expectedEffective));

    // And the catalog itself reports the new numbers.
    const after = await readCatalog(page);
    const saved = requireRow(after, target.moduleId, 'the module this spec edited');
    expectPricesClose(saved.price, edit.price, 'the persisted catalog base price');
    expectPricesClose(
      saved.percentDiscountPrice,
      edit.percentDiscountPrice,
      'the persisted catalog percent discount',
    );
    expectPricesClose(
      saved.discountPrice,
      edit.discountPrice,
      'the persisted catalog flat discount',
    );
    expectPricesClose(
      saved.currentPrice,
      expectedEffective,
      'the effective price the catalog read recomputed',
    );

    // No OTHER module moved. The save carries the whole table, so a page that
    // re-wrote a row with something other than the value it displayed would
    // silently reprice shared seed data — this is the assertion that catches it.
    const afterById = catalogById(after);
    expect(afterById.size).toBe(beforeById.size);
    for (const row of before) {
      if (row.id === target.moduleId) continue;
      const observed = afterById.get(row.id);
      expect(observed, `module ${row.id} disappeared from the catalog read`).toBeDefined();
      if (!observed) continue;
      expectPricesClose(observed.price, row.price, `module ${row.id} base price`);
      expectPricesClose(
        observed.percentDiscountPrice,
        row.percentDiscountPrice,
        `module ${row.id} percent discount`,
      );
      expectPricesClose(observed.discountPrice, row.discountPrice, `module ${row.id} flat discount`);
    }
  });

  test('MCP4 — typing updates the group total live, with no request until "Guardar"', async ({
    page,
  }) => {
    await signInSuperAdmin(page);
    const catalog = await readCatalog(page);
    const current = requireRow(catalog, target.moduleId, 'the module this spec edits');
    const groups = expectedPlanGroups(
      plans,
      catalog.map((row) => row.id),
    );
    const group = groups.find((entry) => entry.planType === target.planType);
    if (!group) {
      throw new Error('module-catalog-pricing: the edited module has no rendered plan group.');
    }

    // Only the BASE price is retyped; the two discounts MCP3 left behind are
    // read from the live catalog, so this test stands on its own whether it
    // runs after MCP3 or alone.
    const edit: Edit = {
      price: pickEditPrice(current.price),
      percentDiscountPrice: current.percentDiscountPrice,
      discountPrice: current.discountPrice,
    };
    const expectedEffective = expectedCurrentPrice(
      edit.price,
      edit.percentDiscountPrice,
      edit.discountPrice,
    );
    const totalBefore = groupEffectiveTotal(group.moduleIds, catalog);
    const totalAfter = groupEffectiveTotal(group.moduleIds, catalog, new Map([[target.moduleId, edit]]));
    // The precondition the "it moved" proof rests on: a different base price
    // really does change this group's sum.
    expect(Math.abs(totalAfter - totalBefore)).toBeGreaterThan(0.001);

    const puts = countCatalogPricingPuts(page);
    await page.goto('/admin/modules');
    await waitForCatalogTable(page);

    // What the page shows before typing is the catalog's own sum.
    await expectGroupTotal(
      page,
      group.planType,
      totalBefore,
      'the group total as loaded from the catalog',
    );

    await page.getByTestId(priceInputTestId(target.moduleId)).fill(String(edit.price));

    // Recomputed in the browser, on the keystroke: row and group total together.
    await expectRowFinalPrice(page, target.moduleId, formatAmount(expectedEffective));
    await expectGroupTotal(page, group.planType, totalAfter, 'the group total recomputed while typing');

    // And it moved with NO traffic: the browser owns the number until the
    // operator saves. A save-on-keystroke would show up here as a PUT.
    expect(puts()).toBe(0);

    // An offered group also shows the summed base struck through.
    if (group.moduleIds.some((moduleId) => isOnOffer(requireRow(catalog, moduleId, 'in a plan group')))) {
      await expect(page.getByTestId(groupBaseTotalTestId(group.planType))).toHaveText(
        `${formatAmount(groupBaseTotal(group.moduleIds, catalog, new Map([[target.moduleId, edit]])))} USD`,
      );
    }

    // Save: exactly one PUT, and the server's total over the whole table agrees
    // with the browser's group arithmetic over the same submitted values.
    const echo = await saveAndReadEcho(page);
    expect(puts()).toBe(1);
    expectPricesClose(
      echo.totalCurrentPrice,
      groupEffectiveTotal(
        catalog.map((row) => row.id),
        catalog,
        new Map([[target.moduleId, edit]]),
      ),
      'the total the server computed over the whole saved table',
    );
    const echoed = echo.modules.find((row) => row.moduleId === target.moduleId);
    expectPricesClose(
      echoed?.currentPrice ?? -1,
      expectedEffective,
      'the final price the server computed and echoed',
    );

    // After a reload the same total comes back — this time read from the server.
    await reloadCatalogPage(page);
    const after = await readCatalog(page);
    const afterRow = requireRow(after, target.moduleId, 'the module this spec edited');
    expectPricesClose(afterRow.price, edit.price, 'the persisted base price after the live-total edit');
    const afterGroups = expectedPlanGroups(
      plans,
      after.map((row) => row.id),
    );
    const afterGroup = afterGroups.find((entry) => entry.planType === target.planType);
    await expectGroupTotal(
      page,
      target.planType,
      groupEffectiveTotal(afterGroup?.moduleIds ?? group.moduleIds, after),
      'the group total shown after the reload',
    );
  });
});
