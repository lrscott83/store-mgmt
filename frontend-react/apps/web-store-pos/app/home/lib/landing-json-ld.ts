import type { PublicPlanPricing } from './public-plan-pricing';
import {
  SCHEMA_TYPE_OFFER,
  SCHEMA_TYPE_SOFTWARE_APPLICATION,
} from '../../../scripts/landing-schema.mjs';

export interface LandingOffer {
  readonly name: string;
  readonly price: string;
  readonly priceCurrency: string;
}

const JSON_LD_SELECTOR = 'script[type="application/ld+json"]';

export const PRICE_CURRENCY = 'USD';

/**
 * Planes reales -> `Offer` de schema.org, ordenados por `order` y con el precio en USD que paga la
 * tienda (`currentPrice`). Un precio no numerico o negativo se descarta: publicar un `price` basura
 * invalida el bloque entero para los validadores.
 */
export function buildPlanOffers(plans: readonly PublicPlanPricing[]): LandingOffer[] {
  return [...plans]
    .filter((plan) => Number.isFinite(plan.currentPrice) && plan.currentPrice >= 0)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'))
    .map((plan) => ({
      name: plan.name,
      price: plan.currentPrice.toFixed(2),
      priceCurrency: PRICE_CURRENCY,
    }));
}

/**
 * Refleja los precios vivos en el JSON-LD que el build ya inyecto en `landing.html`. El bloque base
 * (Organization + SoftwareApplication) es estatico; `offers` se completa aqui porque los precios
 * viven en la API y congelarlos en el build los dejaria desactualizados en silencio.
 *
 * No crea el script si no existe (dev server): sin JSON-LD previo no se publica un esquema parcial.
 * Idempotente: una segunda llamada reemplaza `offers`. Cualquier anomalia deja el documento intacto.
 */
export function applyPlanOffersToDocument(
  plans: readonly PublicPlanPricing[],
  doc?: Document,
): void {
  const target = doc ?? (typeof document === 'undefined' ? null : document);
  if (!target) return;

  const offers = buildPlanOffers(plans);
  if (offers.length === 0) return;

  const script = target.querySelector<HTMLScriptElement>(JSON_LD_SELECTOR);
  if (!script) return;

  let payload: unknown;
  try {
    payload = JSON.parse(script.textContent ?? '');
  } catch {
    return;
  }

  const graph = readGraph(payload);
  const application = graph.find((node) => node['@type'] === SCHEMA_TYPE_SOFTWARE_APPLICATION);
  if (!application) return;

  application['offers'] = offers.map((offer) => ({ '@type': SCHEMA_TYPE_OFFER, ...offer }));

  // Mismo escape que el build: un `</script>` literal dentro del JSON cerraria el elemento.
  script.textContent = JSON.stringify(payload).replace(/</g, '\\u003c');
}

function readGraph(payload: unknown): Array<Record<string, unknown>> {
  if (typeof payload !== 'object' || payload === null) return [];

  const graph = (payload as Record<string, unknown>)['@graph'];
  if (Array.isArray(graph)) {
    return graph.filter(
      (node): node is Record<string, unknown> => typeof node === 'object' && node !== null,
    );
  }

  return [payload as Record<string, unknown>];
}
