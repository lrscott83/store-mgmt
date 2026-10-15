// Captura de pantallas para el manual de usuario (docs/manual/manual-usuario-pos.md).
//
// Script STANDALONE: no forma parte de la suite Playwright. Vive en `scripts/`, fuera del
// `testDir: './e2e'` del config, así que `pnpm test:e2e` NUNCA lo ejecuta. Usa el navegador
// ya instalado y apunta al dev server local (levantado con `API_URL=.../api` y el backend
// `http-e2e`).
//
// Flujo: registra un Owner de ejemplo → siembra el catálogo por la UI real → captura las
// pantallas en modo MOBILE (decisión del owner, 2026-10-15).
//
// Reglas de composición:
// - Opción 2: se OCULTAN los elementos `position: fixed`/`sticky` (botones flotantes), que en
//   una captura `fullPage` se pegan a media pantalla. Una captura puede pedir `keepFixed: true`.
// - Siempre: se ocultan los halos `animate-ping` (pulsación de "sin leer"), que estáticos
//   quedan como un círculo suelto.
//
// Uso:
//   node scripts/capture-manual.mjs
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

/** Catálogo de ejemplo de la tienda del manual (decisión del owner, 2026-10-15). */
const CATALOG = [
  [
    'Alimentos',
    [
      { name: 'Arroz Bolsa 1 kg', cost: 800, price: 900, qty: 40 },
      { name: 'Azúcar Bolsa 1 kg', cost: 1150, price: 1300, qty: 30 },
    ],
  ],
  [
    'Bebidas',
    [
      { name: 'Cerveza Cristal Lata', cost: 600, price: 700, qty: 48 },
      { name: 'Refresco Cola Pomo', cost: 1100, price: 1200, qty: 12 },
    ],
  ],
  [
    'Pizzas',
    [
      { name: 'Pizza con Queso', cost: 275, price: 350, qty: 100 },
      { name: 'Pizza con Jamón', cost: 450, price: 500, qty: 50 },
    ],
  ],
  [
    'Confituras',
    [
      { name: 'Galletas Dulces Coco', cost: 700, price: 800, qty: 20 },
      { name: 'Sorbetos Chocolate', cost: 450, price: 550, qty: 30 },
    ],
  ],
];

/** Datos de EJEMPLO para las capturas (login `e2e-` para que la suite los limpie). */
function makeExampleIdentity() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return {
    login: `e2e-${stamp}-${suffix}`,
    password: 'Ejemplo1234',
    fullName: 'María Pérez',
    cellPhone: '5355501234',
    storeName: 'Bodega La Esquina',
  };
}

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

/** Oculta los elementos de posición `fixed` (y `sticky`), que rompen la captura fullPage. */
async function hideFixedElements(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const position = getComputedStyle(el).position;
      if (position === 'fixed' || position === 'sticky') {
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    }
  });
}

/**
 * Oculta los puntos `animate-ping` — el halo que PULSA junto a los indicadores de "sin leer".
 * En una captura estática no se ve como pulsación, sino como un círculo suelto; el contador ya
 * comunica lo mismo. Se oculta SIEMPRE, también en las capturas con `keepFixed`.
 */
async function hidePingDots(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.animate-ping')) {
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  });
}

/** Espera a que la página esté estable para la captura. */
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
}

/**
 * Espera a que la URL cumpla `predicate`. Se SONDEA `page.url()` en vez de usar
 * `page.waitForURL`: tras el auto-login la app navega del lado del cliente (SPA) y no dispara
 * el evento `load` que `waitForURL` espera por defecto.
 */
async function waitForPathChange(page, predicate, timeoutMs = 90_000) {
  const start = Date.now();
  for (;;) {
    if (predicate(new URL(page.url()))) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`La URL no cambió tras ${timeoutMs} ms; sigue en ${page.url()}`);
    }
    await page.waitForTimeout(500);
  }
}

/** Navega a una ruta de la app y espera a que cargue. */
async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(400);
}

/** Siembra el catálogo (categorías + productos con costo, precio y stock) por la UI real. */
async function seedCatalog(page) {
  await goto(page, '/sales/products');

  for (const [categoryName, products] of CATALOG) {
    await page.getByTestId('add-category-button').click();
    await page.getByTestId('category-name-input').fill(categoryName);
    await page.getByTestId('category-save-button').click();

    const nameButton = page
      .locator('[data-testid^="category-panel-toggle-"]')
      .filter({ hasText: categoryName })
      .first();
    await nameButton.waitFor({ state: 'visible', timeout: 20_000 });
    const testId = await nameButton.getAttribute('data-testid');
    const categoryId = (testId ?? '').replace('category-panel-toggle-', '');
    console.log(`categoría lista: ${categoryName} (${categoryId})`);

    for (const product of products) {
      await page.getByTestId(`category-actions-toggle-${categoryId}`).click();
      await page.getByTestId('add-product-button').click();
      await page.getByTestId('product-name-input').fill(product.name);
      const cost = page.getByTestId('product-cost-input');
      if (await cost.count()) await cost.fill(String(product.cost));
      await page.getByTestId('product-price-input').fill(String(product.price));
      const quantity = page.getByTestId('product-quantity-input');
      if (await quantity.count()) await quantity.fill(String(product.qty));
      await page.getByTestId('create-product-submit').click();
      await page
        .getByTestId('product-name-input')
        .waitFor({ state: 'hidden', timeout: 20_000 });
      console.log(`  producto listo: ${product.name}`);
    }
  }
}

