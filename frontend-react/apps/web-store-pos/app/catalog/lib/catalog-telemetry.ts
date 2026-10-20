/**
 * Telemetría anónima del catálogo público. Fire-and-forget: el visitante nunca espera a que el
 * evento se registre y un fallo de red no rompe la carta.
 *
 * No usa cookies ni guarda identificadores en el navegador. El servidor calcula las huellas
 * (visitante diario / sesión de 30 minutos) desde la IP y el User-Agent; aquí solo viajan el
 * nombre del evento, la ruta, el producto (si aplica), el referrer y los UTM.
 */

const API_URL = (import.meta.env['API_URL'] as string | undefined) ?? '';

export type CatalogTelemetryEventName =
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_open';

export interface CatalogTelemetryEvent {
  readonly name: CatalogTelemetryEventName;
  /** Ruta sin query. Por defecto, la ruta actual del navegador. */
  readonly path?: string;
  /** Solo en `product_view` y `add_to_cart`. */
  readonly productId?: string;
}

interface TelemetryPayloadEvent {
  name: CatalogTelemetryEventName;
  path: string;
  productId?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

function utmFromLocation(): Pick<
  TelemetryPayloadEvent,
  'utmSource' | 'utmMedium' | 'utmCampaign'
> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get('utm_source') ?? undefined,
    utmMedium: params.get('utm_medium') ?? undefined,
    utmCampaign: params.get('utm_campaign') ?? undefined,
  };
}

/**
 * Envía UN evento. Se llama desde el storefront y nunca lanza: la telemetría es un extra, no un
 * requisito para ver el catálogo ni para pedir.
 */
export function trackCatalogEvent(storeSlug: string, event: CatalogTelemetryEvent): void {
  if (typeof window === 'undefined') return;
  if (navigator.doNotTrack === '1') return;

  const payload: TelemetryPayloadEvent = {
    name: event.name,
    path: event.path ?? window.location.pathname,
    ...(event.productId ? { productId: event.productId } : {}),
    ...(document.referrer ? { referrer: document.referrer } : {}),
    ...utmFromLocation(),
  };

  try {
    void fetch(`${API_URL}/v1/public/catalog/${encodeURIComponent(storeSlug)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [payload] }),
      keepalive: true,
    }).catch(() => {
      // Best-effort: no hay UI que corregir ni reintento que valga la pena.
    });
  } catch {
    // `fetch` ausente o una URL inválida: el catálogo sigue funcionando.
  }
}
