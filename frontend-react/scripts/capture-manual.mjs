// Captura de pantallas para el manual de usuario (docs/manual/manual-usuario-pos.md).
//
// Script STANDALONE: no forma parte de la suite Playwright. Vive en `scripts/`, fuera del
// `testDir: './e2e'` del config, así que `pnpm test:e2e` NUNCA lo ejecuta. Usa el navegador
// ya instalado y apunta al dev server local (levantado con `API_URL=.../api` y el backend
// `http-e2e`).
//
// Todas las capturas son en modo MOBILE (decisión del owner, 2026-10-15).
//
// Regla de composición (opción 2): antes de capturar se OCULTAN los elementos con
// `position: fixed`/`sticky` (botones flotantes), que en una captura `fullPage` se pegan a
// media pantalla y tapan contenido. Una captura puede pedir `keepFixed: true` para conservarlos.
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

  const capture = async (page, name, { keepFixed = false } = {}) => {
    await settle(page);
    if (!keepFixed) await hideFixedElements(page);
    const file = resolve(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`guardada ${file}`);
  };

  // ── Sección 2: pantalla de acceso (contexto público, SIN sesión) ───────
  const publicCtx = await browser.newContext({ ...MOBILE });
  const publicPage = await publicCtx.newPage();
  await publicPage.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60_000 });
  await publicPage.locator('#login').waitFor({ state: 'visible', timeout: 30_000 });
  await capture(publicPage, '03-iniciar-sesion');
  await publicCtx.close();

  // ── Sección 1: registro → inicio (contexto con sesión) ─────────────────
  const ctx = await browser.newContext({ ...MOBILE });
  const page = await ctx.newPage();
  const identity = makeExampleIdentity();

  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle', timeout: 60_000 });
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
  await page
    .locator('header')
    .first()
    .screenshot({ path: resolve(OUT_DIR, '04-encabezado.png') });
  await page
    .locator('footer')
    .first()
    .screenshot({ path: resolve(OUT_DIR, '05-pie.png') });
  console.log('guardadas 04-encabezado.png / 05-pie.png');
  await ctx.close();

  await browser.close();
  console.log(`\nListo. Imágenes en ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
