#!/usr/bin/env node
// Comprueba que el HTML servido publica el canonical del host real, no el de playground.
//
// El valor sale de `PUBLIC_BASE_URL` (build arg del frontend y `CatalogStaticPage__PublicBaseUrl`
// de la API, ambos con default `https://pos.playground.sceiba.net` en docker-compose). Si el
// despliegue de producción no define esa variable, canonical, og:url y og:image apuntan al entorno
// de pruebas y nadie se entera: este script convierte eso en un fallo con nombre y apellido.
//
// Uso:
//   node scripts/check-public-canonical.mjs https://pos.tudominio.com
//   node scripts/check-public-canonical.mjs http://127.0.0.1:4173 --expect https://pos.playground.sceiba.net
import { readFile } from 'node:fs/promises';

export function findCanonicalViolations(html, expectedBaseUrl) {
  const expected = new URL(expectedBaseUrl);
  const expectedOrigin = expected.origin;
  const violations = [];

  const canonical = /<link\s+rel="canonical"\s+href="([^"]+)"/i.exec(html)?.[1] ?? null;
  const ogUrl = /<meta\s+property="og:url"\s+content="([^"]+)"/i.exec(html)?.[1] ?? null;
  const ogImage = /<meta\s+property="og:image"\s+content="([^"]+)"/i.exec(html)?.[1] ?? null;

  if (!canonical) violations.push('el HTML no publica <link rel="canonical">');
  if (!ogUrl) violations.push('el HTML no publica og:url');
  if (!ogImage) violations.push('el HTML no publica og:image');

  for (const [label, value] of [
    ['canonical', canonical],
    ['og:url', ogUrl],
    ['og:image', ogImage],
  ]) {
    if (!value) continue;
    if (new URL(value).origin !== expectedOrigin) {
      violations.push(`${label} apunta a ${new URL(value).origin}, se esperaba ${expectedOrigin}`);
    }
  }

  return violations;
}

async function loadHtml(target) {
  if (target.startsWith('file:')) {
    return readFile(new URL(target), 'utf8');
  }
  const response = await fetch(target.endsWith('/') ? target : `${target}/`);
  if (!response.ok) throw new Error(`GET ${target}/ respondió ${response.status}`);
  return response.text();
}

async function main() {
  const [target, ...rest] = process.argv.slice(2);
  if (!target) {
    console.error('uso: check-public-canonical.mjs <url> [--expect <baseUrl>]');
    process.exitCode = 2;
    return;
  }

  const expectIndex = rest.indexOf('--expect');
  const expected = expectIndex >= 0 ? rest[expectIndex + 1] : target;
  if (!expected) {
    console.error('check-public-canonical: --expect necesita una URL');
    process.exitCode = 2;
    return;
  }

  let html;
  try {
    html = await loadHtml(target);
  } catch (error) {
    console.error(`check-public-canonical: FAILED - ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
    return;
  }

  const violations = findCanonicalViolations(html, expected);
  if (violations.length > 0) {
    console.error(`check-public-canonical: FAILED - ${target}`);
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(
      '  Arreglo: definir PUBLIC_BASE_URL en el entorno del despliegue y reconstruir la imagen ' +
        '(docker-compose.yml:53 y :114 la leen para el frontend y para la API).',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`check-public-canonical: OK — ${target} publica ${new URL(expected).origin} en canonical/og.`);
}

const invokedDirectly =
  process.argv[1]?.endsWith('check-public-canonical.mjs') === true;

if (invokedDirectly) {
  await main();
}
