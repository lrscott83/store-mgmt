// Captura de pantallas del TUTORIAL de catálogo (categorías + productos) para
// `docs/manual/manual-usuario-pos.md`.
//
// Script STANDALONE (no forma parte de la suite Playwright: vive en `scripts/`, fuera
// de `testDir: './e2e'`). Usa el navegador ya instalado y apunta al dev server local
// (`pnpm dev` en :3333 con `API_URL=http://localhost:5019/api`) más el backend
// `--launch-profile http-e2e` (base `smca_test`).
//
// A diferencia de `capture-manual.mjs`, cada captura se ANOTA: se dibuja un círculo
// ROJO sobre el control y un número de paso rojo junto a él, de modo que la marca
// queda grabada en el PNG (se ve igual en el HTML y en el PDF).
//
// Uso:
//   node scripts/capture-tutorial-catalogo.mjs
//
// Variables opcionales:
//   CAPTURE_BASE_URL  (default http://localhost:3333)
//   CAPTURE_OUT       (default ../docs/manual/img)

import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3333';
const OUT_DIR =
  process.env.CAPTURE_OUT ?? resolve(process.cwd(), '..', 'docs', 'manual', 'img');

const MOBILE = devices['iPhone 13'];

const STORE = {
  login: `e2e-tutorial-${Math.random().toString(36).slice(2, 8)}`,
  password: 'Ejemplo1234',
  fullName: 'María Pérez',
  cellPhone: '5355501234',
  storeName: 'Bodega La Esquina',
};

const CATEGORY = { name: 'Alimentos', order: '1' };
const PRODUCT = {
  name: 'Arroz Bolsa 1 kg',
  cost: '800',
  price: '900',
  quantity: '40',
};

async function waitForServer(url, timeoutMs = 180_000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      // Server not up yet — keep waiting.
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`El dev server nunca respondió en ${url} (timeout ${timeoutMs} ms).`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
}

async function mustSee(page, locator, what, timeoutMs = 20_000) {
  try {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  } catch {
    throw new Error(`No apareció ${what} en ${timeoutMs} ms (URL: ${page.url()}).`);
  }
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(400);
}

/** Oculta los elementos `fixed`/`sticky` (botones flotantes) que ensucian una captura. */
async function hideFixedElements(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const position = getComputedStyle(el).position;
      if (position === 'fixed' || position === 'sticky') {
        el.style.setProperty('visibility', 'hidden', 'important');
        el.setAttribute('data-tut-hidden', '1');
      }
    }
  });
}

/**
 * Devuelve la visibilidad a los elementos ocultos por `hideFixedElements`. Sin esto, la
 * barra lateral (que es `fixed`) queda invisible para siempre y el menú nunca se puede
 * capturar.
 */
async function showFixedElements(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-tut-hidden]')) {
      el.style.removeProperty('visibility');
      el.removeAttribute('data-tut-hidden');
    }
  });
}

/** Oculta el botón flotante PWA "Instalar app" (z-[9999]), que tapa los modales. */
async function hideInstallButton(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('button[aria-label="Instalar app"]')) {
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  });
}

/**
 * Dibuja las marcas rojas del tutorial sobre la página (quedan en el PNG).
 *
 * Cada marca: `{ selector, step, shape: 'circle' | 'rect', pad }`.
 * - Se dibuja un borde rojo grueso alrededor del control (círculo por defecto).
 * - El número de paso va en un badge rojo con borde blanco, en la esquina superior derecha
 *   del círculo.
 * - Las marcas cuyo control no está COMPLETAMENTE dentro del viewport se omiten y se
 *   reportan por consola: la imagen no debe enseñar un círculo cortado.
 */
