import { describe, expect, it } from 'vitest';
import { findCanonicalViolations } from './check-public-canonical.mjs';

const BASE = 'https://pos.tudominio.com';

function html({ canonical = `${BASE}/`, ogUrl = `${BASE}/`, ogImage = `${BASE}/og-image.png` } = {}) {
  return (
    '<html><head>' +
    (canonical ? `<link rel="canonical" href="${canonical}" />` : '') +
    (ogUrl ? `<meta property="og:url" content="${ogUrl}" />` : '') +
    (ogImage ? `<meta property="og:image" content="${ogImage}" />` : '') +
    '</head><body></body></html>'
  );
}

describe('findCanonicalViolations', () => {
  it('accepts a document whose canonical, og:url and og:image point at the expected host', () => {
    expect(findCanonicalViolations(html(), BASE)).toEqual([]);
  });

  it('reports a canonical left pointing at the playground host', () => {
    expect(
      findCanonicalViolations(html({ canonical: 'https://pos.playground.sceiba.net/' }), BASE),
    ).toEqual([
      'canonical apunta a https://pos.playground.sceiba.net, se esperaba https://pos.tudominio.com',
    ]);
  });

  it('reports og:url and og:image pointing at the wrong host', () => {
    const violations = findCanonicalViolations(
      html({
        ogUrl: 'https://pos.playground.sceiba.net/',
        ogImage: 'https://pos.playground.sceiba.net/og-image.png',
      }),
      BASE,
    );

    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain('og:url apunta a');
    expect(violations[1]).toContain('og:image apunta a');
  });

  it('reports a document with no SEO head at all', () => {
    expect(findCanonicalViolations(html({ canonical: '', ogUrl: '', ogImage: '' }), BASE)).toEqual([
      'el HTML no publica <link rel="canonical">',
      'el HTML no publica og:url',
      'el HTML no publica og:image',
    ]);
  });

  it('ignores the path: only the origin has to match', () => {
    expect(
      findCanonicalViolations(html({ canonical: `${BASE}/otra/ruta` }), BASE),
    ).toEqual([]);
  });
});
