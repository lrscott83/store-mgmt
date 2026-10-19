#!/usr/bin/env node
// Post-build landing metadata (SEO).
//
// The app is SPA mode (`ssr:false`): React Router renders only the root route
// into `build/client/index.html`, so route-level `meta` exports never reach the
// HTML a crawler receives without executing JavaScript. The landing (`/`) is the
// only public page whose metadata we control (the POS routes are private and the
// public catalogs already get their own pre-generated pages).
//
// This script does NOT touch `index.html`: that shell is the SPA fallback for
// every private route AND the template the backend uses to pre-generate catalog
// pages. Injecting landing metadata there would leak it into both. Instead it
// writes a second, head-only variant (`landing.html`) that nginx serves ONLY for
// the exact `/` route.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'https://pos.playground.sceiba.net';

export const LANDING_META = {
  title: 'VendeDTo — POS offline y catálogo web con pedidos por WhatsApp',
  description:
    'Gestiona tu negocio sin depender de Internet: ventas, inventario, cuadre de caja y ' +
    'reportes. POS offline con catálogo web y pedidos por WhatsApp.',
  siteName: 'VendeDTo',
  locale: 'es_ES',
  imagePath: '/icons/icon-512x512.png',
};

/**
 * Normalizes the public site base URL and rejects values that would produce an
 * invalid canonical. Canonical URLs must be absolute.
 */
export function resolveBaseUrl(value) {
  const base = String(value ?? '')
    .trim()
    .replace(/\/+$/, '');

  if (!/^https?:\/\/[^/]+$/i.test(base)) {
    throw new Error(`generate-landing-page: base URL must be absolute http(s), got '${value}'`);
  }

  return base;
}

/**
 * Pure injection: returns a copy of the SPA shell whose `<head>` carries the
 * landing metadata. Any pre-existing title/description is replaced, never
 * duplicated. The body and every other head element stay byte-identical.
 */
export function injectLandingMeta(
  shellHtml,
  { baseUrl = DEFAULT_BASE_URL, meta = LANDING_META } = {},
) {
  if (!shellHtml || !shellHtml.trim()) {
    throw new Error('generate-landing-page: shell HTML is empty');
  }

  const headClose = shellHtml.search(/<\/head>/i);
  if (headClose < 0) {
    throw new Error('generate-landing-page: shell HTML has no </head>');
  }

  const base = resolveBaseUrl(baseUrl);
  const canonicalUrl = `${base}/`;

  let head = shellHtml.slice(0, headClose);
  const tail = shellHtml.slice(headClose);

  head = removeElement(head, '<title', '</title>');
  head = removeMetaByName(head, 'description');

  const tags = [
    `<title>${escapeHtml(meta.title, false)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description, true)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl, true)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${escapeHtml(meta.title, true)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description, true)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl, true)}" />`,
    meta.imagePath
      ? `<meta property="og:image" content="${escapeHtml(`${base}${meta.imagePath}`, true)}" />`
      : '',
    `<meta property="og:site_name" content="${escapeHtml(meta.siteName, true)}" />`,
    `<meta property="og:locale" content="${escapeHtml(meta.locale, true)}" />`,
    '<meta name="twitter:card" content="summary" />',
  ]
    .filter(Boolean)
    .join('');

  return head + tags + tail;
}

function escapeHtml(value, forAttribute) {
  const text = String(value ?? '');
  let escaped = '';

  for (const char of text) {
    switch (char) {
      case '&':
        escaped += '&amp;';
        break;
      case '<':
        escaped += '&lt;';
        break;
      case '>':
        escaped += '&gt;';
        break;
      case '"':
        escaped += forAttribute ? '&quot;' : '"';
        break;
      case "'":
        escaped += forAttribute ? '&#39;' : "'";
        break;
      default:
        escaped += char;
        break;
    }
  }

  return escaped;
}

function removeElement(html, openToken, closeToken) {
  let result = html;

  while (true) {
    const start = result.toLowerCase().indexOf(openToken);
    if (start < 0) return result;

    const end = result.toLowerCase().indexOf(closeToken, start);
    if (end < 0) return result;

    result = result.slice(0, start) + result.slice(end + closeToken.length);
  }
}

function removeMetaByName(html, name) {
  let result = html;

  while (true) {
    const at = findAttributeValue(result, 'name', name);
    if (at < 0) return result;

    const start = result.toLowerCase().lastIndexOf('<meta', at);
    if (start < 0) return result;

    const end = result.indexOf('>', at);
    if (end < 0) return result;

    result = result.slice(0, start) + result.slice(end + 1);
  }
}

function findAttributeValue(html, attribute, value) {
  const lower = html.toLowerCase();
  const doubleQuoted = lower.indexOf(`${attribute}="${value.toLowerCase()}"`);
  if (doubleQuoted >= 0) return doubleQuoted;

  return lower.indexOf(`${attribute}='${value.toLowerCase()}'`);
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '..');
  const shellPath = resolve(root, 'build/client/index.html');
  const outputPath = resolve(root, 'build/client/landing.html');
  const baseUrl = process.env.PUBLIC_BASE_URL || DEFAULT_BASE_URL;

  const shell = await readFile(shellPath, 'utf8');
  const html = injectLandingMeta(shell, { baseUrl });

  await writeFile(outputPath, html, 'utf8');
  console.log(`generate-landing-page: wrote ${outputPath} (canonical ${resolveBaseUrl(baseUrl)}/)`);
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  await main();
}
