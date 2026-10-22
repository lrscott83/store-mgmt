// Pure precache planning. Given the built React Router route manifest, the
// routes that must render offline and the static shell families, resolves the
// exact set of URLs the service worker may precache.
//
// No workbox and no writes: `build-sw.mjs` and `verify-sw-precache.mjs` both
// call this, and the unit tests call it with a fake chunk reader.

/**
 * The route manifest is a JS file that assigns a JSON literal
 * (`window.__reactRouterManifest = {...}`). The literal is plain JSON — the
 * previous build steps already relied on that — so slice from the first `{` to
 * the last `}` and parse it.
 */
export function parseRouteManifest(source) {
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('precache-plan: route manifest contains no JSON object literal');
  }

  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch (error) {
    throw new Error(
      `precache-plan: route manifest is not parseable JSON (${error instanceof Error ? error.message : error})`,
    );
  }
}

/** Normalizes a manifest/HTML URL to a build-relative path (`assets/x.js` or a root file). */
export function toAssetUrl(value, extension) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const noQuery = raw.split('?')[0].split('#')[0];
  if (!noQuery.endsWith(extension)) return null;
  if (/^[a-z]+:|^\/\//i.test(noQuery)) return null;

  // Chunk-relative import (`./chunk.js`) lives in assets/.
  if (noQuery.startsWith('./')) return `assets/${noQuery.slice(2)}`;

  if (noQuery.startsWith('/')) {
    const rooted = noQuery.slice(1);
    // `/pwa-install-capture.js` is a real file at the build root.
    if (!rooted.includes('/')) return rooted;
    return rooted.startsWith('assets/') ? rooted : null;
  }

  if (noQuery.startsWith('assets/')) return noQuery;
  if (noQuery.includes('/')) return null;

  return `assets/${noQuery}`;
}

/**
 * Every chunk URL a JS file can pull in: static imports, re-exports and dynamic
 * `import()` — plus Vite's `__vite__mapDeps` arrays, which spell the same
 * relative paths as plain string literals. Walking all three is what keeps a
 * lazily loaded library (jspdf, html2canvas, chart-core, zip-fs-wasm) inside the
 * closure of the offline route that can load it.
 */
export function extractChunkUrls(source) {
  const urls = new Set();
  const specifier = /["']((?:\.\/|\/assets\/|assets\/)[^"'\\/]+\.js)["']/g;

  for (const match of String(source).matchAll(specifier)) {
    const url = toAssetUrl(match[1], '.js');
    if (url) urls.add(url);
  }

  return urls;
}

/**
 * Local asset references inside an HTML document (`<script src>`,
 * `<link href>`, modulepreload links). The shell's own bootstrap scripts are not
 * imported by any chunk, so the route closure alone would leave them out and an
 * offline load of that document would 404 them.
 */
export function extractHtmlAssetUrls(source) {
  const urls = new Set();

  for (const match of String(source).matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1];
    const js = toAssetUrl(value, '.js');
    if (js) {
      urls.add(js);
      continue;
    }
    const cssUrl = toAssetUrl(value, '.css');
    if (cssUrl) urls.add(cssUrl);
  }

  return urls;
}

function addUrl(set, value, extension) {
  const url = toAssetUrl(value, extension);
  if (url) set.add(url);
}

/**
 * Resolves the precache URL set.
 *
 * @param {object} input
 * @param {object} input.routeManifest parsed `manifest-<hash>.js`
 * @param {string[]} input.offlineRouteIds route ids that must render offline
 * @param {string[]} input.staticUrls non-JS files the shell needs (html, icons,
 *   fonts, images, webmanifest) already resolved by the caller
 * @param {string} [input.routeManifestUrl] the hashed
 *   `assets/manifest-<hash>.js`; the prerendered HTML loads it directly, so no
 *   chunk imports it and nothing else would bring it into the closure
 * @param {(url: string) => Promise<string | null>} input.readChunk reads a built
 *   chunk; resolves `null` when the file does not exist
 * @returns {Promise<{urls: string[], unknownRouteIds: string[], missingChunks: string[]}>}
 */
