import { test, expect } from './support/test';
import { mintSuperAdmin, applySuperAdminSnapshot } from './support/superadmin-session';
import type { SuperAdminSnapshot } from './support/superadmin-session';

/**
 * SuperAdmin login without a store — regression test for the bug where
 * login threw DekUnwrapError because resolveDekForLogin tried to resolve
 * a DEK for selectedStoreId = 00000000-0000-0000-0000-000000000000.
 *
 * The fix skips DEK resolution for users with no assigned store (SuperAdmin/
 * Reseller), since the DEK is per-store encryption material and these users
 * have no wrap, no roster entry, and no device table.
 */

let superAdmin: SuperAdminSnapshot;

test.describe.serial('SuperAdmin login without store', () => {
  test.describe.configure({ timeout: 180_000 });

  test('mint SuperAdmin and capture snapshot', async ({ browser }) => {
    superAdmin = await mintSuperAdmin(browser);
    expect(superAdmin.identity).toBeDefined();
    expect(superAdmin.homePath).toMatch(/\/(admin|sales)/);
  });

  test('SuperAdmin session survives page reload without DEK error', async ({
    browser,
  }) => {
    const page = await browser.newPage();
    await applySuperAdminSnapshot(page, superAdmin);

    // Navigate to /login as authenticated user — should redirect to home
    await page.goto('/login');
    await page.waitForTimeout(3000);

    const url = new URL(page.url());

    // Should NOT be stuck on /login (the bug caused DekUnwrapError which bounced here)
    // Accept redirect to any authorized page
    expect(url.pathname).not.toBe('/login');

    // Should NOT show the DEK error message anywhere
    const body = await page.textContent('body');
    expect(body).not.toContain(
      'No se pudo abrir la información de esta tienda',
    );

    await page.close();
  });

  test('SuperAdmin can access /admin/owners directly', async ({ browser }) => {
    const page = await browser.newPage();
    await applySuperAdminSnapshot(page, superAdmin);

    await page.goto('/admin/owners');
    await page.waitForTimeout(2000);

    // Should not be redirected to login
    expect(new URL(page.url()).pathname).not.toBe('/login');
    // Should show the owners page
    await expect(page.getByText(/Propietarios|Owners/i)).toBeVisible();

    await page.close();
  });
});