async function drawMarks(page, marks) {
  const result = await page.evaluate((marks) => {
    document.getElementById('__tutorial_marks')?.remove();
    const layer = document.createElement('div');
    layer.id = '__tutorial_marks';
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
    document.body.appendChild(layer);

    const skipped = [];
    for (const mark of marks) {
      let el = mark.selector ? document.querySelector(mark.selector) : null;
      if (!el && mark.text) {
        el = Array.from(document.querySelectorAll('span, p, div')).find(
          (candidate) =>
            candidate.children.length === 0 && candidate.textContent?.trim() === mark.text,
        ) ?? null;
      }
      if (!el) {
        skipped.push(`${mark.step}: no existe ${mark.selector ?? mark.text}`);
        continue;
      }
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) {
        skipped.push(`${mark.step}: sin caja ${mark.selector}`);
        continue;
      }
      const fullyVisible =
        r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
      if (!fullyVisible) {
        skipped.push(
          `${mark.step}: fuera de vista ${mark.selector} ` +
            `(top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)}, alto ${window.innerHeight})`,
        );
        continue;
      }

      const pad = mark.pad ?? 6;
      const w = r.width + pad * 2;
      const h = r.height + pad * 2;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      const ring = document.createElement('div');
      Object.assign(ring.style, {
        position: 'fixed',
        left: `${cx - w / 2}px`,
        top: `${cy - h / 2}px`,
        width: `${w}px`,
        height: `${h}px`,
        boxSizing: 'border-box',
        border: '3px solid #e11d48',
        borderRadius: (mark.shape ?? 'circle') === 'rect' ? '10px' : '9999px',
        boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
      });
      layer.appendChild(ring);

      if (mark.step != null) {
        const badge = document.createElement('div');
        badge.textContent = String(mark.step);
        const badgePos = mark.badge ?? 'corner';
        Object.assign(badge.style, {
          position: 'fixed',
          // `corner`: esquina superior derecha del círculo (no tapa la etiqueta, que vive
          // arriba a la izquierda). `top`: centrado encima, para controles pequeños como las
          // casillas de verificación, donde la esquina caería sobre el propio control.
          left: `${badgePos === 'top' ? cx - 13 : cx + w / 2 - 26}px`,
          top: `${badgePos === 'top' ? cy - h / 2 - 29 : cy - h / 2 - 13}px`,
          minWidth: '26px',
          height: '26px',
          padding: '0 5px',
          boxSizing: 'border-box',
          borderRadius: '9999px',
          background: '#dc2626',
          color: '#ffffff',
          font: '700 15px/26px system-ui, -apple-system, Segoe UI, Arial, sans-serif',
          textAlign: 'center',
          boxShadow: '0 0 0 2px #ffffff',
        });
        layer.appendChild(badge);
      }
    }
    return skipped;
  }, marks);

  for (const line of result) console.log(`  AVISO marca omitida — ${line}`);
}

async function clearMarks(page) {
  await page.evaluate(() => document.getElementById('__tutorial_marks')?.remove());
}

