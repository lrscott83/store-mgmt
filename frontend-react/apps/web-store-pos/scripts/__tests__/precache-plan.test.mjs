import { describe, it, expect } from 'vitest';
import {
  extractChunkUrls,
  extractCssUrls,
  extractHtmlAssetUrls,
  parseRouteManifest,
  resolveOfflineRouteIds,
  resolvePrecachePlan,
  toAssetUrl,
} from '../precache-plan.mjs';

// ── precache-plan — allowlist resolution ────────────────────────────────────
// The precache is the closure of OFFLINE_ROUTE_IDS, not "everything that matches
// a glob". These tests pin the resolution rules without a real build: ancestry,
// route css, and transitive walking through static AND dynamic imports (that is
// what keeps jspdf/html2canvas/chart-core/zip-fs-wasm inside the closure of the
// offline route that can lazily load them).

describe('parseRouteManifest', () => {
  it('reads the JSON literal out of the manifest wrapper script', () => {
    const source = 'window.__reactRouterManifest={"entry":{"module":"/assets/e.js"},"routes":{}};';
    expect(parseRouteManifest(source)).toEqual({
      entry: { module: '/assets/e.js' },
      routes: {},
    });
  });

  it('throws when the file has no JSON literal', () => {
    expect(() => parseRouteManifest('not a manifest')).toThrow(/no JSON object literal/);
  });
});

describe('toAssetUrl', () => {
  it('normalizes every manifest spelling to a build-relative path', () => {
    expect(toAssetUrl('/assets/sale-abc.js', '.js')).toBe('assets/sale-abc.js');
    expect(toAssetUrl('./chunk-abc.js', '.js')).toBe('assets/chunk-abc.js');
    expect(toAssetUrl('assets/chunk-abc.js', '.js')).toBe('assets/chunk-abc.js');
    expect(toAssetUrl('/assets/root-abc.css', '.css')).toBe('assets/root-abc.css');
    expect(toAssetUrl('/pwa-install-capture.js', '.js')).toBe('pwa-install-capture.js');
  });

  it('rejects other extensions and paths outside assets/', () => {
    expect(toAssetUrl('/assets/root-abc.css', '.js')).toBeNull();
    expect(toAssetUrl('images/help/x.png', '.js')).toBeNull();
  });
});

describe('extractChunkUrls', () => {
  it('finds static imports, re-exports, dynamic imports and Vite dep arrays', () => {
    const source = `
      import "./chunk-a.js";
      export { x } from "./chunk-b.js";
      const load = () => import("./jspdf.es.min-c.js");
      const deps = ["assets/html2canvas.esm-d.js"];
    `;

    expect([...extractChunkUrls(source)].sort()).toEqual([
      'assets/chunk-a.js',
      'assets/chunk-b.js',
      'assets/html2canvas.esm-d.js',
      'assets/jspdf.es.min-c.js',
    ]);
  });

  it('ignores non-chunk string literals', () => {
    expect([...extractChunkUrls('const label = "sale-abc.js"; const p = "/api/v1/x";')]).toEqual(
      [],
    );
  });
});

describe('extractCssUrls', () => {
  it('finds stylesheets a chunk depends on', () => {
    const source = `
      const deps = ["assets/foo-abc.css", "./bar-def.css"];
      const url = "/assets/baz-ghi.css";
    `;

    expect([...extractCssUrls(source)].sort()).toEqual([
      'assets/bar-def.css',
      'assets/baz-ghi.css',
      'assets/foo-abc.css',
    ]);
  });

  it('does not pick up javascript or unrelated paths', () => {
    expect([...extractCssUrls('import("./chunk.js"); const x = "styles/main.css";')]).toEqual([]);
  });
});

describe('extractHtmlAssetUrls', () => {
  it('accepts double-quoted, single-quoted and unquoted attributes', () => {
    const html = `
      <script src="/pwa-install-capture.js"></script>
      <script src='/assets/boot-a.js'></script>
      <script src=/assets/boot-b.js></script>
      <link href="/assets/root.css">
    `;

    expect([...extractHtmlAssetUrls(html)].sort()).toEqual([
      'assets/boot-a.js',
      'assets/boot-b.js',
      'assets/root.css',
      'pwa-install-capture.js',
    ]);
  });
});

