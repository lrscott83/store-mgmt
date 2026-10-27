import { trackedPublicPage } from './public-page-paths';

/**
 * Telemetría anónima de las páginas públicas del sitio (landing, login, register y legales).
 * Fire-and-forget: el visitante nunca espera a que el evento se registre y un fallo de red no
 * rompe la página.
 *
 * No usa cookies ni guarda identificadores en el navegador. El servidor calcula las huellas
 * (visitante diario / sesión de 30 minutos) desde la IP y el User-Agent; aquí solo viajan el
 * nombre del evento, la ruta canónica, el referrer y los UTM.
 *
 * El manual de usuario NO se mide desde aquí: son archivos estáticos que cuenta el backend.
 */

const API_URL = (import.meta.env['API_URL'] as string | undefined) ?? '';

interface SitePageViewPayload {
  name: 'page_view';
  path: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

function utmFromLocation(): Pick<SitePageViewPayload, 'utmSource' | 'utmMedium' | 'utmCampaign'> {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get('utm_source') ?? undefined,
    utmMedium: params.get('utm_medium') ?? undefined,
    utmCampaign: params.get('utm_campaign') ?? undefined,
  };
}

/** `navigator.doNotTrack` es '1' en navegadores modernos y 'yes' en algunos legacy. */
function doNotTrackEnabled(): boolean {
  const legacyWindow = window as typeof window & { doNotTrack?: string | null };
  const doNotTrack = navigator.doNotTrack ?? legacyWindow.doNotTrack;
  return doNotTrack === '1' || doNotTrack === 'yes';
}

/**
 * Envía UN page_view. Nunca lanza: la telemetría es un extra, no un requisito para ver la página.
 * Revalida el path contra la lista cerrada para que un llamador no pueda ampliarla por accidente.
 */
export function trackSitePageView(path: string): void {
  if (typeof window === 'undefined') return;
  if (doNotTrackEnabled()) return;

  const page = trackedPublicPage(path);
  if (!page) return;

  const payload: SitePageViewPayload = {
    name: 'page_view',
    path: page,
    ...(document.referrer ? { referrer: document.referrer } : {}),
    ...utmFromLocation(),
  };

  try {
    void fetch(`${API_URL}/v1/public/site/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [payload] }),
      keepalive: true,
    }).catch((err: unknown) => {
      // Best-effort: no hay UI que corregir ni reintento que valga la pena, pero una caída del
      // endpoint no puede ser invisible.
      console.warn('[site-telemetry] evento descartado', page, err);
    });
  } catch (err) {
    // `fetch` ausente o una URL inválida: la página sigue funcionando.
    console.warn('[site-telemetry] no se pudo enviar el evento', page, err);
  }
}