async function main() {
  console.log(`Esperando el dev server en ${BASE} ...`);
  await waitForServer(BASE);
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  const capture = async (page, name, { keepFixed = false } = {}) => {
    await settle(page);
    await hidePingDots(page);
    if (!keepFixed) await hideFixedElements(page);
    const file = resolve(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`guardada ${file}`);
  };

  // ── Sección 2: pantalla de acceso (contexto público, SIN sesión) ───────
  const publicCtx = await browser.newContext({ ...MOBILE });
  const publicPage = await publicCtx.newPage();
  await goto(publicPage, '/login');
  await publicPage.locator('#login').waitFor({ state: 'visible', timeout: 30_000 });
  await capture(publicPage, '03-iniciar-sesion');
  await publicCtx.close();

  // ── Sección 1: registro → inicio (contexto con sesión) ─────────────────
  const ctx = await browser.newContext({ ...MOBILE });
  const page = await ctx.newPage();
  const identity = makeExampleIdentity();

  await goto(page, '/register');
  await page.locator('#acceptTerms').waitFor({ state: 'visible', timeout: 30_000 });
  await page.fill('#fullName', identity.fullName);
  await page.fill('#storeName', identity.storeName);
  await page.fill('#login', identity.login);
  await page.fill('#password', identity.password);
  await page.fill('#passwordConfirmation', identity.password);
  await page.fill('#cellPhone', identity.cellPhone);
  await capture(page, '01-crear-cuenta', { keepFixed: true });

  await page.check('#acceptTerms');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await waitForPathChange(page, (url) => !url.pathname.startsWith('/register'));
  // El botón flotante INSTALAR APP se MANTIENE: el paso de instalación vive aquí.
  await capture(page, '02-inicio', { keepFixed: true });

  // ── Encabezado y pie (íconos y contacto) — capturas de ELEMENTO ────────
  await settle(page);
  await hidePingDots(page);
  await page.locator('header').first().screenshot({ path: resolve(OUT_DIR, '04-encabezado.png') });
  await page.locator('footer').first().screenshot({ path: resolve(OUT_DIR, '05-pie.png') });
  console.log('guardadas 04-encabezado.png / 05-pie.png');

  // ── Sembrado del catálogo ──────────────────────────────────────────────
  console.log('Sembrando el catálogo ...');
  await seedCatalog(page);

  // ── 06: Catálogo, con una categoría expandida ──────────────────────────
  await goto(page, '/sales/products');
  await page.locator('[data-testid^="category-panel-toggle-"]').first().click();
  await capture(page, '06-productos');

  // ── 07: Vender ─────────────────────────────────────────────────────────
  await goto(page, '/sales/new');
  await capture(page, '07-vender');

  // ── 08: Inventario disponible (con una categoría expandida) ────────────
  await goto(page, '/inventory/available');
  const invToggle = page.locator('[data-testid^="inventory-category-toggle-"]').first();
  await invToggle.click();
  await capture(page, '08-disponible');

  // ── 09: Cierre de caja ─────────────────────────────────────────────────
  await goto(page, '/sales/cash-closing');
  await capture(page, '09-cierre-caja');

  // ── 10: Gastos del día ─────────────────────────────────────────────────
  await goto(page, '/expenses/today');
  await capture(page, '10-gastos');

  // ── Lote: resto de pantallas (sin interacción) ─────────────────────────
  const ROUTES = [
    ['11-entradas-dia', '/inventory/today-entries'],
    ['12-cantidades-dia', '/inventory/today-quantities'],
    ['13-ganancias-dia', '/inventory/today-sales-profit'],
    ['14-cuadre-dia', '/sales/today-stats'],
    ['15-ventas-del-dia', '/sales/today-orders'],
    ['16-reportes', '/reports/today'],
    ['17-dashboard', '/stats/dashboard'],
    ['18-cuadre-fechas', '/stats/cuadre-por-fechas'],
    ['19-configuraciones', '/management/configurations'],
    ['20-tasas-cambio', '/management/channel-rates'],
    ['21-empleados', '/management/users'],
    ['22-mis-tiendas', '/management/my-stores'],
    ['23-catalogo-web', '/sales/web-catalog'],
    ['24-pedidos-whatsapp', '/sales/online-orders/settings'],
    ['25-pedidos', '/sales/online-orders'],
    ['26-repartidores', '/sales/online-orders/drivers'],
    ['27-ventas-pedidos', '/sales/online-orders/sales'],
    ['28-mayorista', '/sales/wholesale'],
    ['29-creditos-dia', '/sales/today-credits'],
    ['30-exportar', '/sync/export'],
    ['31-importar', '/sync/import'],
    ['32-diagnostico', '/diagnostics'],
  ];
  for (const [name, path] of ROUTES) {
    await goto(page, path);
    await capture(page, name);
  }

  await ctx.close();
  await browser.close();
  console.log(`\nListo. Imágenes en ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
