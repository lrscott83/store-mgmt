import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { E2E_API_URL } from './support/backend-url';
import { applySuperAdminSnapshot, mintSuperAdmin } from './support/superadmin-session';
import {
  applyOwnerSnapshot,
  expectPricesClose,
  expectedCurrentPrice,
  expectedPlanGroups,
  findModuleWithoutStoreRow,
  isBillableRow,
  mintPlainOwner,
  openModulePricingModal,
  parsePlanPrice,
  planGroupTestId,
  PRICING_EPSILON,
  primeOnlyActiveModule,
  readPlanCatalog,
  readStoreModulePricing,
  type PricingReadRow,
} from './support/store-module-pricing-fixture';

/**
 * store-module-pricing (T6 of `odd/tasks/store-module-pricing-admin-view.md`)
 *
 * NEW spec file — no existing spec and no existing support helper is modified.
 * It drives the REAL SuperAdmin store card's gear menu, the REAL modal, the
 * REAL API and the REAL test database, and covers the eight behaviours T6
 * names:
 *
 *   SMP1 — the modal opens from the gear item and lists the store's own
 *          module-pricing universe, with the store's name on it.
 *   SMP2 — the table is grouped by plan, using the partition the LIVE
 *          `/v1/plans` matrix produces, with every module in exactly one group.
 *   SMP3 — the three price inputs are disabled while their row is unticked and
 *          unlock when it is ticked (client-side only, nothing saved).
 *   SMP4 — the total recomputes live in the browser while typing, and the
 *          edits are discarded without saving.
 *   SMP5 — the control is SuperAdmin-only: a plain owner is refused the route
 *          and the API answers 403 to the same call a SuperAdmin gets 200 on.
 *   SMP6 — ticking a module the store has NO row for INSERTS it, and the tick
 *          plus the typed price survive a reload.
 *   SMP7 — a saved price edit survives a reload.
 *   SMP8 — the browser's total and the server's total agree, percent before
 *          flat discount, including the clamp at zero.
 *
 * ── WHAT "THE TOTAL" MEANS ─────────────────────────────────────────────────
 * A row reaches a total only when it is BILLABLE: ticked (active) AND not
 * price-included — the rule the backend states in `ModulePriceCalculator` and
 * the client mirrors in `totalModulePricing`. An unticked row and a bundled
 * (gratis) row both contribute 0, whatever their price says. So every test
 * that measures a TOTAL picks a row the rule can actually charge: a bundled
 * row priced at 10 would otherwise leave the total at 0 and turn every figure
 * below into a coincidence. The per-row "Precio actual" column is unaffected —
 * it reports what a row WOULD cost, billable or not — which is why the row
 * figures (85, 36, 25, 8.5) are unchanged and only the totals are reasoned
 * about here.
 *
 * ORDER MATTERS, and deliberately so. The suite is `serial` for two reasons:
 * a single SuperAdmin mint and a single owner mint are replayed per test
 * (`applySuperAdminSnapshot` / `applyOwnerSnapshot` cost zero logins), and
 * SMP6 must observe a store that has never been written to, because "the tick
 * INSERTED a row" is only provable against a store with no row for that
 * module. Every test that mutates therefore primes its own baseline through the
 * API first (`primeOnlyActiveModule`), and every test that asserts reads the
 * live state through the API first — never a value remembered from an earlier
 * test.
 *
 * Nothing here hardcodes a module id. The module universe, the plan grouping
 * and the per-row prices all come from the live endpoints, and the browser-side
 * formula is re-implemented independently in the support file
 * (`expectedCurrentPrice`) precisely so the test is not the app checking itself.
 *
 * Cost: 2 registrations (one SuperAdmin, one plain owner), 1 login (the
 * SuperAdmin re-login `mintSuperAdmin` needs for the super_admin claim) and 0
 * owner logins — the same order of magnitude as `plan-catalog-superadmin.spec.ts`.
 */

let superAdmin: Awaited<ReturnType<typeof mintSuperAdmin>>;
let plainOwner: Awaited<ReturnType<typeof mintPlainOwner>>;

/** The SuperAdmin's own store, created by its registration — the store under test. */
function storeId(): string {
  return superAdmin.selectedStoreId;
}

