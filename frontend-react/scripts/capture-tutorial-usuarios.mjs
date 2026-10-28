// Captura de pantallas del TUTORIAL de gestión de usuarios (empleados) para la
// pantalla `/help/tutorial` del POS.
//
// Script STANDALONE (no forma parte de la suite Playwright: vive en `scripts/`, fuera de
// `testDir: './e2e'`). A diferencia de `capture-tutorial-catalogo.mjs`, las imágenes de la
// ayuda en la app son capturas LIMPIAS (sin círculos rojos), así que aquí solo se recorta
// el elemento relevante.
//
// Requisitos: `pnpm dev` en :3333 con `API_URL=http://localhost:5019/api` y el backend
// `--launch-profile http-e2e` (base `smca_test`).
//
// Uso:
//   node scripts/capture-tutorial-usuarios.mjs
//
// Variables opcionales:
//   CAPTURE_BASE_URL  (default http://localhost:3333)
//   CAPTURE_OUT       (default ../apps/web-store-pos/public/images/help)

import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE = process.env.CAPTURE_BASE_URL ?? 'http://localhost:3333';
const OUT_DIR =
  process.env.CAPTURE_OUT ??
  resolve(process.cwd(), 'apps', 'web-store-pos', 'public', 'tutorials', 'usuarios');

const MOBILE = devices['iPhone 13'];

const STORE = {
  login: `e2e-tutorial-users-${Math.random().toString(36).slice(2, 8)}`,
  password: 'Ejemplo1234',
  fullName: 'María Pérez',
  cellPhone: '5355501234',
  storeName: 'Bodega La Esquina',
};

const EMPLOYEE = {
  fullName: 'Carlos Ruiz',
  login: `carlos-${Math.random().toString(36).slice(2, 6)}`,
  password: 'Empleado1234',
  cellPhone: '5355509876',
};

const MASTER_PASSWORD = 'Roster1234';

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
  await page.waitForTimeout(500);
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

/** Oculta el botón flotante PWA "Instalar app" (z-[9999]), que tapa contenido. */
async function hideInstallButton(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('button[aria-label="Instalar app"]')) {
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  });
}

/** Captura el elemento indicado (recorte limpio, sin marcas). */
async function shotElement(locator, name) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().waitForTimeout(250);
  const file = resolve(OUT_DIR, `${name}.png`);
  await locator.screenshot({ path: file });
  console.log(`guardada ${file}`);
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
  await mustSee(page, page.locator('#acceptTerms'), 'el formulario de registro', 30_000);
  await page.fill('#fullName', STORE.fullName);
  await page.fill('#storeName', STORE.storeName);
  await page.fill('#login', STORE.login);
  await page.fill('#password', STORE.password);
  await page.fill('#passwordConfirmation', STORE.password);
  await page.fill('#cellPhone', STORE.cellPhone);
  await page.check('#acceptTerms');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await page.waitForTimeout(4_000);
  console.log(`Owner de ejemplo listo: ${STORE.login} / ${STORE.storeName}`);

  // ── Paso 1.1: menú → Gestión → Empleados ────────────────────────────────
  await goto(page, '/sales/products');
  await mustSee(page, page.getByTestId('add-category-button'), 'el catálogo de productos');
  await page.getByRole('button', { name: 'Alternar barra lateral' }).first().click();
  const employeesLink = page.locator(
    'nav[aria-label="Navegación principal"] a[href="/management/users"]',
  );
  await mustSee(page, employeesLink, 'la opción Empleados del menú');
  await hideInstallButton(page);
  await employeesLink.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT_DIR, 'users-menu.png') });
  console.log(`guardada ${resolve(OUT_DIR, 'users-menu.png')}`);
  // Navegación directa: el drawer móvil no dispara la navegación SPA al hacer click en el
  // enlace, y la captura ya muestra dónde está la opción.
  await goto(page, '/management/users');

  // ── Paso 1.2: cabecera de Empleados con + Empleado y el roster ──────────
  const heading = page.getByRole('heading', { name: 'Empleados', exact: true });
  await mustSee(page, heading, 'la pantalla Empleados');
  await settle(page);
  await hideInstallButton(page);
  await shotElement(heading.locator('xpath=../..'), 'users-list');

  // ── Paso 1.3: formulario de nuevo empleado ──────────────────────────────
  await page.getByRole('button', { name: 'Empleado', exact: true }).click();
  const createForm = page.locator('form');
  await mustSee(page, page.locator('#confirmPassword'), 'el formulario de nuevo empleado');
  await page.fill('#fullName', EMPLOYEE.fullName);
  await page.fill('#login', EMPLOYEE.login);
  await page.fill('#password', EMPLOYEE.password);
  await page.fill('#confirmPassword', EMPLOYEE.password);
  await page.fill('#cellPhone', EMPLOYEE.cellPhone);
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page);
  await shotElement(createForm.locator('xpath=..'), 'users-create-form');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();

  // ── Paso 2.1: tarjeta del empleado con el menú de acciones ──────────────
  await mustSee(page, page.getByRole('heading', { name: 'Empleados', exact: true }), 'la lista');
  const card = page.locator('[data-slot="card"]').filter({ hasText: EMPLOYEE.login }).first();
  await mustSee(page, card, 'la tarjeta del empleado recién creado');
  await card.locator('button[aria-label="Acciones"]').click();
  const menu = page.getByRole('menu');
  await mustSee(page, menu, 'el menú de acciones del empleado');
  await settle(page);
  await shotElement(page.locator('div.grid').first(), 'users-card-actions');

  // ── Paso 2.2: formulario de edición ─────────────────────────────────────
  await page.getByRole('menuitem', { name: 'Editar', exact: true }).click();
  await mustSee(page, page.getByRole('heading', { name: 'Editar Empleado' }), 'la pantalla editar');
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page);
  await shotElement(page.locator('form').locator('xpath=../..'), 'users-edit-form');

  // ── Paso 4.1: modal Exportar roster sin conexión ────────────────────────
  await goto(page, '/management/users');
  await mustSee(
    page,
    page.getByRole('button', { name: 'Exportar roster sin conexión' }),
    'el botón de roster',
  );
  await page.getByRole('button', { name: 'Exportar roster sin conexión' }).click();
  const dialogCard = page.locator('[role="dialog"] [data-slot="card"]');
  await mustSee(page, dialogCard, 'el modal de exportar roster');
  await page.fill('#roster-export-master', MASTER_PASSWORD);
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page);
  await hideInstallButton(page);
  await page.screenshot({ path: resolve(OUT_DIR, 'users-roster-export.png') });
  console.log(`guardada ${resolve(OUT_DIR, 'users-roster-export.png')}`);

  await ctx.close();
  await browser.close();
  console.log(`\nListo. Imágenes del tutorial en ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