describe('resolveOfflineRouteIds', () => {
  it('returns each declared route plus every parent, once', () => {
    const manifest = {
      routes: {
        root: { module: '/assets/root.js' },
        layout: { module: '/assets/layout.js', parentId: 'root' },
        a: { module: '/assets/a.js', parentId: 'layout' },
        b: { module: '/assets/b.js', parentId: 'layout' },
      },
    };

    const { ids, unknownRouteIds } = resolveOfflineRouteIds(manifest, ['a', 'b']);

    expect(ids.sort()).toEqual(['a', 'b', 'layout', 'root']);
    expect(unknownRouteIds).toEqual([]);
  });

  it('reports ids the manifest does not have', () => {
    const manifest = { routes: { a: { module: '/assets/a.js' } } };

    expect(resolveOfflineRouteIds(manifest, ['a', 'gone']).unknownRouteIds).toEqual(['gone']);
  });
});

describe('resolvePrecachePlan', () => {
  const routeManifest = {
    entry: {
      module: '/assets/entry.client-AAA.js',
      imports: ['/assets/jsx-runtime-BBB.js'],
      css: [],
    },
    routes: {
      root: { module: '/assets/root-CCC.js', css: ['/assets/root-DDD.css'] },
      'app-layout': { module: '/assets/app-layout-EEE.js', parentId: 'root' },
      'sales/routes/sale': { module: '/assets/sale-GGG.js', parentId: 'app-layout' },
      'admin/stores/routes/store-list': {
        module: '/assets/store-list-HHH.js',
        parentId: 'app-layout',
      },
    },
  };

  const files = {
    'assets/entry.client-AAA.js': 'import "./jsx-runtime-BBB.js"; import("./heavy-III.js");',
    'assets/jsx-runtime-BBB.js': '',
    'assets/root-CCC.js': 'export { x } from "./chunk-FFF.js";',
    'assets/root-DDD.css': '',
    'assets/app-layout-EEE.js': '',
    'assets/sale-GGG.js': 'const load = () => import("./zip-fs-wasm-JJJ.js");',
    'assets/zip-fs-wasm-JJJ.js': '',
    'assets/heavy-III.js': '',
    'assets/chunk-FFF.js': '',
    'assets/store-list-HHH.js': '',
    'index.html': '',
  };

  const readChunk = async (url) => files[url] ?? null;
  it('includes the module, imports and css of an offline route AND its ancestors', async () => {
    const plan = await resolvePrecachePlan({
      routeManifest,
      offlineRouteIds: ['sales/routes/sale'],
      staticUrls: ['index.html', 'icons/icon-192x192.png'],
      readChunk,
    });

    expect(plan.urls).toEqual(
      expect.arrayContaining([
        'assets/root-CCC.js',
        'assets/root-DDD.css',
        'assets/app-layout-EEE.js',
        'assets/sale-GGG.js',
        'index.html',
        'icons/icon-192x192.png',
      ]),
    );
    expect(plan.unknownRouteIds).toEqual([]);
    expect(plan.missingChunks).toEqual([]);
  });

  it('walks dynamic imports transitively, so a lazily loaded library stays precached', async () => {
    const plan = await resolvePrecachePlan({
      routeManifest,
      offlineRouteIds: ['sales/routes/sale'],
      staticUrls: [],
      readChunk,
    });

    expect(plan.urls).toContain('assets/zip-fs-wasm-JJJ.js');
    expect(plan.urls).toContain('assets/heavy-III.js');
    expect(plan.urls).toContain('assets/chunk-FFF.js');
    expect(plan.urls).toContain('assets/jsx-runtime-BBB.js');
  });

  it('includes a stylesheet that only a chunk dependency array names', async () => {
    const withLazyCss = {
      ...files,
      'assets/sale-GGG.js':
        'const deps = ["assets/lazy-sheet.css"]; import("./zip-fs-wasm-JJJ.js");',
      'assets/lazy-sheet.css': '',
    };
    const plan = await resolvePrecachePlan({
      routeManifest,
      offlineRouteIds: ['sales/routes/sale'],
      staticUrls: [],
      readChunk: async (url) => withLazyCss[url] ?? null,
    });

    expect(plan.urls).toContain('assets/lazy-sheet.css');
  });

  it('never includes a route that is not declared offline', async () => {
    const plan = await resolvePrecachePlan({
      routeManifest,
      offlineRouteIds: ['sales/routes/sale'],
      staticUrls: [],
      readChunk,
    });

    expect(plan.urls).not.toContain('assets/store-list-HHH.js');
  });

  it('includes the route manifest chunk but never walks it', async () => {
    // The route manifest is a data table naming EVERY route module, including
    // online-only ones. Walking it would pull the whole app back into the
    // install, so it is a leaf: precached, not traversed.
    const withManifest = {
      ...files,
      'assets/manifest-ZZZ.js': '{"routes":{"admin/x":{"module":"/assets/store-list-HHH.js"}}}',
    };
    const plan = await resolvePrecachePlan({
      routeManifest,
      offlineRouteIds: ['sales/routes/sale'],
      staticUrls: [],
      routeManifestUrl: 'assets/manifest-ZZZ.js',
      readChunk: async (url) => withManifest[url] ?? null,
    });

    expect(plan.urls).toContain('assets/manifest-ZZZ.js');
    expect(plan.urls).not.toContain('assets/store-list-HHH.js');
    expect(plan.missingChunks).toEqual([]);
  });

  it('pulls in the assets a precached HTML document references', async () => {
    const withHtml = {
      ...files,
      'index.html':
        '<script src="/pwa-install-capture.js"></script>' +
        '<link rel="modulepreload" href="/assets/manifest-ZZZ.js">' +
        '<link href="/assets/root-DDD.css">',
      'landing.html': '<script src="/assets/bootstrap-0-QQQ.js"></script>',
      'assets/manifest-ZZZ.js': '{"routes":{"admin/x":{"module":"/assets/store-list-HHH.js"}}}',
      'pwa-install-capture.js': '',
      'assets/bootstrap-0-QQQ.js': '',
    };
    const plan = await resolvePrecachePlan({
      routeManifest,
      offlineRouteIds: ['sales/routes/sale'],
      staticUrls: ['index.html', 'landing.html'],
      routeManifestUrl: 'assets/manifest-ZZZ.js',
      readChunk: async (url) => withHtml[url] ?? null,
    });

    expect(plan.urls).toEqual(
      expect.arrayContaining([
        'pwa-install-capture.js',
        'assets/bootstrap-0-QQQ.js',
        'assets/manifest-ZZZ.js',
      ]),
    );
    // The HTML links the route manifest too; walking it would leak every route.
    expect(plan.urls).not.toContain('assets/store-list-HHH.js');
    expect(plan.urls).not.toContain('/login');
  });

  it('never walks the route manifest even when a chunk references it', async () => {
    // The landing bootstrap scripts embed the route-manifest URL, so it can be
    // discovered during the walk. Walking it pulls every route module back in.
    const withLateManifest = {
      ...files,
      'assets/sale-GGG.js': 'import("./manifest-ZZZ.js"); import("./zip-fs-wasm-JJJ.js");',
      'assets/manifest-ZZZ.js':
        '{"routes":{"admin/x":{"module":"/assets/store-list-HHH.js"},"y":{"module":"/assets/web-catalog-AAA.js"}}}',
    };
    const plan = await resolvePrecachePlan({
      routeManifest,
      offlineRouteIds: ['sales/routes/sale'],
      staticUrls: [],
      routeManifestUrl: 'assets/manifest-ZZZ.js',
      readChunk: async (url) => withLateManifest[url] ?? null,
    });

    expect(plan.urls).toContain('assets/manifest-ZZZ.js');
    expect(plan.urls).not.toContain('assets/store-list-HHH.js');
    expect(plan.urls).not.toContain('assets/web-catalog-AAA.js');
  });

  it('reports a declared route id that the manifest does not have', async () => {
    const plan = await resolvePrecachePlan({
      routeManifest,
      offlineRouteIds: ['sales/routes/sale', 'admin/renamed/route'],
      staticUrls: [],
      readChunk,
    });

    expect(plan.unknownRouteIds).toEqual(['admin/renamed/route']);
  });

  it('reports a referenced chunk that is not on disk', async () => {
    const plan = await resolvePrecachePlan({
      routeManifest,
      offlineRouteIds: ['sales/routes/sale'],
      staticUrls: [],
      readChunk: async (url) => (url === 'assets/app-layout-EEE.js' ? null : readChunk(url)),
    });

    expect(plan.missingChunks).toEqual(['assets/app-layout-EEE.js']);
  });
});
