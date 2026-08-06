import type { Page } from '@playwright/test';

/**
 * Seeds one active category + one active/sellable product on `/sales/products`,
 * navigating the real UI (REQ-15) — never `page.evaluate()` writing
 * `localStorage` by hand. Every selector below already exists in production
 * (design.md §6); none is added for this test.
 *
 * Zero API requests: `GlobalConfig.USE_ONLINE_SERVICE = false`
 * (global-config.ts:2) routes `createProductService`/`createProductCategoryService`
 * to their offline (`localStorage`) implementations — this is what lets the
 * `*-with-products` persona cost zero extra logins (design.md §2).
 *
 * Only ever called for the `owner-admin-with-products` persona (design.md §3,
 * §6) — the `[persona:...]` tag below is deliberately literal, not a
 * parameter, matching the one call site.
 */
export async function seedCategoryAndProduct(page: Page, name: string): Promise<void> {
  async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (cause) {
      const causeMessage = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `[persona:owner-admin-with-products] la siembra falló en el paso "${label}": ` +
          `${causeMessage}. Esto NO es un fallo de login: revisá /sales/products y el modal de ` +
          'categoría (products.tsx, edit-product-category-modal.tsx).'
      );
    }
  }

  await step('abrir modal de categoría', () => page.getByTestId('add-category-button').click());
  await step('completar nombre de categoría', () => page.getByTestId('category-name-input').fill(name));
  await step('guardar categoría', () => page.getByTestId('category-save-button').click());

  // The toggle's data-testid is `category-actions-toggle-{id}` — the id is
  // generated server/offline-side and unknown to the test. At this point in
  // the persona chain exactly one category exists in this fresh store, so
  // matching the prefix is unambiguous (design.md §6).
  const categoryActionsToggle = page.locator('[data-testid^="category-actions-toggle-"]');
  await step('abrir menú de la categoría', () => categoryActionsToggle.click());
  await step('abrir "Nuevo Producto"', () => page.getByTestId('add-product-button').click());

  await step('completar nombre de producto', () => page.getByTestId('product-name-input').fill(name));
  await step('completar precio de producto', () => page.getByTestId('product-price-input').fill('10'));
  await step('guardar producto', () => page.getByTestId('create-product-submit').click());
}
