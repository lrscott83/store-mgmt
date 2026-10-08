/** Segmento raíz del catálogo público (`routes.ts:36`: `route('catalog/:storeSlug', …)`). */
const PUBLIC_CATALOG_SEGMENT = '/catalog';

/**
 * ¿Es esta ruta el catálogo PÚBLICO de una tienda (`/catalog/<slug>`)?
 *
 * El catálogo público es la carta del cliente final: una página anónima, ajena al POS
 * (`routes.ts:36` la monta top-level, sin `authLoader`, y `PublicCatalogController` la sirve
 * sin sesión). Por eso ahí no se ofrece instalar la app del POS ni se cablea su service worker:
 * un "¡Nueva versión disponible!" no le significa nada a quien nunca abre el POS, y encima es
 * un diálogo BLOQUEANTE.
 *
 * ESTA ES LA ÚNICA COPIA DE LA REGLA. Antes vivía como un `pathname.startsWith('/catalog/')`
 * suelto en `root.tsx` (que ocultaba el botón "Instalar App") y el `registerServiceWorker()`
 * de tres líneas más abajo se olvidó de él: la excepción se aplicó en un sitio y no en el
 * otro. Dos copias del mismo `startsWith` divergen en el próximo cambio; una función con
 * nombre y testeada hace que la excepción sea una sola cosa.
 *
 * Predicado puro a propósito —sin React, sin `window`— para que lo puedan llamar tanto
 * `root.tsx` (con el `pathname` del router) como el handler de `onNeedRefresh` (con
 * `window.location.pathname`) sin que uno dependa del otro.
 */
export function isPublicCatalogPath(pathname: string): boolean {
  // `useLocation().pathname` ya viene sin query, pero esta función también recibe URLs de
  // `window.location` y hrefs copiados: se recorta en el borde, no en el llamador.
  const route = pathname.split(/[?#]/)[0] ?? '';
  // `/catalog` y `/catalog/` son la misma ruta. Sin normalizar la barra final, el prefijo con
  // barra colgante dejaría fuera `/catalog/` (y `/catalog`, que además no matchea el prefijo).
  const normalized = route.replace(/\/+$/, '');
  return (
    normalized === PUBLIC_CATALOG_SEGMENT || normalized.startsWith(`${PUBLIC_CATALOG_SEGMENT}/`)
  );
}
