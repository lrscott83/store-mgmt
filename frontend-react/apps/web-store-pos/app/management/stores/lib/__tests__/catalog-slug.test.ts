import { describe, expect, it } from 'vitest';
import { normalizeCatalogSlug, MAX_CATALOG_SLUG_LENGTH } from '~/management/stores/lib/catalog-slug';

/**
 * Espejo en cliente de `Domain/Common/Catalog/SlugNormalizer`: la previsualización del modal debe
 * enseñar EXACTAMENTE lo que el backend va a guardar. La única diferencia deliberada es el vacío:
 * el backend cae a "catalogo" al AUTOGENERAR, el cliente devuelve '' y bloquea el guardado.
 */
describe('normalizeCatalogSlug', () => {
  it('pasa a minúsculas, quita tildes y colapsa separadores', () => {
    expect(normalizeCatalogSlug('Café & Té')).toBe('cafe-te');
    expect(normalizeCatalogSlug('Ñoño ÑÁÉÍÓÚ')).toBe('nono-naeiou');
    expect(normalizeCatalogSlug('  Mi Tienda  ')).toBe('mi-tienda');
    expect(normalizeCatalogSlug('Ropa--de---niño')).toBe('ropa-de-nino');
  });

  it('no deja guiones al borde', () => {
    expect(normalizeCatalogSlug('-ropa-')).toBe('ropa');
  });

  it('recorta al máximo y vuelve a quitar el guion del borde', () => {
    const slug = normalizeCatalogSlug('a'.repeat(MAX_CATALOG_SLUG_LENGTH + 5));
    expect(slug).toHaveLength(MAX_CATALOG_SLUG_LENGTH);
  });

  it('devuelve vacío cuando no queda ningún carácter válido (no inventa "catalogo")', () => {
    expect(normalizeCatalogSlug('')).toBe('');
    expect(normalizeCatalogSlug('   ')).toBe('');
    expect(normalizeCatalogSlug('???')).toBe('');
  });
});
