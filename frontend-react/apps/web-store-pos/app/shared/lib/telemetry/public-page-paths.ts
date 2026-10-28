/**
 * Lista CERRADA de páginas públicas del sitio que se miden. Es la única copia del lado cliente;
 * el servidor valida otra vez contra `SiteEventCatalog` (nunca confía en el path que llega).
 *
 * Fuera a propósito: `/help/tutorial`, `/diagnostics`, `/auth/provision`, el 404, el catálogo
 * público (ya tiene su propia telemetría por tienda) y cualquier ruta autenticada.
 */
const TRACKED_PUBLIC_PAGES = [
  '/',
  '/login',
  '/register',
  '/private-police',
  '/terms-conditions',
] as const;

export type TrackedPublicPage = (typeof TRACKED_PUBLIC_PAGES)[number];

/**
 * Devuelve la página canónica cuando se mide, o `null` cuando no. Normaliza la barra final y
 * descarta query y fragmento, porque `useLocation().pathname` ya viene limpio pero esta función
 * también recibe paths de `window.location` y hrefs copiados.
 */
export function trackedPublicPage(pathname: string): TrackedPublicPage | null {
  const route = pathname.split(/[?#]/)[0] ?? '';
  const normalized = route.length > 1 ? route.replace(/\/+$/, '') : route;
  return (TRACKED_PUBLIC_PAGES as readonly string[]).includes(normalized)
    ? (normalized as TrackedPublicPage)
    : null;
}
