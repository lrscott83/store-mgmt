import { expect, test } from '@playwright/test';

// CÓMO CORRER (desde frontend-react/):
//   pnpm exec playwright test          → smoke completo + reporte HTML
//   pnpm exec playwright test --ui     → modo interactivo (UI)
//   pnpm exec playwright show-report   → ver el reporte HTML generado
//
// ESTOS SON TESTS DE HUMO DE LA INFRAESTRUCTURA (navegador + dev server + Playwright).
// Los tests de features (login, store, import, ...) vienen después.

test.describe('infra smoke', () => {
  test('/login renderiza el formulario', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
  });

  test('/ responde y renderiza contenido raíz', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(500);

    await expect(page.locator('section#hero')).toBeVisible();
    await expect(page.locator('body')).toBeVisible();
  });
});
