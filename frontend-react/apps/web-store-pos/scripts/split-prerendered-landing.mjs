// Splits the SPA-mode prerender output into the two documents this app serves:
// `landing.html` (the prerendered `/`, with its body) and `index.html` (the clean
// SPA shell every other route uses).
//
// With `prerender: ['/']` React Router writes the prerendered landing to
// `index.html` and the shell to `__spa-fallback.html`. Serving that directly would
// make the landing the shell of every private route AND the template the API uses
// for catalog pages, so the build swaps them here - before any consumer reads a
// name. The pure half below is Vitest-covered; `main` owns the file I/O.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRERENDERED_PATH = 'build/client/index.html';
export const FALLBACK_PATH = 'build/client/__spa-fallback.html';
export const LANDING_PATH = 'build/client/landing.html';

export function splitPrerenderedLanding({ prerendered, fallback }) {
  if (!prerendered || !prerendered.trim()) {
    throw new Error('split-prerendered-landing: the prerendered document is empty');
  }
  if (!fallback || !fallback.trim()) {
    throw new Error('split-prerendered-landing: the SPA fallback document is empty');
  }
  if (!/<body[\s>]/i.test(prerendered)) {
    throw new Error('split-prerendered-landing: the prerendered document has no <body>');
  }
  if (/<h1[\s>]/i.test(fallback)) {
    throw new Error(
      'split-prerendered-landing: the SPA fallback carries landing markup - ' +
        'prerender is no longer emitting a clean shell',
    );
  }
  if (!/<h1[\s>]/i.test(prerendered)) {
    throw new Error(
      'split-prerendered-landing: the prerendered landing has no <h1> - ' +
        'prerendering produced an empty body',
    );
  }

  return { landingHtml: prerendered, shellHtml: fallback };
}

async function main() {
  const root = process.cwd();
  const prerendered = await readFile(resolve(root, PRERENDERED_PATH), 'utf8');
  const fallback = await readFile(resolve(root, FALLBACK_PATH), 'utf8');

  const { landingHtml, shellHtml } = splitPrerenderedLanding({ prerendered, fallback });

  await writeFile(resolve(root, LANDING_PATH), landingHtml, 'utf8');
  await writeFile(resolve(root, PRERENDERED_PATH), shellHtml, 'utf8');
  await rm(resolve(root, FALLBACK_PATH));

  console.log(
    `split-prerendered-landing: landing ${landingHtml.length} B -> ${LANDING_PATH}, ` +
      `shell ${shellHtml.length} B -> ${PRERENDERED_PATH}`,
  );
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  await main();
}
