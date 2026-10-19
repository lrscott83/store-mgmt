// Captura de pantallas del CATÁLOGO PÚBLICO (lo que ve el cliente) desde el despliegue de
// playground. Script STANDALONE: vive en `scripts/`, fuera del `testDir: './e2e'` de Playwright,
// así que `pnpm test:e2e` NUNCA lo ejecuta.
//
// Recorrido (decisión del owner, 2026-10-15): la PÁGINA INICIAL → las PÁGINAS DE DETALLE de dos
// productos distintos → un pedido con DOS productos en el carrito, con el carrito y el checkout
// enteros (todos sus pasos) y los campos rellenos con valores REALISTAS de cliente.
//
// SOLO LECTURA remota: navega y captura; NUNCA envía un pedido (no se pulsa `checkout-submit`).
// Rellenar el formulario no genera tráfico; el POST solo ocurre al enviarlo, y ese botón no se
// toca nunca en este script.
//
// Uso:
//   node scripts/capture-catalog.mjs
//
// Variables opcionales:
//   CATALOG_URL  (default https://vdt.playground.sceiba.net/catalog/lizardo-9)
//   CAPTURE_OUT  (default ../docs/manual/img)

import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const CATALOG_URL =
  process.env.CATALOG_URL ?? 'https://vdt.playground.sceiba.net/catalog/lizardo-9';
const OUT_DIR =
  process.env.CAPTURE_OUT ?? resolve(process.cwd(), '..', 'docs', 'manual', 'img');

const MOBILE = devices['iPhone 13'];

/**
 * Datos del cliente de ejemplo del pedido. Son REALISTAS a propósito (decisión del owner,
 * 2026-10-15): "Cliente de ejemplo" y un teléfono de relleno no enseñan nada en el manual.
 */
const ORDER_CUSTOMER = {
  name: 'Yamilé Domínguez',
  phone: '5351234567',
  address: 'Calle 23 #412, entre 12 y 14, Vedado, Habana',
  notes: 'Llamar antes de entregar. Prefiero la tarde, de 4 a 6.',
};

async function hidePingDots(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.animate-ping')) {
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  });
}

/**
 * Aparta los avisos flotantes (`react-toastify`: "Añadido al carrito") y el botón flotante de
 * "Ver productos", que se dibujan ENCIMA del contenido en cuanto el cliente toca algo y
 * aparecerían a media captura.
 */
async function hideOverlays(page) {
  await page.evaluate(() => {
    const selectors = ['.Toastify__toast-container', '[data-testid="catalog-see-products"]'];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    }
  });
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
}

async function capture(page, name, { fullPage = true } = {}) {
  await settle(page);
  await hidePingDots(page);
  await hideOverlays(page);
  // JPEG: el catálogo público es una página con fotos; en PNG pesa ~7 MB por captura.
  const file = resolve(OUT_DIR, `${name}.jpg`);
  await page.screenshot({ path: file, fullPage, type: 'jpeg', quality: 82 });
  console.log(`guardada ${file}`);
}

/**
 * Captura de un MODAL (detalle de producto, carrito, checkout) por tramos.
 *
 * El cuerpo del `Modal` scrollea solo (`flex-1 overflow-y-auto`), así que una sola captura de
 * `viewport` se quedaría sin los últimos campos en cuanto el modal pasa de una pantalla — y el
 * checkout con dos productos y la dirección rellenos NO cabe. Se mide ese cuerpo y se corta en
 * un tramo por pantalla; si cabe en una, el archivo conserva el nombre sin sufijo.
 */
