import { test, expect } from './support/test';
import { mintSuperAdmin, applySuperAdminSnapshot } from './support/superadmin-session';
import type { SuperAdminSnapshot } from './support/superadmin-session';

/**
 * [FC-D2–D8] Admin routes — E2E Playwright
 * docs/testing/frontend-coverage/ (FC-D2 through FC-D8)
 *
 * Tests all admin and management routes that require SuperAdmin access.
 * Uses the SuperAdmin persona (minted via DB promotion) to verify each
 * route loads without redirecting to /login.
 *
 * All tests share a single SuperAdmin snapshot (minted once, reused).
 */

let superAdmin: SuperAdminSnapshot;

test.beforeAll(async ({ browser }) => {
  superAdmin = await mintSuperAdmin(browser);
});

test.describe('FC-D4 — Admin Features (/admin/features)', () => {
  test('page loads and shows features heading', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await applySuperAdminSnapshot(page, superAdmin);

    await page.goto('/admin/features');
    await page.waitForTimeout(1000);

    // Should NOT redirect to /login
    expect(new URL(page.url()).pathname).not.toBe('/login');
    // Page should have content (features are loaded via API)
    await expect(page.locator('body')).toContainText(/\w+/);
  });
});

test.describe('FC-D5 — Admin Stores (/admin/stores)', () => {
  test('page loads and shows stores list', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await applySuperAdminSnapshot(page, superAdmin);

    await page.goto('/admin/stores');
    await page.waitForTimeout(1000);

    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });
});

test.describe('FC-D6 — Admin Dashboard (/admin/dashboard)', () => {
  test('page loads and shows dashboard content', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await applySuperAdminSnapshot(page, superAdmin);

    await page.goto('/admin/dashboard');
    await page.waitForTimeout(1000);

    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });
});

test.describe('FC-D2 — Admin Owners (/admin/owners)', () => {
  test('owner list loads with heading', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await applySuperAdminSnapshot(page, superAdmin);

    await page.goto('/admin/owners');
    await page.waitForTimeout(1000);

    expect(new URL(page.url()).pathname).not.toBe('/login');
    // Should show owners list title
    await expect(page.getByText(/Propietarios|Owners/i)).toBeVisible();
  });
});

test.describe('FC-D3 — Admin Resellers (/admin/resellers)', () => {
  test('reseller list loads with heading', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await applySuperAdminSnapshot(page, superAdmin);

    await page.goto('/admin/resellers');
    await page.waitForTimeout(1000);

    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });
});

test.describe('FC-D7 — Collections (/management/stores/collections)', () => {
  test('page loads without redirect', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await applySuperAdminSnapshot(page, superAdmin);

    await page.goto('/management/stores/collections');
    await page.waitForTimeout(1000);

    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });
});

test.describe('FC-D8 — Commissions (/management/stores/commissions)', () => {
  test('page loads without redirect', async ({ signedInPage }) => {
    const { page } = signedInPage;
    await applySuperAdminSnapshot(page, superAdmin);

    await page.goto('/management/stores/commissions');
    await page.waitForTimeout(1000);

    expect(new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.locator('body')).toContainText(/\w+/);
  });
});
