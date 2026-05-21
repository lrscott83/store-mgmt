import { test, expect } from '@playwright/test';

/**
 * Test suite for Login redirect functionality
 *
 * NOTE: Testing authenticated redirects is difficult because:
 * 1. Playwright's addInitScript doesn't work reliably with this Angular app
 * 2. The localStorage is reset when Angular bootstraps
 * 3. APP_INITIALIZER runs before our test scripts can inject auth data
 *
 * The redirect logic is implemented in login.component.ts ngOnInit.
 * Manual testing or a different approach (mock server) would be needed for full coverage.
 */
test.describe('Login Redirect for Authenticated Users', () => {
  test('should show login form when user is NOT authenticated', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });

    // Assert: Login form should be visible
    await expect(page.locator('form')).toBeVisible({ timeout: 5000 });
  });

  test('should NOT redirect when user is not authenticated', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });

    // Should stay on login page
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('should have login form with username and password fields', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });

    // Check form fields exist - using matInput attribute selector
    await expect(page.locator('input[matInput][formControlName="login"]')).toBeVisible();
    await expect(page.locator('input[matInput][formControlName="password"]')).toBeVisible();
  });
});
