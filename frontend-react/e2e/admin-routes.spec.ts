import { test, expect } from './support/test';
import { mintSuperAdmin, applySuperAdminSnapshot } from './support/superadmin-session';
import type { SuperAdminSnapshot } from './support/superadmin-session';

/**
 * [FC-D2–D8] Admin routes — E2E Playwright
 * docs/testing/frontend-coverage/ (FC-D2 through FC-D8)
 *
 * Tests all admin and management routes that require SuperAdmin access.
 * Uses serial mode + a single beforeAll to mint the SuperAdmin persona
 * once per worker, avoiding login rate-limit exhaustion.
 */

let superAdmin: SuperAdminSnapshot;

test.describe.serial('Admin routes (SuperAdmin)', () => {
  // mintSuperAdmin registers + logs in twice + promotes via DB; under the
  // full 8-worker suite this routinely exceeds Playwright's 30s default hook
  // timeout, so grant it an explicit longer budget (see load-flake evidence).
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90_000);
    superAdmin = await mintSuperAdmin(browser);
  });

  test('FC-D4 — /admin/features loads', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/admin/features');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('FC-D5 — /admin/stores loads', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/admin/stores');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('FC-D6 — /admin/dashboard loads', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/admin/dashboard');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('FC-D2 — /admin/owners loads with heading', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/admin/owners');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.getByText(/Propietarios|Owners/i)).toBeVisible();
  });

  test('FC-D3 — /admin/resellers loads', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/admin/resellers');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('FC-D7 — /management/stores/collections loads', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/management/stores/collections');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });

  test('FC-D8 — /management/stores/commissions loads', async ({ page }) => {
    await applySuperAdminSnapshot(page, superAdmin);
    await page.goto('/management/stores/commissions');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });
});
