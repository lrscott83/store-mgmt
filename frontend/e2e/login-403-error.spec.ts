import { test, expect } from '@playwright/test';

/**
 * E2E Test for 403 Error Handling on Login Page
 *
 * BUG DESCRIPTION:
 * When any API returns 403, ErrorInterceptor calls authService.logout()
 * which shows a "Session expired" popup and redirects to login.
 *
 * EXPECTED: 403 from usage tracker should be silently ignored (no popup)
 *
 * This test demonstrates the bug by:
 * 1. Setting up an authenticated user in localStorage
 * 2. Having the app make API calls that return 403
 * 3. Checking that the error popup appears (demonstrating the bug)
 */

test.describe('Login Page 403 Error Handling', () => {
  test('BUG: shows error popup when API returns 403 after authentication', async ({ page }) => {
    // Track console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Set up authenticated user in localStorage
    await page.addInitScript(() => {
      const expiresIn = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000);

      localStorage.setItem('token', 'test-token-12345');

      const currentUser = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        login: 'testuser',
        fullName: 'Test User',
        email: 'test@test.com',
        cellPhone: '1234567890',
        isOwnerAdmin: true,
        isReSeller: false,
        isSuperAdmin: false,
        isActive: true,
        selectedStoreId: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
        featureIds: [20, 21, 22],
        storeModuleIds: [2, 3, 4],
        authToken: 'test-token-12345',
        expiresIn: expiresIn
      };
      localStorage.setItem('currentUser', JSON.stringify(currentUser));

      const authData = {
        authToken: 'test-token-12345',
        expiresIn: expiresIn.toISOString()
      };
      localStorage.setItem('1.0.0-authf496fc5a9f17', JSON.stringify(authData));
    });

    // Mock BOTH the app server AND the API server
    // App runs on localhost:4200, API on localhost:44320
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      // Log ALL requests
      console.log(`${method}: ${url}`);

      // Handle API requests to the backend
      if (url.includes('localhost:44320/api/')) {
        // Allow auth endpoint to succeed
        if (url.includes('/auth/')) {
          console.log('  -> MOCKING 200');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              succeeded: true,
              data: {
                id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                login: 'testuser',
                selectedStoreId: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
                isOwnerAdmin: true,
                roles: ['OwnerAdmin'],
                stores: [{ id: 'b2c3d4e5-f6a7-8901-bcde-f23456789012', name: 'Test Store' }]
              }
            })
          });
          return;
        }

        // All other API calls return 403 - this triggers the bug!
        console.log('  -> MOCKING 403');
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ succeeded: false, errors: [{ description: 'Forbidden' }] })
        });
        return;
      }

      // Allow everything else (HTML, JS, CSS from dev server)
      await route.continue();
    });

    // Navigate to a protected route that WILL make API calls
    await page.goto('/sales/products');
    await page.waitForTimeout(3000);

    // Check URL - should redirect to /login due to logout
    console.log('Current URL:', page.url());

    // Check for Swal popup (error dialog)
    const swalPopup = page.locator('.swal2-popup');
    const popupVisible = await swalPopup.isVisible().catch(() => false);

    console.log('Swal popup visible:', popupVisible);
    await page.screenshot({ path: 'e2e/screenshots/403-bug-demo.png' });

    // The bug is demonstrated if popup is visible OR if we're redirected to login
    // CURRENT BUG: This shows popup or redirects (test passes when bug exists)
    // AFTER FIX: Should NOT show popup (test should fail until fix applied)
    const currentUrl = page.url();
    const redirectedToLogin = currentUrl.includes('/login');

    console.log('Errors captured:', errors);
    console.log('Redirected to login:', redirectedToLogin);

    // This test PASSES when the bug exists (popup shown or redirect happens)
    // After the fix, this test should FAIL (no popup, no redirect)
    expect(popupVisible || redirectedToLogin).toBe(true);
  });
});