async function captureModal(page, name, testId) {
  await settle(page);
  await hidePingDots(page);
  await hideOverlays(page);
  const body = page.locator(`[data-testid="${testId}"] > div > .overflow-y-auto`).first();
  const geometry = await body.evaluate((el) => ({
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  }));
  const parts = Math.max(1, Math.ceil(geometry.scrollHeight / geometry.clientHeight));
  if (parts > 1) {
    console.log(`  ${name}: ${geometry.scrollHeight} px de contenido en ${parts} tramos`);
  }
  for (let part = 1; part <= parts; part += 1) {
    await body.evaluate((el, top) => {
      el.scrollTop = top;
    }, (part - 1) * geometry.clientHeight);
    await page.waitForTimeout(300);
    const file = resolve(OUT_DIR, `${parts === 1 ? name : `${name}-${part}`}.jpg`);
    await page.screenshot({ path: file, fullPage: false, type: 'jpeg', quality: 82 });
    console.log(`guardada ${file}${parts > 1 ? ` (tramo ${part}/${parts})` : ''}`);
  }
  await body.evaluate((el) => {
    el.scrollTop = 0;
  });
}

/**
 * Espera a que un elemento aparezca, con un mensaje que diga qué faltaba. Si no aparece, se
 * vuelca lo que SÍ hay en la página: el despliegue del playground cambia por debajo (una versión
 * vieja, una tienda sin productos, una red lenta) y sin ese volcado el fallo no dice nada.
 */
async function mustSee(page, locator, what, timeoutMs = 60_000) {
  try {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  } catch {
    console.error(`No apareció ${what} en ${timeoutMs} ms.`);
    console.error(`URL: ${page.url()}`);
    const ids = await page
      .locator('[data-testid]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')));
    console.error(`data-testid en la página (${ids.length}): ${ids.join(', ') || '(ninguno)'}`);
    const boxes = await page
      .locator('button[data-testid^="catalog-card-"]')
      .evaluateAll((nodes) =>
        nodes.slice(0, 4).map((node) => {
          const box = node.getBoundingClientRect();
          return `${node.getAttribute('data-testid')} ${Math.round(box.width)}x${Math.round(
            box.height,
          )} @${Math.round(box.top)} vis=${getComputedStyle(node).visibility} disp=${getComputedStyle(node).display}`;
        }),
      );
    console.error(`primeras tarjetas: ${boxes.join(' | ') || '(ninguna)'}`);
    const texts = await page
      .locator('h1, h2, p')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node.textContent ?? '').trim())
          .filter((text) => text.length > 0 && text.length < 120)
          .slice(0, 25),
      );
    console.error(`textos visibles: ${texts.join(' | ') || '(ninguno)'}`);
    throw new Error(`No apareció ${what} en ${timeoutMs} ms (URL: ${page.url()}).`);
  }
}

/**
 * Los `data-testid` de las tarjetas son `catalog-card-<idDeProducto>`; de ahí sale el id.
 *
 * El selector acota a `button[` porque con `[data-testid^="catalog-card-"]` a secas también caen
 * `catalog-card-pricing-…` y `catalog-card-price-…`, que llevan el prefijo igual y NO son
 * tarjetas: el id sale partido por la mitad (`pricing-e980…`) y el clic no abre nada.
 */
async function productIds(page, howMany) {
  const ids = await page
    .locator('button[data-testid^="catalog-card-"]')
    .evaluateAll((nodes, count) =>
      nodes
        .slice(0, count)
        .map((node) => (node.getAttribute('data-testid') ?? '').replace('catalog-card-', '')),
      howMany,
    );
  if (ids.length < howMany || ids.some((id) => !id)) {
    throw new Error(`El catálogo público no dio ${howMany} productos utilizables (ids: ${ids}).`);
  }
  return ids;
}

/**
 * Abre el detalle de un producto por su tarjeta, lo captura y lo cierra con Escape.
 *
 * No se espera a la descripción: es un `<p>` que sale VACÍO en los productos sin descripción y
 * un elemento sin alto no es "visible" para Playwright, así que esperar por él da un falso
 * negativo. El `settle` de `captureModal` (networkidle) es lo que asegura que el `GET` del
 * detalle haya vuelto.
 */
