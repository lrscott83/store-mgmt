#!/usr/bin/env node
// Post-build bootstrap externalization (package.json build chain). Runs AFTER
// `react-router build` has written `build/client/index.html` and BEFORE
// `build-sw.mjs` (so the new assets are picked up by the precache globs) and
// `verify-csp.mjs` (so the only remaining inline scripts are the three stable
// hydration scripts the CSP hash-sources cover). Mirrors build-sw.mjs's shape:
// paths from process.cwd(), I/O only, one log line, loud failure.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { externalizeInlineScripts, scanInlineScripts } from './externalize-inline-scripts.mjs';

const ROOT = process.cwd();
const INDEX_HTML = resolve(ROOT, 'build/client/index.html');

async function main() {
  let html;
  try {
    html = await readFile(INDEX_HTML, 'utf8');
  } catch (error) {
    throw new Error(
      `externalize-bootstrap: cannot read ${INDEX_HTML}. This script must run AFTER "react-router build" ` +
        `(which writes build/client/index.html) and BEFORE build-sw.mjs / verify-csp.mjs. ` +
        `Underlying error: ${error instanceof Error ? error.message : error}`
    );
  }

  const inlineBefore = scanInlineScripts(html).length;
  const { html: rewritten, assets } = externalizeInlineScripts(html);
  const leftInline = inlineBefore - assets.length;

  for (const asset of assets) {
    await writeFile(resolve(ROOT, 'build/client', asset.fileName), asset.content, 'utf8');
  }

  if (assets.length > 0) {
    await writeFile(INDEX_HTML, rewritten, 'utf8');
  }

  console.log(`externalize-bootstrap: externalized ${assets.length} inline script(s); ${leftInline} left inline.`);
  for (const asset of assets) {
    console.log(`  ${asset.fileName}`);
  }
}

await main();