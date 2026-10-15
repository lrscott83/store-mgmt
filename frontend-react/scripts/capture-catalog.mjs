// Captura de pantallas del CATÁLOGO PÚBLICO (lo que ve el cliente) desde el despliegue de
// playground. Script STANDALONE: vive en `scripts/`, fuera del `testDir: './e2e'` de Playwright,
// así que `pnpm test:e2e` NUNCA lo ejecuta.
//
// SOLO LECTURA remota: navega y captura; NUNCA envía un pedido (no se pulsa el submit del
// checkout). Rellenar el formulario no genera tráfico; el POST solo ocurre al enviarlo.
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

async function hidePingDots(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.animate-ping')) {
      el.style.setProperty('visibility', 'hidden', 'important');
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
  // JPEG: el catálogo público es una página con fotos; en PNG pesa ~7 MB por captura.
  const file = resolve(OUT_DIR, `${name}.jpg`);
  await page.screenshot({ path: file, fullPage, type: 'jpeg', quality: 82 });
  console.log(`guardada ${file}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...MOBILE, locale: 'es-ES' });
  const page = await context.newPage();

  console.log(`Abriendo ${CATALOG_URL} ...`);
  await page.goto(CATALOG_URL, { waitUntil: 'networkidle', timeout: 90_000 });

  await capture(page, '41-catalogo-publico');

  // ── Detalle de un producto ─────────────────────────────────────────────
  await page.locator('[data-testid^="catalog-card-"]').first().click();
  await settle(page);
  await capture(page, '42-catalogo-producto');
  await page.goBack();
  await page.goto(CATALOG_URL, { waitUntil: 'networkidle', timeout: 90_000 });
  await settle(page);
  await page
    .locator('[data-testid^="catalog-card-"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });

  // ── Añadir al carrito y abrirlo ────────────────────────────────────────
  const addButton = page.locator('[data-testid^="catalog-add-"]').first();
  await addButton.waitFor({ state: 'visible', timeout: 30_000 });
  await addButton.click();
  await page.waitForTimeout(900);

  const dumpTestIds = async (label) => {
    const ids = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid]')).map((el) =>
        el.getAttribute('data-testid'),
      ),
    );
    console.log(`=== data-testid ${label} ===`);
    console.log(ids.filter((id) => /cart|checkout|badge|buy|order/i.test(id)).join('\n') || '(sin coincidencias)');
  };
  await dumpTestIds('tras añadir al carrito');

  const cartTrigger = page
    .locator(
      '[data-testid="catalog-cart"], [data-testid="catalog-cart-badge"], [data-testid="catalog-cart-button"], [data-testid="catalog-cart-open"]',
    )
    .first();
  if (await cartTrigger.count()) {
    await cartTrigger.click();
    await settle(page);
    await capture(page, '43-catalogo-carrito', { fullPage: false });

    const checkoutButton = page
      .locator('[data-testid="catalog-cart-checkout"], [data-testid^="catalog-checkout"]')
      .first();
    if (await checkoutButton.count()) {
      await checkoutButton.click();
      await settle(page);
      // Rellenar el checkout SIN enviarlo (no se crea ningún pedido real).
      const fill = async (testid, value) => {
        const field = page.getByTestId(testid);
        if (await field.count()) await field.fill(value);
      };
      await fill('checkout-name', 'Cliente de ejemplo');
      await fill('checkout-phone', '5355501234');
      const pickup = page.getByTestId('checkout-pickup');
      if (await pickup.count()) await pickup.click();
      await capture(page, '44-catalogo-checkout', { fullPage: false });
    }
  }

  await dumpTestIds('final');

  // Sonda: qué elementos interactivos hay (para planear las siguientes capturas).
  const probe = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[data-testid]')) {
      out.push(el.getAttribute('data-testid'));
    }
    // Primeros textos de producto visibles.
    const texts = Array.from(document.querySelectorAll('h2,h3,p,span'))
      .map((e) => (e.textContent ?? '').trim())
      .filter((t) => t.length > 2 && t.length < 60)
      .slice(0, 40);
    return { testids: out, texts };
  });
  console.log('=== data-testid en la página ===');
  console.log(probe.testids.join('\n'));
  console.log('=== textos ===');
  console.log(probe.texts.join('\n'));

  await context.close();
  await browser.close();
  console.log('\nListo.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
