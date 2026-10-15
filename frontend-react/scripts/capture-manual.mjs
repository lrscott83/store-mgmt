// Captura de pantallas para el manual de usuario (docs/manual/manual-usuario-pos.md).
//
// Script STANDALONE: no forma parte de la suite Playwright. Vive en `scripts/`, fuera del
// `testDir: './e2e'` del config, así que `pnpm test:e2e` NUNCA lo ejecuta. Usa el navegador
// ya instalado y apunta al dev server local (levantado con `API_URL=.../api` y el backend
// `http-e2e`).
//
// Flujo: registra un Owner de ejemplo → siembra el catálogo Y los datos de ejemplo (entradas,
// gastos, repartidor y ventas) por la UI real → captura las pantallas en modo MOBILE
// (decisión del owner, 2026-10-15) → vuelve a capturar las vistas CON datos → y cierra con
// las capturas de los MODALES de adición (categoría, producto, entrada, gasto, pago de
// crédito y repartidor).
//
// Los datos sembrados son CONSTANTES: la misma corrida produce las mismas capturas. Lo único
// aleatorio es el login `e2e-…` del Owner de ejemplo, para que la suite E2E lo limpie.
//
// Reglas de composición:
// - Opción 2: se OCULTAN los elementos `position: fixed`/`sticky` (botones flotantes), que en
//   una captura `fullPage` se pegan a media pantalla. Una captura puede pedir `keepFixed: true`.
// - Siempre: se ocultan los halos `animate-ping` (pulsación de "sin leer"), que estáticos
//   quedan como un círculo suelto.
// - Los MODALES son `fixed inset-0` (z-50), así que necesitan `keepFixed: true` para no ser
//   ocultados; como el botón PWA "Instalar App" es `z-[9999]`, en esas capturas se oculta
//   puntualmente (`hideInstallButton`) para que no tape el modal, y son de `viewport` (no
//   `fullPage`) porque el overlay solo ocupa la primera pantalla.
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

/**
 * Datos CONSTANTES del ejemplo (los mismos en cada corrida).
 *
 * `ExpenseType` es el enum del dominio: Transporte = 2, Corriente = 4, Comida = 6 — el select
 * del modal persiste ESE número, no la etiqueta, así que se selecciona por valor y no por
 * texto (robusto ante cualquier cambio de i18n).
 * `SalePaymentMethod` es el enum del dominio: Efectivo = 0, Transferencia = 2.
 */
const EXTRA_ENTRY = { product: 'Cerveza Cristal Lata', quantity: 24, cost: 600 };

const EXPENSES = [
  { typeValue: 2, type: 'Transporte', total: 250, paymentMethod: 0, note: 'Flete de mercancía' },
  { typeValue: 6, type: 'Comida', total: 400, paymentMethod: 0, note: 'Almuerzo del personal' },
  { typeValue: 4, type: 'Corriente', total: 1200, paymentMethod: 2, note: 'Electricidad del mes' },
];

const DRIVER = { name: 'Carlos Ruiz', phone: '5355512345' };

/** Venta de contado: efectivo, con vuelto (paga con 5000). */
const CASH_SALE = {
  lines: [
    { name: 'Refresco Cola Pomo', qty: 2 },
    { name: 'Galletas Dulces Coco', qty: 1 },
  ],
  tender: 5000,
};

/** Ventas a crédito: quedan un crédito IMPAGO (Juan Pérez) y uno que se PAGARÁ después. */
const CREDIT_SALES = [
  { client: 'Juan Pérez', lines: [{ name: 'Pizza con Queso', qty: 2 }] },
  { client: 'Ana Gómez', lines: [{ name: 'Arroz Bolsa 1 kg', qty: 1 }] },
];

/** Cliente cuyo crédito se paga (captura 38) para dejar un crédito pagado y otro impago. */
const CREDIT_TO_PAY = 'Ana Gómez';

/** Datos de la categoría y del producto que se crean DENTRO de sus modales (33 / 34). */
const MODAL_CATEGORY = { name: 'Snacks' };
const MODAL_PRODUCT = { name: 'Papas Fritas', cost: 80, price: 120, qty: 20 };

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
 * Oculta SOLO el botón flotante PWA "Instalar App" (`fixed`, `z-[9999]`). Hace falta en las
 * capturas de MODAL: el overlay es `fixed` y hay que usar `keepFixed`, pero entonces ese
 * botón se dibujaría ENCIMA del modal. En el resto de capturas lo tapa `hideFixedElements`.
 */