export async function resolvePrecachePlan({
  routeManifest,
  offlineRouteIds,
  staticUrls,
  routeManifestUrl,
  readChunk,
}) {
  const routes = routeManifest?.routes ?? {};
  const entry = routeManifest?.entry ?? {};
  const chunks = new Set();
  const css = new Set();
  const staticAssets = new Set();
  // Chunks that must be precached but must NOT be walked. The route manifest is
  // a data table: it spells the module URL of every route, including the
  // online-only ones, so walking it would pull the whole app back in.
  const leaves = new Set();

  const unknownRouteIds = offlineRouteIds.filter((id) => !routes[id]);

  // A route module cannot render without the modules of every layout above it.
  // The parent chain is authoritative: Vite hoists a layout into its own route
  // entry, so `parentId` is the only reliable pointer.
  for (const routeId of offlineRouteIds) {
    const visited = new Set();
    let currentId = routeId;

    while (currentId && routes[currentId] && !visited.has(currentId)) {
      visited.add(currentId);
      const route = routes[currentId];
      addUrl(chunks, route.module, '.js');
      for (const imported of route.imports ?? []) addUrl(chunks, imported, '.js');
      for (const stylesheet of route.css ?? []) addUrl(css, stylesheet, '.css');
      currentId = route.parentId;
    }
  }

  addUrl(chunks, entry.module, '.js');
  for (const imported of entry.imports ?? []) addUrl(chunks, imported, '.js');
  for (const stylesheet of entry.css ?? []) addUrl(css, stylesheet, '.css');

  // The HTML documents reference the route manifest with a modulepreload link,
  // so it reaches the plan from two sides. It is always a leaf.
  const routeManifestAssetUrl = toAssetUrl(routeManifestUrl, '.js');
  if (routeManifestAssetUrl) {
    leaves.add(routeManifestAssetUrl);
    chunks.delete(routeManifestAssetUrl);
  }

  for (const url of staticUrls) {
    if (url.endsWith('.js')) addUrl(chunks, url, '.js');
    else staticAssets.add(url);
  }

  // A precached HTML document must be able to run: pull in the assets it
  // references. `index.html` loads `/pwa-install-capture.js` and
  // `landing.html` loads its eight externalized `bootstrap-*.js` scripts; no
  // chunk imports them, so the route closure alone would drop them.
  const missingChunks = [];
  for (const htmlUrl of [...staticAssets].filter((url) => url.endsWith('.html'))) {
    const html = await readChunk(htmlUrl);
    if (html == null) {
      missingChunks.push(htmlUrl);
      continue;
    }
    for (const reference of extractHtmlAssetUrls(html)) {
      // Already normalized by extractHtmlAssetUrls — do not pass it through
      // toAssetUrl again or a root file becomes assets/<name>.
      if (reference === routeManifestAssetUrl) leaves.add(reference);
      else if (reference.endsWith('.js')) chunks.add(reference);
      else css.add(reference);
    }
  }

  const queue = [...chunks];
  const walked = new Set();

  while (queue.length > 0) {
    const chunk = queue.pop();
    if (walked.has(chunk)) continue;
    walked.add(chunk);

    const source = await readChunk(chunk);
    if (source == null) {
      missingChunks.push(chunk);
      continue;
    }

    for (const discovered of extractChunkUrls(source)) {
      // The landing bootstrap scripts embed the route-manifest URL (their
      // preload map), so it can be discovered late. It is still a leaf: walking
      // it would pull every route module, online-only ones included.
      if (discovered === routeManifestAssetUrl) {
        leaves.add(discovered);
        continue;
      }
      if (walked.has(discovered)) continue;
      chunks.add(discovered);
      queue.push(discovered);
    }
  }

  return {
    urls: [...new Set([...chunks, ...leaves, ...css, ...staticAssets])].sort(),
    unknownRouteIds,
    missingChunks: missingChunks.sort(),
  };
}
