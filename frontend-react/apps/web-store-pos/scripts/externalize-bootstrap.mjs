#!/usr/bin/env node
// Post-build bootstrap externalization (package.json build chain). Runs AFTER
// `react-router build` (plus the landing/shell split) and BEFORE `build-sw.mjs`
// (so the new assets are picked up by the precache globs) and `verify-csp.mjs`
// (so the only remaining inline scripts are the three stable hydration scripts
// the CSP hash-sources cover). Mirrors build-sw.mjs's shape: paths from
// process.cwd(), I/O only, one log line per document, loud failure.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { externalizeInlineScripts, scanInlineScripts, STABLE_INLINE_PREFIX } from './externalize-inline-scripts.mjs';

const ROOT = process.cwd();

// `landing.html` carries the prerendered body, so its hydration scripts differ from the shell's
// and can never match the static CSP hashes the shell pins: every inline script there becomes an
// external asset (served same-origin under `script-src 'self'`), preserving execution order.
// `prefix: null` means "no script is stable here - externalize all of them".
const DOCUMENTS = [
  { path: 'build/client/index.html', prefix: STABLE_INLINE_PREFIX },
  { path: 'build/client/landing.html', prefix: null },
];

async function externalizeDocument(document) {
  const filePath = resolve(ROOT, document.path);

  let html;
  try {
    html = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(
      `externalize-bootstrap: cannot read ${filePath}. This script must run AFTER "react-router build" ` +
        `(which writes build/client/index.html) and BEFORE build-sw.mjs / verify-csp.mjs. ` +
        `Underlying error: ${error instanceof Error ? error.message : error}`,
    );
  }

  const inlineBefore = scanInlineScripts(html).length;
  const options = document.prefix ? { prefix: document.prefix } : { prefix: /$^/ };
  const { html: rewritten, assets } = externalizeInlineScripts(html, options);
  const leftInline = inlineBefore - assets.length;

  for (const asset of assets) {
    // `fileName` is `assets/...` relative to build/client — the same shape
    // every Vite asset emits — so the file lands in build/client/assets/.
    // The emitted `src` is root-relative (`/assets/...`), matching how Vite
    // itself references its assets (base: '/').
    await writeFile(resolve(ROOT, 'build/client', asset.fileName), asset.content, 'utf8');
  }

  if (assets.length > 0) {
    await writeFile(filePath, rewritten, 'utf8');
  }

  console.log(
    `externalize-bootstrap: ${document.path} - externalized ${assets.length} inline script(s); ${leftInline} left inline.`,
  );
  for (const asset of assets) {
    console.log(`  ${asset.fileName}`);
  }
}

async function main() {
  for (const document of DOCUMENTS) {
    await externalizeDocument(document);
  }
}

await main();
