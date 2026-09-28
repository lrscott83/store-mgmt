import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { mintWebCatalogOwner } from './support/web-catalog-fixture';

/**
 * Catálogo Web (módulo 18, plan 2026-09-27).
 *
 * Un solo test, como `store-plan-activation.spec.ts`: el mint cuesta 2 registros y 3 logins y su
 * identidad es privada — partirlo en dos re-mintaría y gastaría el presupuesto de login en el
 * setup.
 *
 * El catálogo se publica desde el catálogo LOCAL del POS (decisión D11): el POS es offline-first y
 * el servidor no conoce los productos de la tienda, así que el owner los crea por la UI real de
 * Catálogo Productos y "Sincronizar Catálogo" es quien sube esa copia. Ese es el recorrido de una
 * tienda de verdad, y el spec lo hace en ese orden:
 *
 *   1. Mint: owner privado + tienda en Superior (módulo 18).
 *   2. Catálogo Productos (offline): crear una categoría y un producto.
 *   3. `/sales/web-catalog`: al principio NO hay nada publicado ni listado (el servidor aún no
 *      conoce el catálogo). Sincronizar lo sube y lo publica.
 *   4. Ya con el producto listado se completan los campos que solo existen en el catálogo:
 *      descripción en TEXTO PLANO (D9), % de descuento, precio rebajado, "Nuevo" y dos imágenes.
 *   5. Sincronizar de nuevo publica esos campos (editar no republica por sí solo).
 *   6. La URL se abre en un contexto NUEVO y ANÓNIMO (sin sesión): el catálogo es público y muestra
 *      el precio final combinado (% y luego monto, D7), los badges y, al abrir el detalle, la
 *      descripción con sus saltos de línea y la galería.
 */

// i18n literal strings from es.ts — hardcoded, never imported (design.md §5)
const PRODUCTS_HEADER = 'Productos'; // PRODUCT.PRODUCTS

