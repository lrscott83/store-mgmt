// Captura de pantallas para el manual de usuario (docs/manual/manual-usuario-pos.md).
//
// Script STANDALONE: no forma parte de la suite Playwright (no vive en `e2e/`, no lo
// recoge `playwright.config.ts`). Usa el navegador ya instalado y apunta al dev server
// local (que debe estar levantado con `API_URL=.../api` y el backend `http-e2e`).
//
// Todas las capturas son en modo MOBILE (decisión del owner, 2026-10-15).
//
// Regla de composición (opción 2): antes de capturar se OCULTAN los elementos con
// `position: fixed` (botones flotantes), que en una captura `fullPage` se pegan a media
// pantalla y tapan contenido. Una captura puede pedir `keepFixed: true` para conservarlos.
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

/** Espera a que la página esté estable para la captura. */
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
}

/**
 * Espera a que la URL cumpla `predicate`. Se SONDEA `page.url()` en vez de usar
 * `page.waitForURL`: tras el auto-login la app navega del lado del cliente (SPA) y no
 * dispara el evento `load` que `waitForURL` espera por defecto.
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

async function main() {
  console.log(`Esperando el dev server en ${BASE} ...`);
  await waitForServer(BASE);
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ ...MOBILE });

  const capture = async (name, { keepFixed = false } = {}) => {
    await settle(page);
    if (!keepFixed) await hideFixedElements(page);
    const file = resolve(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`guardada ${file}`);
  };

  // ── 01: Creación de cuenta ─────────────────────────────────────────────
  // Relleno con datos de ejemplo. Se MANTIENE el botón flotante «INSTALAR APP»
  // (es parte de lo que la imagen debe mostrar).
  const identity = makeExampleIdentity();
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.locator('#acceptTerms').waitFor({ state: 'visible', timeout: 30_000 });
  await page.fill('#fullName', identity.fullName);
  await page.fill('#storeName', identity.storeName);
  await page.fill('#login', identity.login);
  await page.fill('#password', identity.password);
  await page.fill('#passwordConfirmation', identity.password);
  await page.fill('#cellPhone', identity.cellPhone);
  await capture('01-crear-cuenta', { keepFixed: true });

  // ── 02: Página de inicio tras registrar ────────────────────────────────
  await page.check('#acceptTerms');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await waitForPathChange(page, (url) => !url.pathname.startsWith('/register'));
  await capture('02-inicio');

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
