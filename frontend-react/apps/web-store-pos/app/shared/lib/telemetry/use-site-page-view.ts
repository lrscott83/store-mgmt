import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { trackedPublicPage } from './public-page-paths';
import { trackSitePageView } from './site-page-view';

/**
 * Registra una vista por navegación a una página pública medida (landing, login, register y
 * legales). Se monta UNA vez desde `root.tsx`, dentro del router.
 *
 * Filtra con `trackedPublicPage` (la lista cerrada) antes de llamar al tracker, y el tracker
 * vuelve a validar: el path nunca se manda sin pasar por la regla.
 *
 * El `ref` compara el pathname, no un contador: React 19 en StrictMode monta, desmonta y vuelve
 * a montar los efectos en desarrollo, y sin esta guarda cada página contaría doble ahí. Navegar
 * de vuelta a la misma página SÍ vuelve a contar, porque entre medias el pathname cambió.
 */
export function useSitePageView(): void {
  const { pathname } = useLocation();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    const page = trackedPublicPage(pathname);
    if (!page) return;
    trackSitePageView(page);
  }, [pathname]);
}