async function captureProductDetail(page, name, productId) {
  await page.getByTestId(`catalog-card-${productId}`).click();
  const dialog = page.getByTestId('catalog-detail-modal');
  await mustSee(page, dialog, `el detalle del producto ${productId}`);
  await captureModal(page, name, 'catalog-detail-modal');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...MOBILE, locale: 'es-ES' });
  const page = await context.newPage();

  console.log(`Abriendo ${CATALOG_URL} ...`);
  await page.goto(CATALOG_URL, { waitUntil: 'networkidle', timeout: 90_000 });

  // ── Página inicial del catálogo ────────────────────────────────────────
  // `button[` porque `[data-testid^="catalog-card-"]` a secas también casa con
  // `catalog-card-pricing-…` y `catalog-card-price-…`; y `.first()` porque `waitFor` es estricto
  // y sin él lanza la violación de modo estricto en vez de esperar.
  await mustSee(
    page,
    page.locator('button[data-testid^="catalog-card-"]').first(),
    'la rejilla de productos',
  );
  await capture(page, '41-catalogo-publico');

  // ── Páginas de detalle de DOS productos distintos ─────────────────────
  const [firstId, secondId] = await productIds(page, 2);
  console.log(`productos del pedido: ${firstId} y ${secondId}`);
  await captureProductDetail(page, '42-catalogo-producto-1', firstId);
  await captureProductDetail(page, '42-catalogo-producto-2', secondId);

  // ── El pedido: DOS productos al carrito ────────────────────────────────
  for (const id of [firstId, secondId]) {
    const add = page.getByTestId(`catalog-add-${id}`);
    await mustSee(page, add, `el botón de añadir del producto ${id}`);
    await add.click();
    await page.waitForTimeout(700);
  }
  const badge = await page.getByTestId('catalog-cart-badge').textContent();
  console.log(`carrito: ${(badge ?? '').trim()} producto(s)`);

  // ── El carrito con sus dos líneas ──────────────────────────────────────
  await mustSee(page, page.getByTestId('catalog-cart-button'), 'el botón del carrito');
  await page.getByTestId('catalog-cart-button').click();
  const cartDialog = page.getByTestId('catalog-cart-modal');
  await mustSee(page, cartDialog, 'el modal del carrito');
  // Una línea sube a 2 unidades para que la captura muestre también el `+`/`−` en acción y un
  // subtotal de verdad, no un producto suelto.
  await page.getByTestId(`catalog-cart-increase-${firstId}`).click();
  await mustSee(page, page.getByTestId('catalog-cart-subtotal'), 'el subtotal del carrito');
  await captureModal(page, '43-catalogo-carrito', 'catalog-cart-modal');

  // ── El checkout, con TODOS sus pasos rellenos ──────────────────────────
  await page.getByTestId('catalog-cart-checkout').click();
  await mustSee(page, page.getByTestId('catalog-checkout-modal'), 'el modal de confirmar el pedido');
  await page.getByTestId('checkout-name').fill(ORDER_CUSTOMER.name);
  await page.getByTestId('checkout-phone').fill(ORDER_CUSTOMER.phone);
  // "Envío a domicilio": con el domicilio marcado aparece el campo de DIRECCIÓN, que es un paso
  // más del formulario y por eso se elige el domicilio y no la recogida.
  await page.getByTestId('checkout-delivery').check();
  await mustSee(page, page.getByTestId('checkout-address'), 'el campo de dirección del pedido');
  await page.getByTestId('checkout-address').fill(ORDER_CUSTOMER.address);
  await page.getByTestId('checkout-notes').fill(ORDER_CUSTOMER.notes);
  await mustSee(page, page.getByTestId('checkout-subtotal'), 'el subtotal del checkout');
  await captureModal(page, '44-catalogo-checkout', 'catalog-checkout-modal');

  // NUNCA se pulsa `checkout-submit`: en el playground no se envía ningún pedido real.
  console.log('El pedido NO se envía (el playground queda intacto).');

  await context.close();
  await browser.close();
  console.log('\nListo.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});