/** Counts `PUT /v1/stores/{id}/module-pricing` requests the PAGE issues. */
function countPricingPuts(page: Page, targetStoreId: string): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'PUT' &&
      request.url().includes(`/v1/stores/${targetStoreId}/module-pricing`)
    ) {
      count += 1;
    }
  });
  return () => count;
}

/** Restores the SuperAdmin and opens the pricing modal for its own store. */
async function openModalForStoreUnderTest(page: Page) {
  await applySuperAdminSnapshot(page, superAdmin);
  return openModulePricingModal(page, storeId());
}

/**
 * The row a total measurement must be built on: BILLABLE (`isBillableRow`), so
 * the number under test is decided by the prices typed into it.
 *
 * Without this the tests would silently measure a bundled row: the price rule
 * excludes it, the total stays at 0, and an assertion of "0 USD" would hold no
 * matter what the arithmetic did. The store's OWN rows carry their frozen
 * `priceIncluded`, and the read reports it, so this is a decision about live
 * data — never a hardcoded module id.
 */
function requireBillableRow(
  rows: readonly PricingReadRow[],
  what: string,
  predicate: (row: PricingReadRow) => boolean = (row) => row.isActive,
): PricingReadRow {
  const row = rows.find((entry) => predicate(entry) && isBillableRow(entry));
  if (!row) {
    throw new Error(
      `store-module-pricing: no BILLABLE (active and not price-included) row qualifies as ${what}, ` +
        `so the total measured on it would be 0 whatever it is priced at and every assertion built ` +
        `on it would be vacuous. Rows: ${JSON.stringify(
          rows.map((entry) => ({
            moduleId: entry.moduleId,
            isActive: entry.isActive,
            priceIncluded: entry.priceIncluded,
          })),
        )}`,
    );
  }
  return row;
}