/** Crea una categoría por la UI del catálogo offline (indexedDB del dispositivo). */
async function createCategoryInPos(page: Page, name: string): Promise<void> {
  await page.goto('/sales/products');
  await expect(page.getByText(PRODUCTS_HEADER, { exact: true })).toBeVisible();

  await page.getByTestId('add-category-button').click();
  await expect(page.getByTestId('category-name-input')).toBeVisible();
  await page.getByTestId('category-name-input').fill(name);
  await page.getByTestId('category-save-button').click();
  await expect(page.getByTestId('category-name-input')).toHaveCount(0);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

/**
 * Añade un producto a la primera categoría de la tienda por la UI offline. La tienda del mint
 * nace vacía, así que la única categoría es la que se acaba de crear.
 */
async function createProductInPos(
  page: Page,
  productName: string,
  price: string,
): Promise<void> {
  const gearToggle = page.locator('[data-testid^="category-actions-toggle-"]').first();
  await expect(gearToggle).toBeVisible();
  await gearToggle.click();

  await page.getByTestId('add-product-button').click();
  await expect(page.getByTestId('product-name-input')).toBeVisible();
  await page.getByTestId('product-name-input').fill(productName);
  await page.getByTestId('product-price-input').fill(price);
  await page.getByTestId('create-product-submit').click();
  await expect(page.getByTestId('product-name-input')).toHaveCount(0);
}

test.describe.serial('Catálogo Web (módulo 18) — publicar el catálogo local y verlo en público', () => {
  test.describe.configure({ timeout: 180_000 });

  /** JPEG mínimo válido (firma + EOI): el backend valida firma/extensión y tamaño. */
  const TINY_JPEG = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9,
  ]);

  test('crear el producto en el POS, sincronizar, editarlo y verlo publicado en /catalog/<slug>', async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const categoryName = `Ropa ${suffix}`;
    const productName = `Camisa ${suffix}`;
    const description = `Camisa de algodón ${suffix}\nSegunda línea con <b>etiquetas</b>`;

    // 1. Owner privado en Superior (módulo 18) + 2. su catálogo local, por la UI del POS.
    await mintWebCatalogOwner(page, browser);
    await createCategoryInPos(page, categoryName);
    await createProductInPos(page, productName, '100');

    // 3. La vista arranca sin nada publicado: el servidor todavía no conoce el catálogo local.
    await page.goto('/sales/web-catalog');
    await expect(
      page.getByText('El catálogo aún no está publicado. Pulsa Sincronizar Catálogo.'),
    ).toBeVisible();
    await expect(page.getByTestId('catalog-public-url')).toHaveCount(0);
    await expect(
      page.getByText(
        'Esta tienda aún no tiene catálogo aquí. Pulsa Sincronizar Catálogo para subir los productos y categorías que ya tienes en el dispositivo; si la tienda está vacía, créalos antes en Catálogo Productos.',
      ),
    ).toBeVisible();

    // Sincronizar sube el catálogo local y lo publica: aparecen la URL pública y el producto.
    await page.getByTestId('catalog-sync-button').click();
    await expect(
      page.getByText(/^Catálogo sincronizado: 1 categorías nuevas, 0 actualizadas, 1 productos nuevos/),
    ).toBeVisible();

    const publicLink = page.getByTestId('catalog-public-url');
    await expect(publicLink).toBeVisible();
    const publicUrl = await publicLink.getAttribute('href');
    expect(publicUrl).toMatch(/\/catalog\/[a-z0-9-]+$/);
    await expect(page.getByTestId('catalog-last-sync')).not.toHaveText(/Nunca/);
    await expect(page.getByText(productName, { exact: true })).toBeVisible();

    // 4. Campos que solo existen en el catálogo: descripción en texto plano, descuentos y Nuevo.
    await page.locator('textarea').first().fill(description);
    const numberInputs = page.locator('input[inputmode="decimal"]');
    await numberInputs.nth(0).fill('12.5');
    await numberInputs.nth(1).fill('5');
    await page.getByRole('switch', { name: 'Nuevo' }).click();

    // Precio final en vivo: 100 − 12.5 % = 87.50; 87.50 − 5.00 = 82.50 (decisión D7).
    await expect(page.getByText('Precio final: $82.50')).toBeVisible();

    // Dos imágenes: la primera queda como principal, la segunda completa la galería.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'principal.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });
    // Principal + su miniatura de galería.
    await expect(page.locator('img[alt="' + productName + '"]')).toHaveCount(2);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'galeria.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });
    // La segunda solo engrosa la galería (la principal ya existía).
    await expect(page.locator('img[alt="' + productName + '"]')).toHaveCount(3);

    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Producto guardado en el catálogo')).toBeVisible();

    // 5. Publicar los campos editados: editar no republica por sí solo (solo hay un producto).
    await page.getByTestId('catalog-sync-button').click();
    await expect(
      page.getByText(/^Catálogo sincronizado: 0 categorías nuevas, 1 actualizadas, 0 productos nuevos/),
    ).toBeVisible();

    // 6. El catálogo público, en un contexto SIN sesión.
    const anonymousContext = await browser.newContext();
    const anonymous = await anonymousContext.newPage();
    try {
      await anonymous.goto(publicUrl!);

      await expect(anonymous.getByTestId('catalog-store-name')).toBeVisible();
      await expect(anonymous.getByText(productName, { exact: true })).toBeVisible();
      await expect(anonymous.getByText('Nuevo')).toBeVisible();
      await expect(anonymous.getByText('-12.5%')).toBeVisible();
      await expect(anonymous.getByText('$82.50')).toBeVisible();
      await expect(anonymous.getByText('$100')).toBeVisible();
      await expect(anonymous.getByTestId('catalog-results-count')).toHaveText('1 producto');

      // Detalle: descripción en texto plano (los saltos se respetan, el HTML no se interpreta).
      await anonymous.getByText(productName, { exact: true }).click();
      const dialog = anonymous.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const detailDescription = dialog.getByTestId('catalog-detail-description');
      await expect(detailDescription).toContainText(`Camisa de algodón ${suffix}`);
      await expect(detailDescription).toContainText('Segunda línea con <b>etiquetas</b>');
      await expect(detailDescription).not.toContainText('Camisa de algodón  <b>');

      // Galería: dos miniaturas, y la imagen se sirve desde la API pública.
      await expect(dialog.getByTestId('catalog-detail-thumb-0')).toBeVisible();
      await expect(dialog.getByTestId('catalog-detail-thumb-1')).toBeVisible();
      const detailImage = dialog.getByTestId('catalog-detail-image');
      await expect(detailImage).toBeVisible();
      const mediaUrl = await detailImage.getAttribute('src');
      expect(mediaUrl).toContain('/api/v1/public/catalog/');
      const media = await anonymous.request.get(mediaUrl!);
      expect(media.status()).toBe(200);
      expect(media.headers()['content-type']).toContain('image/');

      // Ampliación al pulsar la imagen (toggle de zoom).
      await dialog.getByTestId('catalog-detail-image-toggle').click();
      await dialog.getByTestId('catalog-detail-image-toggle').click();
      await expect(detailImage).toBeVisible();

      await dialog.getByRole('button', { name: 'Cerrar' }).first().click();
      await expect(dialog).toHaveCount(0);

      // Búsqueda sin coincidencias: el vacío se explica, no se deja la pantalla en blanco.
      await anonymous.getByTestId('catalog-search-input').fill(`no-existe-${suffix}`);
      await anonymous.getByTestId('catalog-search-button').click();
      await expect(
        anonymous.getByText('No hay productos que coincidan con tu búsqueda.'),
      ).toBeVisible();
    } finally {
      await anonymousContext.close();
    }
  });
});
