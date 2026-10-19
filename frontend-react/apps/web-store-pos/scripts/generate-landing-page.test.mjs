import { describe, expect, it } from 'vitest';
import { injectLandingMeta, LANDING_META, resolveBaseUrl } from './generate-landing-page.mjs';

const SHELL =
  '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>' +
  '<link rel="icon" href="/favicon.png"/></head>' +
  '<body><div id="root"></div></body></html>';

const BASE = 'https://pos.playground.sceiba.net';

describe('injectLandingMeta', () => {
  it('inserts the landing metadata inside head and leaves the body untouched', () => {
    const html = injectLandingMeta(SHELL, { baseUrl: BASE });

    expect(html).toContain(`<title>${LANDING_META.title}</title>`);
    expect(html).toContain(`<meta name="description" content="${LANDING_META.description}" />`);
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain(`<meta property="og:title" content="${LANDING_META.title}" />`);
    expect(html).toContain(`<meta property="og:site_name" content="${LANDING_META.siteName}" />`);
    expect(html).toContain('<meta property="og:locale" content="es_ES" />');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');

    expect(html.indexOf('<title>')).toBeLessThan(html.indexOf('</head>'));
    expect(html).toContain('<meta charset="utf-8"/>');
    expect(html).toContain('<link rel="icon" href="/favicon.png"/>');
    expect(html.endsWith('<body><div id="root"></div></body></html>')).toBe(true);
  });

  it('uses absolute canonical and og:url derived from the base URL', () => {
    const html = injectLandingMeta(SHELL, { baseUrl: BASE });

    expect(html).toContain(`<link rel="canonical" href="${BASE}/" />`);
    expect(html).toContain(`<meta property="og:url" content="${BASE}/" />`);
    expect(html).toContain(
      `<meta property="og:image" content="${BASE}${LANDING_META.imagePath}" />`,
    );
  });

  it('normalizes a trailing slash in the base URL', () => {
    const html = injectLandingMeta(SHELL, { baseUrl: `${BASE}/` });

    expect(html).toContain(`<link rel="canonical" href="${BASE}/" />`);
    expect(html).not.toContain(`${BASE}//`);
  });

  it('replaces an existing title and description instead of duplicating them', () => {
    const shell =
      '<html><head><title>Viejo</title>' +
      "<meta name='description' content='vieja'/></head><body></body></html>";

    const html = injectLandingMeta(shell, { baseUrl: BASE });

    expect(html).not.toContain('Viejo');
    expect(html).not.toContain('vieja');
    expect(html.split('<title>')).toHaveLength(2);
    expect(html.split('name="description"')).toHaveLength(2);
  });

  it('escapes HTML characters in attributes', () => {
    const html = injectLandingMeta(SHELL, {
      baseUrl: BASE,
      meta: { title: 'Casa "Pepe" & Cía <br>', description: 'Pizza & pasta <3' },
    });

    expect(html).toContain('<title>Casa "Pepe" &amp; Cía &lt;br&gt;</title>');
    expect(html).toContain('content="Pizza &amp; pasta &lt;3"');
    expect(html).toContain('content="Casa &quot;Pepe&quot; &amp; Cía &lt;br&gt;"');
    expect(html).not.toContain('<br>');
  });

  it('throws when the shell has no </head>', () => {
    expect(() => injectLandingMeta('<html><body></body></html>', { baseUrl: BASE })).toThrow(
      /no <\/head>/,
    );
  });

  it('rejects a non-http base URL', () => {
    expect(() => resolveBaseUrl('pos.playground.sceiba.net')).toThrow(/http/);
  });
});
