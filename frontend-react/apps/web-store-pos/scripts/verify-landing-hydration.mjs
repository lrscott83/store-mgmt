#!/usr/bin/env node
// Prueba de hidratación de la landing prerenderizada, en un navegador real.
//
// El gate del build (`verify-landing-prerender.mjs`) sólo puede mirar el HTML estático: no ve el
// árbol que React monta. Este script sirve `build/client` tal cual, abre `/` en Chromium y exige
// que la hidratación no reporte errores y que el cuerpo prerenderizado sobreviva al montaje.
//
// No corre en la cadena de build (Docker no trae navegador). Se ejecuta a mano o en CI:
//   pnpm exec node scripts/verify-landing-hydration.mjs
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = resolve(process.cwd(), 'build/client');
const PORT = 4173;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

async function readIfFile(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? await readFile(path) : null;
  } catch {
    return null;
  }
}

// `/` se sirve como `landing.html` (lo que hace nginx) y el resto cae al shell `index.html`.
async function resolveRequestPath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/') return join(ROOT, 'landing.html');
  const direct = await readIfFile(join(ROOT, clean));
  if (direct) return join(ROOT, clean);
  return join(ROOT, 'index.html');
}

async function main() {
  const server = createServer(async (request, response) => {
    const filePath = await resolveRequestPath(request.url ?? '/');
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  });

  await new Promise((done) => server.listen(PORT, '127.0.0.1', done));

  const browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();

  const hydrationErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });

    const snapshot = await page.evaluate(() => {
      const heading = document.querySelector('h1');
      const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
      let applicationCategory = null;
      try {
        const payload = JSON.parse(jsonLd[0]?.textContent ?? '{}');
        const graph = payload['@graph'] ?? [payload];
        applicationCategory = graph.find((node) => node?.applicationCategory)?.applicationCategory ?? null;
      } catch {
        applicationCategory = 'unparseable';
      }
      return {
        heading: heading?.textContent?.trim() ?? null,
        title: document.title,
        jsonLdCount: jsonLd.length,
        applicationCategory,
        sections: document.querySelectorAll('section').length,
        bodyLength: document.body.textContent?.length ?? 0,
      };
    });

    const violations = [];
    if (!snapshot.heading) violations.push('la landing quedó sin <h1> después de hidratar');
    if (!snapshot.title) violations.push('document.title vacío después de hidratar');
    if (snapshot.jsonLdCount !== 1) {
      violations.push(`JSON-LD tras hidratar: ${snapshot.jsonLdCount} bloques, se esperaba 1`);
    }
    if (snapshot.bodyLength < 1000) {
      violations.push(`el cuerpo quedó casi vacío tras hidratar (${snapshot.bodyLength} caracteres)`);
    }
    if (hydrationErrors.length > 0) {
      violations.push(`${hydrationErrors.length} error(es) de hidratación en consola`);
    }
    if (pageErrors.length > 0) {
      violations.push(`${pageErrors.length} excepción(es) no capturadas: ${pageErrors.join(' | ')}`);
    }

    if (violations.length > 0) {
      console.error('verify-landing-hydration: FAILED');
      for (const violation of violations) console.error(`  - ${violation}`);
      for (const error of hydrationErrors) console.error(`  hydration: ${error.slice(0, 400)}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `verify-landing-hydration: OK — hidrató sin errores; h1 "${snapshot.heading}", ` +
        `${snapshot.sections} secciones, ${snapshot.bodyLength} caracteres, ` +
        `applicationCategory ${snapshot.applicationCategory ?? 'ausente'}.`,
    );
  } finally {
    await context.close();
    await browser.close();
    await new Promise((done) => server.close(done));
  }
}

await main();
