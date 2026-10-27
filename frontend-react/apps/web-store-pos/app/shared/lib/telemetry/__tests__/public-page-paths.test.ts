import { describe, expect, it } from 'vitest';
import { trackedPublicPage } from '../public-page-paths';

describe('trackedPublicPage — lista cerrada de páginas públicas medidas', () => {
  it.each(['/', '/login', '/register', '/private-police', '/terms-conditions'])(
    'acepta %s',
    (path) => {
      expect(trackedPublicPage(path)).toBe(path);
    },
  );

  it('normaliza la barra final y descarta query y fragmento', () => {
    expect(trackedPublicPage('/login/')).toBe('/login');
    expect(trackedPublicPage('/register?utm_source=fb')).toBe('/register');
    expect(trackedPublicPage('/terms-conditions#top')).toBe('/terms-conditions');
  });

  it.each([
    '/help/tutorial',
    '/diagnostics',
    '/auth/provision',
    '/catalog/mi-tienda',
    '/sales/new',
    '/api/manual/',
    '/no-existe',
    '',
  ])('rechaza %s', (path) => {
    expect(trackedPublicPage(path)).toBeNull();
  });
});
