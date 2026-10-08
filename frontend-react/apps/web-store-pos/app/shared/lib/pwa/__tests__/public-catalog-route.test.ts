import { describe, it, expect } from 'vitest';
import { isPublicCatalogPath } from '../public-catalog-route';

// ── public-catalog-route ─────────────────────────────────────────────────────
// La regla "esta ruta es la carta del cliente final, no el POS" necesita UN solo sitio.
// Antes vivía como un `startsWith('/catalog/')` suelto en root.tsx (que ocultaba el botón
// "Instalar App") y el `registerServiceWorker()` de tres líneas más abajo se olvidó de ella:
// por eso el diálogo "¡Nueva versión disponible!" salía ante un visitante anónimo.
//
// Esta matriz es el contrato de esa regla única en los dos sentidos: un falso NEGATIVO (tratar
// el catálogo como si fuera el POS) es el bug que se corrigió; un falso POSITIVO (tratar el POS
// como si fuera el catálogo) dejaría al POS sin service worker y sin aviso de versión.

interface Case {
  readonly pathname: string;
  readonly expected: boolean;
}

const CASES: readonly Case[] = [
  // ── ES el catálogo público ────────────────────────────────────────────────
  { pathname: '/catalog', expected: true },
  { pathname: '/catalog/', expected: true },
  { pathname: '/catalog/mi-tienda', expected: true },
  { pathname: '/catalog/mi-tienda/', expected: true },
  // Bajo `/catalog/<slug>` no hay rutas hijas hoy, pero una URL más profunda sigue siendo el
  // catálogo público: la regla debe seguir diciendo que sí.
  { pathname: '/catalog/mi-tienda/cualquier/hoja', expected: true },

  // ── NO es el catálogo público: el POS y sus casi-aciertos ─────────────────
  { pathname: '/', expected: false },
  { pathname: '/login', expected: false },
  { pathname: '/sales/new', expected: false },
  { pathname: '/help/tutorial', expected: false },
  { pathname: '', expected: false },
  // Contiene "catalog" pero es la ADMIN del módulo (ruta autenticada del POS).
  { pathname: '/sales/web-catalog', expected: false },
  { pathname: '/admin/modules', expected: false },
  // Prefijo sin frontera: "/catalogo" y "/catalog-admin" sólo empiezan como "/catalog".
  { pathname: '/catalogo', expected: false },
  { pathname: '/catalogo/mi-tienda', expected: false },
  { pathname: '/catalog-admin', expected: false },
  // Un href relativo desde /sales resolvería aquí: no es el catálogo público.
  { pathname: '/sales/catalog/mi-tienda', expected: false },
  // React Router hace match de rutas sensible a mayúsculas.
  { pathname: '/Catalog/mi-tienda', expected: false },
];

describe('isPublicCatalogPath', () => {
  it.each(CASES)('$pathname → $expected', ({ pathname, expected }) => {
    expect(isPublicCatalogPath(pathname)).toBe(expected);
  });

  it('ignora query string y hash: lo que se compara es la ruta, no la URL completa', () => {
    expect(isPublicCatalogPath('/catalog/mi-tienda?utm=whatsapp')).toBe(true);
    expect(isPublicCatalogPath('/catalog/mi-tienda#productos')).toBe(true);
    // ...y el recorte no arrastra a las rutas del POS.
    expect(isPublicCatalogPath('/sales/web-catalog?tab=general')).toBe(false);
  });
});