/** Captura anotada de una pantalla completa (viewport). */
async function shot(page, name, marks, { keepFixed = false } = {}) {
  await settle(page);
  await showFixedElements(page);
  if (!keepFixed) await hideFixedElements(page);
  await hideInstallButton(page);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  await drawMarks(page, marks);
  const file = resolve(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  await clearMarks(page);
  console.log(`guardada ${file}`);
}

/** Contenedor que scrollea dentro del modal de producto. */
function modalScroller(page) {
  return page
    .locator('div.fixed.inset-0')
    .filter({ has: page.getByTestId('product-name-input') })
    .first();
}

/** Captura el modal de producto en `parts` tramos: arriba, medio y fondo. */
async function shotProductModal(page, parts) {
  const scroller = modalScroller(page);
  await mustSee(page, scroller, 'el modal de producto');

  const geometry = await scroller.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  console.log(
    `modal producto: ${geometry.scrollHeight} px de contenido en ${geometry.clientHeight} px de ventana`,
  );

  const tops = parts.map((_, index) =>
    index === 0
      ? 0
      : index === parts.length - 1
        ? Math.max(0, geometry.scrollHeight - geometry.clientHeight)
        : index * geometry.clientHeight,
  );

  for (const [index, part] of parts.entries()) {
    await scroller.evaluate((el, top) => {
      el.scrollTop = top;
    }, tops[index]);
    await page.waitForTimeout(400);
    await shot(page, part.name, part.marks, { keepFixed: true });
  }
}

async function main() {
  console.log(`Esperando el dev server en ${BASE} ...`);
  await waitForServer(BASE);
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...MOBILE });
  const page = await ctx.newPage();

  // ── Registro de un Owner de ejemplo (login `e2e-` para que la suite lo limpie) ──
  await goto(page, '/register');
  await page.locator('#acceptTerms').waitFor({ state: 'visible', timeout: 30_000 });
  await page.fill('#fullName', STORE.fullName);
  await page.fill('#storeName', STORE.storeName);
  await page.fill('#login', STORE.login);
  await page.fill('#password', STORE.password);
  await page.fill('#passwordConfirmation', STORE.password);
  await page.fill('#cellPhone', STORE.cellPhone);
  await page.check('#acceptTerms');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  // El alta + auto-login ocurren en el servidor, pero la navegación SPA de vuelta al home
  // puede quedarse en el overlay "Cargando..." en dev. La sesión YA quedó abierta, así que
  // se entra al catálogo por navegación directa (mismo destino que el manual).
  await page.waitForTimeout(4_000);
  console.log(`Owner de ejemplo listo: ${STORE.login} / ${STORE.storeName}`);

  // ── Paso 1: abrir el menú lateral ────────────────────────────────────────
  await goto(page, '/sales/products');
  await mustSee(page, page.getByTestId('add-category-button'), 'el catálogo de productos');
  await shot(page, '46-tutorial-01-abrir-menu', [
    { selector: 'button[aria-label="Alternar barra lateral"]', step: 1, pad: 8 },
  ]);

  // ── Paso 2: Ventas → Catálogo Productos ──────────────────────────────────
  await showFixedElements(page);
  await page.getByRole('button', { name: 'Alternar barra lateral' }).first().click();
  await mustSee(
    page,
    page.locator('nav[aria-label="Navegación principal"] a[href="/sales/products"]'),
    'la opción Catálogo Productos del menú',
  );
  await shot(
    page,
    '47-tutorial-02-catalogo-productos',
    [{ selector: 'nav[aria-label="Navegación principal"] a[href="/sales/products"]', step: 2, pad: 6 }],
    { keepFixed: true },
  );
  await page.locator('nav[aria-label="Navegación principal"] a[href="/sales/products"]').click();
  await mustSee(page, page.getByTestId('add-category-button'), 'la pantalla Productos');

  // ── Paso 3: botón Categoría (estado vacío del catálogo) ─────────────────
  await shot(page, '48-tutorial-03-boton-categoria', [
    { selector: '[data-testid="add-category-button"]', step: 3, pad: 8 },
  ]);

  // ── Pasos 4-6: modal Crear categoría y sus campos ───────────────────────
  await page.getByTestId('add-category-button').click();
  await mustSee(page, page.getByTestId('category-name-input'), 'el modal Crear categoría');
  await page.getByTestId('category-name-input').fill(CATEGORY.name);
  await page.getByTestId('category-order-input').fill(CATEGORY.order);
  const categoryMarks = [
    { selector: '[data-testid="category-name-input"]', step: 4, shape: 'rect' },
    { selector: '[data-testid="category-order-input"]', step: 5, shape: 'rect' },
    { selector: '[data-testid="category-active-checkbox"]', step: 6, pad: 8, badge: 'top' },
    { selector: '[data-testid="category-save-button"]', step: 7, pad: 8 },
  ];
  await shot(page, '49-tutorial-04-modal-categoria', categoryMarks, { keepFixed: true });

  // ── Paso 7: guardar la categoría ───────────────────────────────────────
  await page.getByTestId('category-save-button').click();
  await page.getByTestId('category-name-input').waitFor({ state: 'hidden', timeout: 20_000 });
  await settle(page);
  const categoryRow = page.locator('[data-testid^="category-panel-toggle-"]').first();
  await mustSee(page, categoryRow, 'la categoría recién creada');

  // ── Paso 8: engranaje de la categoría ──────────────────────────────────
  const toggleTestId = await categoryRow.getAttribute('data-testid');
  const categoryId = (toggleTestId ?? '').replace('category-panel-toggle-', '');
  await shot(page, '50-tutorial-05-categoria-creada', [
    { selector: `[data-testid="category-actions-toggle-${categoryId}"]`, step: 8, pad: 8 },
  ]);

  // ── Pasos 9-11: menú contextual de la categoría ─────────────────────────
  await page.getByTestId(`category-actions-toggle-${categoryId}`).click();
  await mustSee(page, page.getByRole('menu'), 'el menú de opciones de la categoría');
  await shot(
    page,
    '51-tutorial-06-menu-categoria',
    [
      { selector: '[data-testid="edit-category-button"]', step: 9, shape: 'rect', pad: 3 },
      { selector: '[data-testid="add-products-button"]', step: 10, shape: 'rect', pad: 3 },
      { selector: '[data-testid="add-product-button"]', step: 11, shape: 'rect', pad: 3 },
    ],
    { keepFixed: true },
  );

  // ── Pasos 12-25: modal Producto ────────────────────────────────────────
  await page.getByTestId('add-product-button').click();
  await mustSee(page, page.getByTestId('product-name-input'), 'el modal Producto');
  await page.getByTestId('product-name-input').fill(PRODUCT.name);
  await page.getByTestId('product-cost-input').fill(PRODUCT.cost);
  await page.getByTestId('product-price-input').fill(PRODUCT.price);
  await page.getByTestId('product-quantity-input').fill(PRODUCT.quantity);

  await shotProductModal(page, [
    {
      name: '52-tutorial-07-modal-producto-1',
      marks: [
        { selector: '[data-testid="product-name-input"]', step: 12, shape: 'rect' },
        { selector: '[data-testid="product-cost-input"]', step: 13, shape: 'rect' },
        { selector: '[data-testid="product-price-input"]', step: 14, shape: 'rect' },
        { selector: '[data-testid="product-cost-currency-select"]', step: 15, shape: 'rect' },
        { selector: '[data-testid="product-currency-select"]', step: 16, shape: 'rect' },
        { selector: '[data-testid="product-quantity-input"]', step: 17, shape: 'rect' },
        { selector: '[data-testid="product-barcode-input"]', step: 18, shape: 'rect' },
        { selector: '[data-testid="product-order-input"]', step: 19, shape: 'rect' },
        { selector: '[data-testid="wholesale-toggle"]', step: 20, pad: 8, badge: 'top' },
      ],
    },
    {
      name: '53-tutorial-08-modal-producto-2',
      marks: [
        { selector: '[data-testid="product-active-checkbox"]', step: 21, pad: 8, badge: 'top' },
        { selector: '[data-testid="product-available-checkbox"]', step: 22, pad: 8, badge: 'top' },
        { selector: '[data-testid="product-discount-checkbox"]', step: 23, pad: 8, badge: 'top' },
        { selector: '[data-testid="create-product-submit"]', step: 24, pad: 8 },
      ],
    },
  ]);

  // ── Paso 24: guardar el producto ───────────────────────────────────────
  await page.getByTestId('create-product-submit').click();
  await page.getByTestId('product-name-input').waitFor({ state: 'hidden', timeout: 20_000 });
  await settle(page);

  // ── Paso 25: el producto dentro de la categoría ────────────────────────
  await page.locator('[data-testid^="category-panel-toggle-"]').first().click();
  const productRow = page.locator('li').filter({ hasText: PRODUCT.name }).first();
  await mustSee(page, productRow, `el producto "${PRODUCT.name}" dentro de la categoría`);
  const productGear = productRow.locator('button[aria-label="Acciones"]').first();
  await mustSee(page, productGear, 'el engranaje del producto');
  await shot(page, '54-tutorial-09-producto-creado', [
    { text: PRODUCT.name, step: 25, shape: 'rect', pad: 4 },
  ]);

  // Diagnóstico del engranaje por producto (se documenta como paso adicional si existe).
  const hasProductGear = await productGear.count();
  console.log(`engranaje por producto presente: ${hasProductGear > 0 ? 'sí' : 'no'}`);

  await ctx.close();
  await browser.close();
  console.log(`\nListo. Imágenes del tutorial en ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
