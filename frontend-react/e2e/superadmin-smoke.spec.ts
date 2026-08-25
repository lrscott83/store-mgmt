import { test, expect } from './support/test';
import { mintSuperAdmin, applySuperAdminSnapshot } from './support/superadmin-session';

/**
 * [FC-D1] Smoke test — validates SuperAdmin persona minting works.
 * Runs once to verify the DB promote + re-login flow produces
 * isSuperAdmin=true in localStorage.
 */

test('FC-D1 — SuperAdmin persona mint produces isSuperAdmin=true', async ({ browser }) => {
  const snapshot = await mintSuperAdmin(browser);

  // Verify the snapshot has expected fields
  expect(snapshot.identity).toBeDefined();
  expect(snapshot.selectedStoreId).toBeTruthy();
  expect(snapshot.localStorage.length).toBeGreaterThan(0);

  // Verify the localStorage contains a currentUser with isSuperAdmin
  const currentUserEntry = snapshot.localStorage.find(
    (e) => e.name === 'currentUser'
  );
  expect(currentUserEntry).toBeDefined();
  const user = JSON.parse(currentUserEntry!.value);
  expect(user.isSuperAdmin).toBe(true);
  expect(user.selectedStoreId).toBe(snapshot.selectedStoreId);

  // Verify we can restore the snapshot and navigate to admin routes
  const page = await browser.newPage();
  await applySuperAdminSnapshot(page, snapshot);

  // SuperAdmin should be able to access /admin/features
  await page.goto('/admin/features');
  await page.waitForTimeout(1000);
  // Should NOT redirect to /login
  expect(new URL(page.url()).pathname).not.toBe('/login');

  await page.close();
});