async function hideInstallButton(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('button[aria-label="Instalar app"]')) {
      el.style.setProperty('visibility', 'hidden', 'important');
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

/**
 * `locator.waitFor` con mensaje propio: el error por defecto de Playwright es un volcado de
 * la cadena de llamadas, y aquí hace falta saber QUÉ se esperaba para diagnosticar un fallo
 * de la corrida.
 */
async function mustSee(page, locator, what, timeoutMs = 20_000) {
  try {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  } catch {
    throw new Error(`No apareció ${what} en ${timeoutMs} ms (URL: ${page.url()}).`);
  }
}

/** Rellena un campo por `data-testid` SOLO si existe (campos condicionales del formulario). */
async function fillIfPresent(page, testId, value) {
  const field = page.getByTestId(testId);
  if (await field.count()) await field.fill(String(value));
}

/**
 * Cierra un Swal bloqueante si aparece (guardas de validación, errores de inventario, la
 * confirmación de pago de crédito). Espera `timeoutMs` antes de rendirse: usarla con 500 ms
 * es una comprobación barata de "no hay nada bloqueando ahora mismo".
 *
 * El clic va con `force` y un timeout CORTO a propósito: SweetAlert2 deshabilita el botón y
 * anima el popup al cerrarse, así que el chequeo de "visible, habilitado y estable" de
 * Playwright se queda reintentando contra un nodo que ya se va a sustituir — y quema los
 * 30 s por defecto del clic. Si aun así sobrevive, Escape cierra cualquier Swal huérfano.
 */
async function dismissSwal(page, timeoutMs = 2_000) {
  const swal = page.locator('.swal2-container');
  try {
    await swal.waitFor({ state: 'visible', timeout: timeoutMs });
  } catch {
    return false;
  }
  await swal
    .locator('.swal2-confirm')
    .first()
    .click({ force: true, timeout: 5_000 })
    .catch(() => {});
  await swal.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  if (await swal.isVisible()) await page.keyboard.press('Escape');
  console.log('  Swal bloqueante cerrado');
  return true;
}

/** Rellena un campo SIEMPRE presente (si falta, el flujo se detiene con un error claro). */
async function fillRequired(page, locator, value, what) {
  await mustSee(page, locator, what);
  await locator.fill(String(value));
}

/** Agrega una unidad/linea de un producto al carrito global desde `/sales/new`. */
async function addProductToCart(page, productName, quantity) {
  const row = page
    .locator('form')
    .filter({ has: page.getByText(productName, { exact: true }) })
    .first();
  await mustSee(page, row, `la fila de venta de "${productName}"`);
  await row.locator('input[type="number"]').first().fill(String(quantity));
  await row.getByRole('button', { name: 'Adicionar' }).click();
  console.log(`  carrito += ${quantity} × ${productName}`);
}

/** Abre el panel del carrito global (el badge vive DENTRO del `<button>`, no es el botón). */
async function openCart(page) {
  const badge = page.getByTestId('cart-badge');
  await mustSee(page, badge, 'el botón del carrito');
  await badge.locator('..').click();
  await mustSee(page, page.getByRole('button', { name: 'Registrar' }), 'el panel del carrito');
}

/** Éxito de una venta: el carrito se vacía y el badge vuelve a `0`. */
async function waitForCartEmpty(page, timeoutMs = 45_000) {
  const badge = page.getByTestId('cart-badge');
  const start = Date.now();
  let seen = '';
  while (Date.now() - start < timeoutMs) {
    seen = ((await badge.textContent().catch(() => null)) ?? '').trim();
    if (seen === '0') return;
    await page.waitForTimeout(400);
  }
  throw new Error(`El carrito no se vació tras registrar la venta (badge "${seen}") tras ${timeoutMs} ms.`);
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
    await mustSee(page, nameButton, `la categoría "${categoryName}" recién creada`);
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

/** Rellena el modal de entrada de inventario (sin guardar) con `entry`. */
async function fillEntryModal(page, entry) {
  const combo = page.getByRole('combobox', { name: 'Producto' });
  await fillRequired(page, combo, entry.product, 'el combobox "Producto" del modal de entrada');
  const option = page.locator('#entry-product-listbox [role="option"]').first();
  await mustSee(page, option, `la opción "${entry.product}" del combobox`);
  await option.click();
  await fillRequired(page, page.locator('#entry-quantity'), entry.quantity, 'el campo Cantidad');
  await fillRequired(page, page.locator('#entry-cost-price'), entry.cost, 'el campo Precio de costo');
}

/** Guarda el modal de entrada de inventario abierto y espera a que se cierre. */
async function saveEntryModal(page) {
  const dialog = page.locator('div[role="dialog"]').filter({ has: page.locator('#entry-quantity') });
  await dialog.getByRole('button', { name: 'Adicionar' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 20_000 });
}

/**
 * Rellena el modal de gasto (sin guardar). Con MultiMonedas el modal mete un select de MONEDA
 * entre "Tipo de gasto" y "Tipo de pago", así que el tipo de pago se toma como el ÚLTIMO
 * select en vez de por índice fijo.
 */
async function fillExpenseModal(page, expense) {
  const dialog = page.locator('div[role="dialog"]').filter({ has: page.locator('#expense-form-total') });
  const selects = dialog.locator('select');
  const count = await selects.count();
  if (count < 2) {
    throw new Error(`El modal de gastos cambió: se esperaban 2 selects (tipo y pago) y hay ${count}.`);
  }
  await selects.nth(0).selectOption(String(expense.typeValue));
  await selects.nth(count - 1).selectOption(String(expense.paymentMethod));
  await dialog.locator('#expense-form-total').fill(String(expense.total));
  await dialog.locator('textarea').fill(expense.note);
}

/** Siembra la entrada de inventario extra (para que "Entradas del día" no salga vacía). */
async function seedExtraEntry(page) {
  await goto(page, '/inventory/today-entries');
  await page.getByRole('button', { name: 'Entrada', exact: true }).click();
  await fillEntryModal(page, EXTRA_ENTRY);
  await saveEntryModal(page);
  console.log(`  entrada lista: ${EXTRA_ENTRY.quantity} × ${EXTRA_ENTRY.product}`);
}

/** Siembra los tres gastos del día. */
async function seedExpenses(page) {
  await goto(page, '/expenses/today');
  for (const expense of EXPENSES) {
    await page.getByRole('button', { name: 'Gasto', exact: true }).click();
    await fillExpenseModal(page, expense);
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await page
      .locator('div[role="dialog"]')
      .filter({ has: page.locator('#expense-form-total') })
      .waitFor({ state: 'hidden', timeout: 20_000 });
    console.log(`  gasto listo: ${expense.type} ${expense.total} (${expense.note})`);
  }
}

/** Siembra el repartidor; la captura 39 sale del formulario de alta ya RELLENO. */
async function seedDriver(page, captureView) {
  await goto(page, '/sales/online-orders/drivers');
  await page.getByTestId('drivers-new').click();
  await mustSee(page, page.getByTestId('drivers-form'), 'el formulario de alta de repartidor');
  await page.getByTestId('drivers-name').fill(DRIVER.name);
  await page.getByTestId('drivers-phone').fill(DRIVER.phone);
  await captureView(page, '39-nuevo-repartidor');
  await page.getByTestId('drivers-save').click();
  await page.getByTestId('drivers-form').waitFor({ state: 'hidden', timeout: 30_000 });
  console.log(`  repartidor listo: ${DRIVER.name}`);
}

/**
 * Siembra la venta de contado. La captura 37 sale del panel del CARRITO abierto y con
 * productos dentro, justo antes de pulsar "Registrar".
 */
async function seedCashSale(page, captureView) {
  await goto(page, '/sales/new');
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  for (const line of CASH_SALE.lines) await addProductToCart(page, line.name, line.qty);

  await openCart(page);
  await page.getByTestId('payment-method-0').check(); // Efectivo
  await page.getByRole('spinbutton', { name: 'Pago' }).fill(String(CASH_SALE.tender));
  await dismissSwal(page, 500);
  await captureView(page, '37-carrito', { fullPage: false });

  await page.getByRole('button', { name: 'Registrar' }).click();
  await waitForCartEmpty(page);
  await dismissSwal(page);
  console.log(`  venta de efectivo registrada (paga con ${CASH_SALE.tender})`);
}

/** Siembra las dos ventas a crédito: queda una impaga y otra que se pagan después. */
async function seedCreditSales(page) {
  for (const sale of CREDIT_SALES) {
    await goto(page, '/sales/new');
    await page.getByRole('button', { name: 'Todos', exact: true }).click();
    for (const line of sale.lines) await addProductToCart(page, line.name, line.qty);

    await openCart(page);
    await page.getByRole('switch', { name: 'Crédito' }).click();
    await page.getByRole('textbox', { name: 'Cliente' }).fill(sale.client);
    await page.getByRole('button', { name: 'Registrar' }).click();
    await waitForCartEmpty(page);
    await dismissSwal(page);
    console.log(`  crédito registrado: ${sale.client}`);
  }
}

/** Paga el crédito de `client`; la captura 38 sale del modal de pago ya abierto. */
async function payCredit(page, client, captureModal) {
  await goto(page, '/sales/today-credits');
  const row = page.locator('tr').filter({ has: page.getByText(client, { exact: true }) }).first();
  await mustSee(page, row, `el crédito de "${client}" en Créditos del día`);
  await row.locator('[data-testid^="sale-credit-actions-toggle-"]').click();
  await page.getByRole('menuitem', { name: 'Pagar' }).click();
  await mustSee(page, page.locator('#sale-credit-payment-type'), 'el modal de pago de crédito');
  await captureModal(page, '38-pagar-credito');

  await page.getByTestId('sale-credit-payment-submit').click();
  await mustSee(page, page.getByRole('button', { name: 'Si' }), 'la confirmación Swal del pago');
  await page.getByRole('button', { name: 'Si' }).click();
  // El Swal se cierra SOLO al confirmar; la señal de éxito es el cierre del modal de pago
  // (si el pago fallara, el modal se mantiene abierto detrás del Swal de error).
  await page
    .locator('#sale-credit-payment-type')
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(async () => {
      await dismissSwal(page, 500);
      throw new Error(`No se pudo pagar el crédito de "${client}": el modal siguió abierto.`);
    });
  await dismissSwal(page, 500);
  console.log(`  crédito pagado: ${client}`);
}

/**
 * Capturas 33..36: los cuatro modales de ADICIÓN, abiertos y rellenos, y luego guardados
 * (así el catálogo/entradas/gastos del manual quedan con un registro más).
 */
async function captureCreationModals(page, captureModal) {
  // 33 — nueva categoría
  await goto(page, '/sales/products');
  await page.getByTestId('add-category-button').click();
  await mustSee(page, page.getByTestId('category-name-input'), 'el modal de nueva categoría');
  await page.getByTestId('category-name-input').fill(MODAL_CATEGORY.name);
  await captureModal(page, '33-nueva-categoria');
  await page.getByTestId('category-save-button').click();
  await page.getByTestId('category-name-input').waitFor({ state: 'hidden', timeout: 20_000 });
  console.log(`  categoría del modal guardada: ${MODAL_CATEGORY.name}`);

  // 34 — nuevo producto, dentro de la primera categoría del catálogo
  const firstCategory = page.locator('[data-testid^="category-panel-toggle-"]').first();
  await mustSee(page, firstCategory, 'la primera categoría del catálogo');
  const testId = await firstCategory.getAttribute('data-testid');
  const categoryId = (testId ?? '').replace('category-panel-toggle-', '');
  await page.getByTestId(`category-actions-toggle-${categoryId}`).click();
  await page.getByTestId('add-product-button').click();
  await mustSee(page, page.getByTestId('product-name-input'), 'el modal de nuevo producto');
  await page.getByTestId('product-name-input').fill(MODAL_PRODUCT.name);
  await fillIfPresent(page, 'product-cost-input', MODAL_PRODUCT.cost);
  await fillIfPresent(page, 'product-price-input', MODAL_PRODUCT.price);
  await fillIfPresent(page, 'product-quantity-input', MODAL_PRODUCT.qty);
  await captureModal(page, '34-nuevo-producto');
  await page.getByTestId('create-product-submit').click();
  await page.getByTestId('product-name-input').waitFor({ state: 'hidden', timeout: 20_000 });
  console.log(`  producto del modal guardado: ${MODAL_PRODUCT.name}`);

  // 35 — nueva entrada de inventario
  await goto(page, '/inventory/today-entries');
  await page.getByRole('button', { name: 'Entrada', exact: true }).click();
  await fillEntryModal(page, EXTRA_ENTRY);
  await captureModal(page, '35-nueva-entrada');
  await saveEntryModal(page);

  // 36 — nuevo gasto (el de Corriente / Transferencia)
  await goto(page, '/expenses/today');
  await page.getByRole('button', { name: 'Gasto', exact: true }).click();
  await fillExpenseModal(page, EXPENSES[2]);
  await captureModal(page, '36-nuevo-gasto');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page
    .locator('div[role="dialog"]')
    .filter({ has: page.locator('#expense-form-total') })
    .waitFor({ state: 'hidden', timeout: 20_000 });
  console.log(`  gasto del modal guardado: ${EXPENSES[2].note}`);
}

async function main() {
  console.log(`Esperando el dev server en ${BASE} ...`);
  await waitForServer(BASE);
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  const capture = async (page, name, { keepFixed = false, fullPage = true } = {}) => {
    await settle(page);
    await hidePingDots(page);
    if (!keepFixed) await hideFixedElements(page);
    const file = resolve(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage });
    console.log(`guardada ${file}`);
  };

  /**
   * Captura de MODAL: el overlay es `fixed inset-0`, así que `keepFixed` lo conserva y
   * `hideInstallButton` aparta el botón PWA (`z-[9999]`) que se dibujaría encima. Es una
   * captura de `viewport`: el overlay solo cubre la primera pantalla de una página larga.
   */
  const captureModal = async (page, name) => {
    await hideInstallButton(page);
    await capture(page, name, { keepFixed: true, fullPage: false });
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

  // ── Sembrado: primero TODOS los datos, para que las vistas salgan llenas ──
  console.log('Sembrando el catálogo ...');
  await seedCatalog(page);

  console.log('Sembrando la entrada de inventario extra ...');
  await seedExtraEntry(page);

  console.log('Sembrando los gastos del día ...');
  await seedExpenses(page);

  console.log('Sembrando el repartidor ...');
  await seedDriver(page, capture);

  console.log('Sembrando las ventas ...');
  await seedCashSale(page, capture);
  await seedCreditSales(page);

  console.log('Pagando un crédito ...');
  await payCredit(page, CREDIT_TO_PAY, captureModal);

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
  await mustSee(page, invToggle, 'una categoría en Inventario disponible');
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

  // ── 17: Panel de Control — con el rango llevado a HOY ─────────────────
  // El default del panel es "7 días inclusivos terminando AYER", así que las ventas de hoy
  // quedan fuera; aquí se fija el rango a los últimos 7 días INCLUYENDO hoy.
  await goto(page, '/stats/dashboard');
  {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await page.getByTestId('date-range-filter-input').first().click();
    await page.getByTestId('date-range-filter-start').first().fill(iso(start));
    await page.getByTestId('date-range-filter-end').first().fill(iso(today));
    await page.getByTestId('date-range-filter-select').first().click();
    await page.waitForTimeout(800);
  }
  await capture(page, '17-dashboard');

  // ── 40: Conteo de productos (vista PROPIA, solo conteo) ────────────────
  await goto(page, '/inventory/count');
  await page
    .locator('[data-testid^="product-count-category-toggle-"]')
    .first()
    .click();
  const firstCountInput = page.locator('[data-testid^="inventory-count-input-"]').first();
  await firstCountInput.waitFor({ state: 'visible', timeout: 20_000 });
  // Sistema 40 (Arroz) → contada 35 → diferencia −5, en rojo.
  await firstCountInput.fill('35');
  await capture(page, '40-conteo-productos');

  // ── Lote final: los modales de adición (33..36) ────────────────────────
  console.log('Capturando los modales de adición ...');
  await captureCreationModals(page, captureModal);

  await ctx.close();
  await browser.close();
  console.log(`\nListo. Imágenes en ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});