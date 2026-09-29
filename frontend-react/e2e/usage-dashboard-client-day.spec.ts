import { test, expect } from './support/test';
import { mintSuperAdmin, applySuperAdminSnapshot } from './support/superadmin-session';
import type { SuperAdminSnapshot } from './support/superadmin-session';

/**
 * Usage dashboard — the day the window is anchored on (client-local-day).
 *
 * A `StoreUsage.Day` row is a pure calendar day in the store's OWN local calendar
 * (always 00:00:00 UTC, stamped from a "yyyy-MM-dd" the client built with local
 * parts). The server used to anchor its 7/30-bucket window on `UtcNow`, so for a
 * user behind UTC the UTC date is already tomorrow during the evening: the buckets
 * the server returned belonged to a different day than the one the dashboard was
 * showing. Nothing about the rendering changes — the same labels, the same chart,
 * the same numbers. Only the window moves to the day the client declares.
 *
 * The fix makes the client send `?today=` (required) and the server anchor there.
 * Neither suite can catch this end to end on its own: the backend E2E validates the
 * server given a day, and the frontend unit suite validates the day the service
 * computes — never that a real browser in a real timezone sends the right one. That
 * join is what this spec pins.
 *
 * Two deliberate choices make the assertion real rather than incidental:
 *   - `timezoneId` is pinned behind UTC, so local and UTC days genuinely diverge;
 *   - the browser clock is FROZEN at an instant where they provably differ, so the
 *     spec discriminates a local-date implementation from a UTC one no matter what
 *     hour the suite happens to run. Without the freeze, a run inside the agreeing
 *     window would pass against the buggy code too.
 */

const TIMEZONE = 'America/Havana'; // UTC-5 year round: no DST, no ambiguity

/** 2026-09-30T02:00Z is 2026-09-29 21:00 in TIMEZONE — local day is the PREVIOUS one. */
const FROZEN_INSTANT = '2026-09-30T02:00:00.000Z';
const EXPECTED_LOCAL_TODAY = '2026-09-29';
const EXPECTED_UTC_TODAY = '2026-09-30';

interface UsagesCall {
  url: string;
  status: number;
  body: { data?: { storeUsagesCountDays?: number[] } } | null;
}

let superAdmin: SuperAdminSnapshot;

test.describe.configure({ mode: 'serial' });

test.describe('Usages window is anchored on the client day', () => {
  test.use({ timezoneId: TIMEZONE });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    superAdmin = await mintSuperAdmin(browser);
  });

  test('the browser sends its own local day, and the server answers 200 for it', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    // FixedTime (not install) so only the clock's "now" is frozen; the app's timers
    // keep running and the lazy-loaded chart can still mount.
    await page.clock.setFixedTime(new Date(FROZEN_INSTANT));

    const calls: UsagesCall[] = [];
    page.on('response', async (response) => {
      if (!response.url().includes('/v1/usages/stores-last-')) return;
      calls.push({
        url: response.url(),
        status: response.status(),
        body: await response.json().catch(() => null),
      });
    });

    await page.goto('/admin/dashboard');
    await expect
      .poll(() => calls.length, { timeout: 20_000, message: 'the dashboard never requested usages' })
      .toBeGreaterThan(0);

    // Sanity: the frozen instant MUST separate the two calendars, otherwise the whole
    // spec is vacuous and would pass against the old UTC-anchored code.
    const inPage = await page.evaluate(() => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        local: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        utc: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`,
        offset: now.getTimezoneOffset(),
      };
    });
    expect(inPage.offset, 'the pinned timezone must be behind UTC').toBeGreaterThan(0);
    expect(inPage.local).toBe(EXPECTED_LOCAL_TODAY);
    expect(inPage.utc).toBe(EXPECTED_UTC_TODAY);
    expect(inPage.local, 'the frozen instant must separate the local and UTC days').not.toBe(inPage.utc);

    for (const call of calls) {
      const today = new URL(call.url).searchParams.get('today');
      expect(today, `${call.url} must declare the client day — the endpoint requires it`).toBe(
        EXPECTED_LOCAL_TODAY,
      );
      expect(today, 'a UTC (toISOString) implementation fails exactly here').not.toBe(EXPECTED_UTC_TODAY);
      expect(call.status).toBe(200);
    }

    // The server accepted that day and returned the dense window for it: 7 buckets
    // ending on the client's day. This is the join the unit suites cannot see.
    const week = calls.find((c) => c.url.includes('stores-last-week'));
    expect(week, 'the 7-day view must have loaded').toBeDefined();
    expect(week!.body?.data?.storeUsagesCountDays).toHaveLength(7);
  });

  test('the 30-day view also declares the same client day', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.clock.setFixedTime(new Date(FROZEN_INSTANT));

    const calls: UsagesCall[] = [];
    page.on('response', async (response) => {
      if (!response.url().includes('/v1/usages/stores-last-month')) return;
      calls.push({
        url: response.url(),
        status: response.status(),
        body: await response.json().catch(() => null),
      });
    });

    await page.goto('/admin/dashboard');
    // Selected by its pressed state, not by its label text: the label is localized
    // and a text match would silently stop matching if the copy changes. This spec
    // only cares that switching the view re-requests the window with the same day.
    // The dashboard ships exactly two toggles (7 days pressed by default, 30 days
    // not), so pinning that count keeps this locator from drifting onto some other
    // unpressed button if one ever appears elsewhere on the page.
    const monthToggle = page.locator('button[aria-pressed="false"]');
    await expect(monthToggle).toHaveCount(1);
    await monthToggle.click();

    await expect
      .poll(() => calls.length, { timeout: 20_000, message: 'the 30-day view never requested usages' })
      .toBeGreaterThan(0);

    for (const call of calls) {
      expect(new URL(call.url).searchParams.get('today')).toBe(EXPECTED_LOCAL_TODAY);
      expect(call.status).toBe(200);
    }
    expect(calls.at(-1)?.body?.data?.storeUsagesCountDays).toHaveLength(30);
  });
});