test.describe.serial('SuperAdmin per-store module pricing', () => {
  test.beforeAll(async ({ browser }) => {
    superAdmin = await mintSuperAdmin(browser);
    plainOwner = await mintPlainOwner(browser);
  });

  test('SMP1 — the gear menu opens the modal with the store name and its own module universe', async ({
    page,
  }) => {
    // Read the truth first: a modal that lists something other than this would
    // be the defect, and reading after the fact could not tell which side moved.
    const read = await (async () => {
      await applySuperAdminSnapshot(page, superAdmin);
      return readStoreModulePricing(page, storeId());
    })();
    expect(read.modules.length).toBeGreaterThan(0);

    const modal = await openModulePricingModal(page, storeId());

    // The header names the store the card belongs to, from the registration.
    await expect(modal.getByTestId('module-pricing-store')).toHaveText(
      superAdmin.identity.storeName,
    );

    // One row per module in the store's pricing universe — no more, no fewer.
    const ticks = modal.locator('[data-testid^="module-pricing-tick-"]');
    await expect(ticks).toHaveCount(read.modules.length);

    // The same modules, each exactly once. NOT the same ORDER: the table is
    // grouped by plan, so a module that belongs to a later plan moves after the
    // group it lands in (module 16 is VIP-only and therefore sorts last). The
    // order itself is pinned by SMP2, per group, against the live plan matrix.
    const renderedIds = await ticks.evaluateAll((elements) =>
      elements.map((element) =>
        Number(element.getAttribute('data-testid')?.replace('module-pricing-tick-', '')),
      ),
    );
    expect(new Set(renderedIds).size).toBe(renderedIds.length);
    expect(renderedIds.slice().sort((a, b) => a - b)).toEqual(
      read.modules.map((row) => row.moduleId).sort((a, b) => a - b),
    );

    // The editor is seeded from the store's OWN discounts, not from the nested
    // `store.modules[]` (which reports 0 for both — ModuleProfile.cs).
    for (const row of read.modules) {
      await expect(modal.getByTestId(`module-pricing-price-${row.moduleId}`)).toHaveValue(
        String(row.price),
      );
      await expect(modal.getByTestId(`module-pricing-discount-${row.moduleId}`)).toHaveValue(
        String(row.discountPrice),
      );
      await expect(modal.getByTestId(`module-pricing-percent-${row.moduleId}`)).toHaveValue(
        String(row.percentDiscountPrice),
      );
    }
  });

  test('SMP2 — the table is grouped by plan, every module in exactly one group', async ({
    page,
  }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    const read = await readStoreModulePricing(page, storeId());
    const plans = await readPlanCatalog(page);
    // Live plan matrix, live module universe — the expectation cannot go stale
    // the way a hardcoded list of module ids would.
    const expected = expectedPlanGroups(
      plans,
      read.modules.map((row) => row.moduleId),
    );
    expect(expected.length).toBeGreaterThan(0);

    const modal = await openModulePricingModal(page, storeId());

    // One header per NON-EMPTY group, in the plan `order` the catalog reports.
    const headers = modal.locator('[data-testid^="module-pricing-group-"]');
    await expect(headers).toHaveCount(expected.length);
    for (let index = 0; index < expected.length; index += 1) {
      await expect(headers.nth(index)).toHaveAttribute(
        'data-testid',
        planGroupTestId(expected[index].planType),
      );
    }

    // TOTALITY: the groups cover the universe exactly once. A module rendered
    // twice would be saved twice, and one rendered in no group at all would be
    // read by the backend as "leave this module untouched" — the silent skip
    // the plan calls out. Both are caught by comparing the flattened ids.
    const renderedIds = await modal
      .locator('[data-testid^="module-pricing-tick-"]')
      .evaluateAll((elements) =>
        elements.map((element) =>
          Number(element.getAttribute('data-testid')?.replace('module-pricing-tick-', '')),
        ),
      );
    expect(renderedIds).toHaveLength(expected.reduce((sum, g) => sum + g.moduleIds.length, 0));
    expect(new Set(renderedIds).size).toBe(renderedIds.length);
    expect(renderedIds.slice().sort((a, b) => a - b)).toEqual(
      read.modules.map((row) => row.moduleId).sort((a, b) => a - b),
    );

    // Each group holds the modules the delta rule gives it — computed from the
    // live `/v1/plans` matrix, not from the app's own grouping function. The
    // group header lives INSIDE the same `<tbody>` as its rows, so `:has()`
    // selects the tbody that owns the header rather than a sibling.
    for (const group of expected) {
      const groupTicks = modal
        .locator(`tbody:has([data-testid="${planGroupTestId(group.planType)}"])`)
        .locator('[data-testid^="module-pricing-tick-"]');
      const groupIds = await groupTicks.evaluateAll((elements) =>
        elements.map((element) =>
          Number(element.getAttribute('data-testid')?.replace('module-pricing-tick-', '')),
        ),
      );
      expect(groupIds).toEqual(group.moduleIds);
    }
  });

  test('SMP3 — the three price inputs are disabled while the row is unticked', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    const read = await readStoreModulePricing(page, storeId());
    const unticked = read.modules.find((row) => !row.isActive);
    if (!unticked) {
      throw new Error(
        'store-module-pricing: every module of this store is already active, so there is no ' +
          'unticked row to prove that the inputs are locked while unticked. The precondition ' +
          'this test depends on is missing.',
      );
    }

    const puts = countPricingPuts(page, storeId());
    const modal = await openModulePricingModal(page, storeId());
    const id = unticked.moduleId;
    const price = modal.getByTestId(`module-pricing-price-${id}`);
    const discount = modal.getByTestId(`module-pricing-discount-${id}`);
    const percent = modal.getByTestId(`module-pricing-percent-${id}`);

    // Untick -> the values are still on display (untick must not lose them) and
    // all three inputs are locked.
    await expect(modal.getByTestId(`module-pricing-tick-${id}`)).not.toBeChecked();
    await expect(price).toBeDisabled();
    await expect(discount).toBeDisabled();
    await expect(percent).toBeDisabled();
    const keptPrice = await price.inputValue();
    const keptDiscount = await discount.inputValue();
    const keptPercent = await percent.inputValue();

    // Tick -> all three unlock.
    await modal.getByTestId(`module-pricing-tick-${id}`).check();
    await expect(price).toBeEnabled();
    await expect(discount).toBeEnabled();
    await expect(percent).toBeEnabled();

    // Untick again -> locked, and the values survived the round trip, so a
    // half-finished edit is not silently discarded.
    await modal.getByTestId(`module-pricing-tick-${id}`).uncheck();
    await expect(price).toBeDisabled();
    await expect(discount).toBeDisabled();
    await expect(percent).toBeDisabled();
    expect(await price.inputValue()).toBe(keptPrice);
    expect(await discount.inputValue()).toBe(keptDiscount);
    expect(await percent.inputValue()).toBe(keptPercent);

    // None of that was an edit worth persisting: the modal is a draft until
    // Salvar, and cancelling must leave the store exactly as it was.
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toBeHidden();
    expect(puts()).toBe(0);
    const after = await readStoreModulePricing(page, storeId());
    expect(after.modules.find((row) => row.moduleId === id)?.isActive).toBe(false);
  });

  test('SMP4 — the total recomputes live in the browser, and cancels without saving', async ({
    page,
  }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    const read = await readStoreModulePricing(page, storeId());
    const totalBefore = read.totalCurrentPrice;
    // A row the price rule can charge: an ACTIVE row the store is NOT already
    // paying for through its plan. A bundled row would be excluded from the live
    // total whatever is typed into it, so the 85/90 below would measure nothing.
    const target = requireBillableRow(read.modules, 'the single contributor of the live total');

    const puts = countPricingPuts(page, storeId());
    const modal = await openModulePricingModal(page, storeId());

    // Client-side only: un-tick every active row except the target, so the live
    // total has exactly one contributor and its value is fully determined by
    // the three inputs below. Nothing is saved, so the store is untouched.
    for (const row of read.modules) {
      if (row.isActive && row.moduleId !== target.moduleId) {
        await modal.getByTestId(`module-pricing-tick-${row.moduleId}`).uncheck();
      }
    }
    await expect(modal.getByTestId(`module-pricing-tick-${target.moduleId}`)).toBeChecked();

    // 100 - 100*5/100 - 10 = 85, recomputed in the browser as the values land.
    await modal.getByTestId(`module-pricing-price-${target.moduleId}`).fill('100');
    await modal.getByTestId(`module-pricing-discount-${target.moduleId}`).fill('10');
    await modal.getByTestId(`module-pricing-percent-${target.moduleId}`).fill('5');
    await expect(modal.getByTestId(`module-pricing-current-${target.moduleId}`)).toHaveText('85');
    await expect(modal.getByTestId('module-pricing-total')).toHaveText('85 USD');

    // And it MOVES: a second edit moves the total without any request.
    await modal.getByTestId(`module-pricing-percent-${target.moduleId}`).fill('0');
    // 100 - 0 - 10 = 90
    await expect(modal.getByTestId(`module-pricing-current-${target.moduleId}`)).toHaveText('90');
    await expect(modal.getByTestId('module-pricing-total')).toHaveText('90 USD');

    // An un-ticked row contributes nothing: re-ticking one of the rows dropped
    // above adds its stored current price back. It must be a BILLABLE row —
    // re-ticking a bundled one would add 0, and `90 + 0` would prove nothing
    // about exclusion.
    const dropped = read.modules.find(
      (row) => row.isActive && row.moduleId !== target.moduleId && isBillableRow(row),
    );
    if (dropped) {
      const droppedCurrent = dropped.currentPrice;
      if (droppedCurrent > 0) {
        await modal.getByTestId(`module-pricing-tick-${dropped.moduleId}`).check();
        const total = parsePlanPrice(await modal.getByTestId('module-pricing-total').innerText());
        expectPricesClose(total, 90 + droppedCurrent, 'live total after re-ticking a row');
        await modal.getByTestId(`module-pricing-tick-${dropped.moduleId}`).uncheck();
        await expect(modal.getByTestId('module-pricing-total')).toHaveText('90 USD');
      }
    }

    // Never saved: no PUT, and the stored state is byte-for-byte what it was.
    expect(puts()).toBe(0);
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toBeHidden();
    const after = await readStoreModulePricing(page, storeId());
    expectPricesClose(after.totalCurrentPrice, totalBefore, 'stored total after a cancelled edit');
  });

  test('SMP5 — the control is SuperAdmin-only: an owner is refused, and the API answers 403', async ({
    page,
  }) => {
    await applyOwnerSnapshot(page, plainOwner);

    // A SuperAdmin reaches the same page and the same call the owner is about
    // to be refused — so the refusal below is about the CALLER, not a route or
    // an id that simply does not work.
    const asSuperAdmin = await page.request.get(
      `${E2E_API_URL}/v1/stores/${plainOwner.selectedStoreId}/module-pricing`,
      {
        headers: {
          Authorization: `Bearer ${
            superAdmin.localStorage.find((entry) => entry.name === 'token')?.value ?? ''
          }`,
        },
      },
    );
    expect(asSuperAdmin.status()).toBe(200);

    // The same call, same store, as the plain owner.
    const asOwner = await page.request.get(
      `${E2E_API_URL}/v1/stores/${plainOwner.selectedStoreId}/module-pricing`,
      {
        headers: {
          Authorization: `Bearer ${
            plainOwner.localStorage.find((entry) => entry.name === 'token')?.value ?? ''
          }`,
        },
      },
    );
    expect(asOwner.status()).toBe(403);

    // And the UI never offers the control: `/admin/stores` is behind
    // `resellerLoader`, which a plain owner does not pass.
    await page.goto('/admin/stores');
    await page.waitForURL(/\/login$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Tiendas' })).toBeHidden();
    expect(await page.locator('[data-testid^="store-module-pricing-action-"]').count()).toBe(0);
  });

  test('SMP6 — ticking a module the store has no row for inserts it and survives a reload', async ({
    page,
  }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    const read = await readStoreModulePricing(page, storeId());

    // Pick a module with NO StoreModule row, so the tick is an INSERT and not a
    // reactivation — the read universe lists both identically, so only the
    // table can tell them apart.
    //
    // Candidates are restricted to BILLABLE ones (`priceIncluded === false` on
    // the catalog value the insert will freeze). A bundled newcomer would be
    // excluded from the total by the price rule, so the "it is now part of the
    // stored total" assertion below would hold for the wrong reason.
    const inactive = read.modules
      .filter((row) => !row.isActive && !row.priceIncluded)
      .map((row) => row.moduleId);
    const newcomer = await findModuleWithoutStoreRow(storeId(), inactive);
    const keptActive = read.modules.find((row) => row.isActive);
    if (!keptActive) {
      throw new Error(
        'store-module-pricing: the store has no active module to anchor the total, so the ' +
          'insert would be unobservable in the total.',
      );
    }

    const modal = await openModulePricingModal(page, storeId());
    await expect(modal.getByTestId(`module-pricing-tick-${newcomer}`)).not.toBeChecked();
    await modal.getByTestId(`module-pricing-tick-${newcomer}`).check();
    await expect(modal.getByTestId(`module-pricing-price-${newcomer}`)).toBeEnabled();
    await modal.getByTestId(`module-pricing-price-${newcomer}`).fill('40');
    await modal.getByTestId(`module-pricing-discount-${newcomer}`).fill('4');
    await modal.getByTestId(`module-pricing-percent-${newcomer}`).fill('0');
    // 40 - 0 - 4 = 36
    await expect(modal.getByTestId(`module-pricing-current-${newcomer}`)).toHaveText('36');

    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes(`/v1/stores/${storeId()}/module-pricing`),
    );
    await modal.getByTestId('module-pricing-save').click();
    const saveResponse = await saved;
    expect(saveResponse.ok()).toBe(true);

    // Persisted, not just held in the draft: a fresh read reports it active,
    // and it is now part of the stored total.
    const after = await readStoreModulePricing(page, storeId());
    const inserted = after.modules.find((row) => row.moduleId === newcomer);
    expect(inserted?.isActive).toBe(true);
    expectPricesClose(inserted?.currentPrice ?? 0, 36, 'inserted row currentPrice');
    const keptCurrent = after.modules.find((row) => row.moduleId === keptActive.moduleId);
    expect(keptCurrent?.isActive).toBe(true);

    // The stored total is the sum over every BILLABLE row, so the honest
    // expectation is the server's own pre-save total plus the row just added —
    // the newcomer is billable, so its 36 does reach the total.
    // (Anchoring on a single module would be wrong: the store starts with more
    // than one active module.)
    expectPricesClose(
      after.totalCurrentPrice,
      read.totalCurrentPrice + 36,
      'stored total after inserting a module',
    );

    // Survives a reload: the state is re-read from the server, not restored.
    await page.reload();
    const reopened = await openModulePricingModal(page, storeId());
    await expect(reopened.getByTestId(`module-pricing-tick-${newcomer}`)).toBeChecked();
    await expect(reopened.getByTestId(`module-pricing-price-${newcomer}`)).toHaveValue('40');
    await expect(reopened.getByTestId(`module-pricing-discount-${newcomer}`)).toHaveValue('4');
    await expect(reopened.getByTestId(`module-pricing-percent-${newcomer}`)).toHaveValue('0');
    await expect(reopened.getByTestId(`module-pricing-current-${newcomer}`)).toHaveText('36');
    // Ticking one module did not disturb the others.
    await expect(reopened.getByTestId(`module-pricing-tick-${keptActive.moduleId}`)).toBeChecked();
  });

  test('SMP7 — a saved price edit survives a reload', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    const read = await readStoreModulePricing(page, storeId());
    // BILLABLE, because this test's whole claim is "the total is 25": a bundled
    // row is excluded from the total by the price rule, so the baseline would
    // contribute 0 and every assertion below would hold for the wrong reason.
    const target = requireBillableRow(read.modules, "SMP7's single priced module", () => true);

    // Deterministic baseline: exactly one active module, so the total below has
    // a single contributor and cannot drift on an unrelated row.
    await primeOnlyActiveModule(page, storeId(), target.moduleId, {
      price: 25,
      discountPrice: 5,
      percentDiscountPrice: 0,
    });

    const modal = await openModulePricingModal(page, storeId());
    await expect(modal.getByTestId(`module-pricing-price-${target.moduleId}`)).toHaveValue('25');
    await modal.getByTestId(`module-pricing-price-${target.moduleId}`).fill('30');
    // 30 - 0 - 5 = 25
    await expect(modal.getByTestId(`module-pricing-current-${target.moduleId}`)).toHaveText('25');
    await expect(modal.getByTestId('module-pricing-total')).toHaveText('25 USD');

    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes(`/v1/stores/${storeId()}/module-pricing`),
    );
    await modal.getByTestId('module-pricing-save').click();
    expect((await saved).ok()).toBe(true);

    await page.reload();
    const reopened = await openModulePricingModal(page, storeId());
    await expect(reopened.getByTestId(`module-pricing-tick-${target.moduleId}`)).toBeChecked();
    await expect(reopened.getByTestId(`module-pricing-price-${target.moduleId}`)).toHaveValue('30');
    await expect(reopened.getByTestId(`module-pricing-discount-${target.moduleId}`)).toHaveValue(
      '5',
    );
    await expect(reopened.getByTestId(`module-pricing-percent-${target.moduleId}`)).toHaveValue(
      '0',
    );
    await expect(reopened.getByTestId(`module-pricing-current-${target.moduleId}`)).toHaveText(
      '25',
    );
    await expect(reopened.getByTestId('module-pricing-total')).toHaveText('25 USD');

    // The store's own copy, read back through the API, agrees with the screen.
    const after = await readStoreModulePricing(page, storeId());
    const row = after.modules.find((entry) => entry.moduleId === target.moduleId);
    expect(row?.price).toBeCloseTo(30, 3);
    expect(row?.discountPrice).toBeCloseTo(5, 3);
    expect(row?.percentDiscountPrice).toBeCloseTo(0, 3);
    expectPricesClose(after.totalCurrentPrice, 25, 'stored total after a price edit');
  });

  test('SMP8 — the browser total equals the server total, percent before discount, clamped at zero', async ({
    page,
  }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    const read = await readStoreModulePricing(page, storeId());
    // Both rows must be BILLABLE: the price rule excludes a bundled row from the
    // total, so a bundled `primary` would make the whole comparison read 0 vs 0
    // and the two implementations would never actually be compared on a charge.
    const primary = requireBillableRow(read.modules, "SMP8's order-sensitive row");
    const second = requireBillableRow(
      read.modules,
      "SMP8's over-discounted row (the clamp needs a second, billable row)",
      (row) => row.moduleId !== primary.moduleId,
    );

    await primeOnlyActiveModule(page, storeId(), primary.moduleId, {
      price: 10,
      discountPrice: 0,
      percentDiscountPrice: 0,
    });

    const modal = await openModulePricingModal(page, storeId());

    // Two ticked rows whose arithmetic is order-sensitive and negative:
    //   primary: 10 - 10*10/100 - 0.5 = 8.5   (flat-first would give 8.55)
    //   second:   4 - 0 - 10           = -6 -> clamped to 0
    await modal.getByTestId(`module-pricing-tick-${second.moduleId}`).check();
    await modal.getByTestId(`module-pricing-price-${primary.moduleId}`).fill('10');
    await modal.getByTestId(`module-pricing-discount-${primary.moduleId}`).fill('0.5');
    await modal.getByTestId(`module-pricing-percent-${primary.moduleId}`).fill('10');
    await modal.getByTestId(`module-pricing-price-${second.moduleId}`).fill('4');
    await modal.getByTestId(`module-pricing-discount-${second.moduleId}`).fill('10');
    await modal.getByTestId(`module-pricing-percent-${second.moduleId}`).fill('0');

    const expectedPrimary = expectedCurrentPrice(10, 10, 0.5);
    const expectedSecond = expectedCurrentPrice(4, 0, 10);
    expect(expectedPrimary).toBeCloseTo(8.5, 6);
    // The clamp is the point: the raw difference is negative, the stored one is not.
    expect(4 - 0 - 10).toBeLessThan(0);
    expect(expectedSecond).toBe(0);

    // The browser agrees with that, per row and in the total.
    await expect(modal.getByTestId(`module-pricing-current-${primary.moduleId}`)).toHaveText('8.5');
    await expect(modal.getByTestId(`module-pricing-current-${second.moduleId}`)).toHaveText('0');
    await expect(modal.getByTestId('module-pricing-total')).toHaveText('8.5 USD');

    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes(`/v1/stores/${storeId()}/module-pricing`),
    );
    await modal.getByTestId('module-pricing-save').click();
    const saveResponse = await saved;
    expect(saveResponse.ok()).toBe(true);

    // What the SERVER computed, over the same saved values, in float32.
    const serverTotal = (await saveResponse.json()) as {
      data: { totalCurrentPrice: number };
    };
    const serverValue = serverTotal.data.totalCurrentPrice;
    expectPricesClose(serverValue, expectedPrimary + expectedSecond, 'the server total');

    // Right after a save the modal presents the SERVER's number, and says so.
    const note = 'Total guardado por el servidor. Se recalcula al editar cualquier valor.';
    await expect(modal.getByTestId('module-pricing-total')).toHaveText('8.5 USD');
    await expect(modal.getByText(note)).toBeVisible();
    expectPricesClose(
      parsePlanPrice(await modal.getByTestId('module-pricing-total').innerText()),
      serverValue,
      'the total shown straight after the save',
    );

    // Any edit retires the persisted total and hands the number back to the
    // browser. Un-ticking and re-ticking the SAME row changes no value, so the
    // two implementations are then compared on identical input.
    await modal.getByTestId(`module-pricing-tick-${primary.moduleId}`).uncheck();
    await modal.getByTestId(`module-pricing-tick-${primary.moduleId}`).check();

    await expect(modal.getByText(note)).toBeHidden();
    await expect(modal.getByTestId(`module-pricing-current-${primary.moduleId}`)).toHaveText('8.5');
    await expect(modal.getByTestId(`module-pricing-current-${second.moduleId}`)).toHaveText('0');
    const liveTotal = parsePlanPrice(await modal.getByTestId('module-pricing-total').innerText());
    expectPricesClose(liveTotal, serverValue, 'the browser total against the server total');
    expect(PRICING_EPSILON).toBeLessThan(0.01);
  });
});
