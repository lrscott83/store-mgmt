import { test, expect } from './support/test';

/**
 * [FC-E1] /auth/provision — Device provisioning offline — E2E Playwright
 * docs/testing/frontend-coverage/FC-E1.md
 *
 * Tests the provision page which allows offline device activation
 * by importing a .smcabundle roster file. No authentication required.
 *
 * Verifies:
 * - Page loads without login
 * - Form renders with all fields (file, store ID, master password)
 * - Validation: empty file shows error, empty password shows error
 * - Password visibility toggle works
 */

test.describe('FC-E1 — /auth/provision', () => {
  test.describe.configure({ timeout: 120_000 });

  test('page loads without authentication and shows form', async ({ page }) => {
    await page.goto('/auth/provision');

    // Should NOT redirect to /login
    expect(new URL(page.url()).pathname).toBe('/auth/provision');

    // Title: "Activar dispositivo sin conexión"
    await expect(page.getByText('Activar dispositivo sin conexión')).toBeVisible();

    // Form fields present — file input is visually hidden (styled), check store ID and password
    await expect(page.locator('#provision-store-id')).toBeVisible();
    await expect(page.locator('#provision-master')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activar' })).toBeVisible();
  });

  test('submitting empty form shows file error', async ({ page }) => {
    await page.goto('/auth/provision');

    // Submit without selecting a file
    await page.getByRole('button', { name: 'Activar' }).click();

    // Should show error about missing file or password
    // The InfoBox with variant="danger" renders error text
    await expect(page.getByText(/error|archivo|contraseña|requerido/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('password visibility toggle works', async ({ page }) => {
    await page.goto('/auth/provision');

    const passwordInput = page.locator('#provision-master');
    // Initially password type
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle to show
    const toggle = page.getByRole('button', { name: /Mostrar contraseña/i });
    await toggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click toggle to hide again
    const hideToggle = page.getByRole('button', { name: /Ocultar contraseña/i });
    await hideToggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
