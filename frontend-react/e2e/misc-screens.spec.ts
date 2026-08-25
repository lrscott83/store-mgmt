import { test, expect } from './support/test';

/**
 * [FC-E2] Tutorial + 404 — E2E Playwright
 * docs/testing/frontend-coverage/FC-E2.md
 *
 * Tests the tutorial page (public, no auth required) and the 404 catch-all
 * route which redirects unknown paths to root.
 */

test.describe('FC-E2 — /help/tutorial', () => {
  test.describe.configure({ timeout: 120_000 });

  test('page loads and shows tutorial title', async ({ page }) => {
    await page.goto('/help/tutorial');

    // Should NOT redirect to /login
    expect(new URL(page.url()).pathname).toBe('/help/tutorial');

    // Title: "Tutorial"
    await expect(page.getByText('Tutorial')).toBeVisible();
  });

  test('collapsible panel expands and shows steps', async ({ page }) => {
    await page.goto('/help/tutorial');

    // Panel starts collapsed (aria-expanded=false)
    const panelButton = page.getByRole('button', { name: /Pasos para realizar una venta/i });
    await expect(panelButton).toBeVisible();
    await expect(panelButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    await panelButton.click();
    await expect(panelButton).toHaveAttribute('aria-expanded', 'true');

    // Steps should be visible
    await expect(page.getByText('1. Adicionar un producto al catálogo.')).toBeVisible();
    await expect(page.getByText('2. Adicionar una entrada al inventario.')).toBeVisible();
    await expect(page.getByText('3. Adicionar el producto a la venta actual.')).toBeVisible();
    await expect(page.getByText('4. Registrar la venta.')).toBeVisible();
  });
});

test.describe('FC-E2 — 404 catch-all', () => {
  test.describe.configure({ timeout: 120_000 });

  test('unknown route redirects to root', async ({ page }) => {
    // Navigate to a non-existent route
    await page.goto('/this-does-not-exist-at-all');

    // Should redirect to root (the $.tsx catch-all does redirect('/'))
    await page.waitForURL('/');
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
