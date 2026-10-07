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
 *   4. El listado vive en paneles colapsables por categoría (cerrados por defecto): expandir el
 *      panel monta el editor. Con los campos de actualización COMENTADOS (decisión del owner,
 *      2026-09-29) el editor solo permite tocar la imagen — UNA sola por producto: la galería
 *      multi-imagen quedó comentada y subir una REEMPLAZA la principal. La imagen se retiene al
 *      elegirla y SOLO se sube al pulsar Guardar.
 *   5. Sincronizar de nuevo publica el resultado (editar no republica por sí solo).
 *   6. La URL se abre en un contexto NUEVO y ANÓNIMO (sin sesión): el catálogo es público, el
 *      precio se muestra con el CÓDIGO de moneda (`100 CUP`, nunca `$`), sin badge "Nuevo" ni
 *      descuento, y al abrir el detalle hay una sola imagen servida desde la API pública.
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

  test('crear el producto en el POS, sincronizar, ponerle imagen y verlo publicado en /catalog/<slug>', async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const categoryName = `Ropa ${suffix}`;
    const productName = `Camisa ${suffix}`;

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

    // Sincronizar sube el catálogo local y lo publica: aparecen la URL pública y el panel.
    await page.getByTestId('catalog-sync-button').click();
    await expect(
      page.getByText(/^Catálogo sincronizado: 1 categorías nuevas, 0 actualizadas, 1 productos nuevos/),
    ).toBeVisible();

    const publicLink = page.getByTestId('catalog-public-url');
    await expect(publicLink).toBeVisible();
    const publicUrl = await publicLink.getAttribute('href');
    expect(publicUrl).toMatch(/\/catalog\/[a-z0-9-]+$/);
    await expect(page.getByTestId('catalog-last-sync')).not.toHaveText(/Nunca/);

    // 4. El producto vive en un panel colapsable por categoría (cerrado por defecto): solo al
    //    expandirlo se monta el editor. La tienda es nueva: hay exactamente un panel.
    const categoryToggle = page.locator('[data-testid^="catalog-category-toggle-"]').first();
    await expect(categoryToggle).toContainText(categoryName);
    await categoryToggle.click();
    await expect(page.getByText(productName, { exact: true })).toBeVisible();
    // Precio con el CÓDIGO de moneda (MultiMonedas): `100 CUP`, nunca `$100`.
    await expect(page.getByText(/100\s*CUP/)).toBeVisible();
    await expect(page.getByText(/\$\s*\d/)).toHaveCount(0);

    // Sin los campos de actualización (comentados), el editor solo permite tocar la imagen:
    // UNA sola por producto. Se retiene al elegirla (anuncio "quedará como imagen principal")
    // y SOLO se sube al pulsar Guardar.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'principal.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });
    await expect(page.locator('[data-testid^="catalog-pending-image-"]')).toBeVisible();
    // Retenida, no subida: todavía no hay ninguna <img> del producto.
    await expect(page.locator(`img[alt="${productName}"]`)).toHaveCount(0);

    // El guardado es por lotes (decisión del owner, 2026-10-01): no hay un "Guardar" por
    // producto, hay UN "Guardar cambios" al final de la página, y su aviso de éxito es el
    // del lote ("Se guardó 1 producto en el catálogo"), no el antiguo aviso por producto
    // ("Producto guardado en el catálogo"), que ya no emite ninguna rama del código.
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Se guardó 1 producto en el catálogo')).toBeVisible();
    // Tras el guardado la imagen es la principal y la ÚNICA (la galería está comentada).
    const editorImage = page.locator(`img[alt="${productName}"]`);
    await expect(editorImage).toHaveCount(1);
    await expect(editorImage).toHaveAttribute('src', /\/api\/v1\/public\/catalog\//);

    // 5. Publicar el resultado: editar no republica por sí solo (el catálogo local no cambió:
    //    0 categorías y 0 productos nuevas; el número de actualizadas lo decide el backend).
    await page.getByTestId('catalog-sync-button').click();
    await expect(
      page.getByText(/^Catálogo sincronizado: 0 categorías nuevas, \d+ actualizadas, 0 productos nuevos/),
    ).toBeVisible();

    // 6. El catálogo público, en un contexto SIN sesión.
    const anonymousContext = await browser.newContext();
    const anonymous = await anonymousContext.newPage();
    try {
      await anonymous.goto(publicUrl!);

      await expect(anonymous.getByTestId('catalog-store-name')).toBeVisible();
      await expect(anonymous.getByText(productName, { exact: true })).toBeVisible();
      // Sin campos de actualización no hay "Nuevo" ni badge de descuento, y el precio lleva
      // el código de moneda: `100 CUP`, nunca el símbolo `$`.
      await expect(anonymous.getByText('Nuevo')).toHaveCount(0);
      await expect(anonymous.getByText(/-\d+(\.\d+)?%/)).toHaveCount(0);
      await expect(anonymous.getByText(/100\s*CUP/)).toBeVisible();
      await expect(anonymous.getByText('$100')).toHaveCount(0);
      await expect(anonymous.getByTestId('catalog-results-count')).toHaveText('1 producto');

      // Detalle: con UNA sola imagen la galería de miniaturas no se renderiza.
      await anonymous.getByText(productName, { exact: true }).click();
      const dialog = anonymous.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('catalog-detail-thumb-0')).toHaveCount(0);
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
