import { useId, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import type { PublicShowcaseImage } from '~/sales/lib/services/catalog-http-service';

interface CatalogDailyProps {
  readonly images: readonly PublicShowcaseImage[];
  /** Nombre de la tienda: el texto alternativo cuando la imagen no lleva pie de foto. */
  readonly storeName: string;
  /**
   * `cards` = la rejilla de tarjetas recortadas de siempre; `productCarousel` = una tira
   * horizontal de fotos COMPLETAS con flechas, para una carta que muestra productos.
   *
   * Es opcional y su valor por defecto es `cards`: la plantilla `boutique` comparte este
   * componente y tiene que quedarse exactamente como estaba.
   */
  readonly variant?: 'cards' | 'productCarousel';
}

/** Separación entre tarjetas de la tira: `gap-3` son 12 px, y eso es lo que mide el salto. */
const CARD_GAP_PX = 12;

/**
 * `prefers-reduced-motion` del SISTEMA. Se lee una sola vez al montar y sin suscripción: es
 * una preferencia del dispositivo, no algo que cambie mientras se mira el catálogo, y
 * `window` no existe en el render de servidor.
 */
function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Imágenes del día: el bloque de DESTACADOS que el dueño rota a mano (decisión C4, sin
 * caducidad por fecha) sin tocar el catálogo.
 *
 * Conjunto independiente del carrusel (C1): van los dos, va uno o ninguno, así que este bloque
 * solo se monta si hay algo que enseñar. Va arriba, debajo de la cabecera, para que se lea como
 * lo que es —una vitrina— y no como otra rejilla de productos más abajo.
 *
 * En móvil las tarjetas se desplazan en horizontal en vez de encogerse: una imagen estrecha y de
 * poca altura no dice nada, y el desplazamiento conserva el tamaño con el que el dueño la pensó.
 */
export function CatalogDaily({ images, storeName, variant = 'cards' }: CatalogDailyProps) {
  const intl = useIntl();
  const titleId = useId();

  /**
   * La tira de `productCarousel`, para poder desplazar UNA tarjeta por pulsación de flecha.
   * Es una referencia y no un `querySelector` por el mismo motivo que la rejilla del catálogo:
   * el objetivo es el elemento que este componente pinta.
   */
  const trackRef = useRef<HTMLUListElement>(null);
  const [reducedMotion] = useState(readReducedMotion);

  /**
   * Avanza o retrocede una tarjeta. El salto se mide sobre la PRIMERA tarjeta real, no sobre
   * un ancho supuesto: las tarjetas se reparten en fracciones del ancho disponible y cambian
   * de tamaño con el viewport, así que un `1/3` calculado a ojo deja la siguiente a medias.
   */
  const scrollByCard = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = track?.firstElementChild as HTMLElement | null | undefined;
    if (!track || !card) return;
    track.scrollBy({
      left: direction * (card.getBoundingClientRect().width + CARD_GAP_PX),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  // La variante de tira se parece a la rejilla pero NO es la misma cosa: por eso son dos
  // markups y no un `className` con condiciones. `cards` queda byte a byte como estaba.
  if (variant === 'productCarousel') {
    const multiple = images.length > 1;

    return (
      <section aria-labelledby={titleId} data-testid="catalog-daily">
        {/* Título y flechas en la MISMA fila: el control vive junto a lo que mueve, no
            flotando encima de las imágenes. */}
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-sm font-semibold tracking-wide text-primary uppercase">
            {intl.formatMessage({ id: 'CATALOG_PUBLIC.DAILY_TITLE' })}
          </h2>
          {/* Con una sola foto no hay a dónde ir: el control sería ruido. En móvil la tira se
              arrastra con el dedo y las flechas estorban. */}
          {multiple && (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => scrollByCard(-1)}
                aria-label={intl.formatMessage({ id: 'CATALOG_PUBLIC.CAROUSEL_PREVIOUS' })}
                className="rounded-full border border-border bg-surface px-3 py-1 text-xl leading-none text-text transition-colors hover:bg-primary-light"
                data-testid="catalog-daily-previous"
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                onClick={() => scrollByCard(1)}
                aria-label={intl.formatMessage({ id: 'CATALOG_PUBLIC.CAROUSEL_NEXT' })}
                className="rounded-full border border-border bg-surface px-3 py-1 text-xl leading-none text-text transition-colors hover:bg-primary-light"
                data-testid="catalog-daily-next"
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
          )}
        </div>

        {/* Tira con anclaje: cada tarjeta empieza justo donde termina la anterior, y el
            desplazamiento para en la tarjeta, no en mitad de ella. */}
        <ul
          ref={trackRef}
          className="mt-3 flex snap-x gap-3 overflow-x-auto pb-1 no-scrollbar"
          data-testid="catalog-daily-track"
        >
          {images.map((image, position) => (
            <li key={image.url} className="w-1/2 shrink-0 snap-start sm:w-1/3 lg:w-1/4">
              <figure className="overflow-hidden rounded-md border border-border bg-surface">
                {/* `object-contain` sobre un cuadrado: la foto del dueño se ve COMPLETA. Con
                    `object-cover` lo que se enseñaba era un recorte, y para una carta de
                    productos eso es el producto equivocado. */}
                <img
                  src={apiFileUrl(image.url)}
                  alt={image.caption || storeName}
                  className="aspect-square w-full bg-background object-contain"
                  data-testid={`catalog-daily-image-${position}`}
                />
                {image.caption && (
                  <figcaption
                    className="px-3 py-2 text-xs text-text"
                    data-testid={`catalog-daily-caption-${position}`}
                  >
                    {image.caption}
                  </figcaption>
                )}
              </figure>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-primary/30 bg-surface p-3 shadow-card sm:p-4"
      aria-labelledby={titleId}
      data-testid="catalog-daily"
    >
      <h2 id={titleId} className="text-sm font-semibold tracking-wide text-primary uppercase">
        {intl.formatMessage({ id: 'CATALOG_PUBLIC.DAILY_TITLE' })}
      </h2>
      <ul className="mt-3 flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-x-visible">
        {images.map((image, position) => (
          <li key={image.url} className="w-2/3 shrink-0 snap-start sm:w-auto">
            <figure className="overflow-hidden rounded-md border border-border bg-surface">
              <img
                src={apiFileUrl(image.url)}
                alt={image.caption || storeName}
                className="h-40 w-full object-cover"
                data-testid={`catalog-daily-image-${position}`}
              />
              {image.caption && (
                <figcaption
                  className="px-3 py-2 text-xs text-text"
                  data-testid={`catalog-daily-caption-${position}`}
                >
                  {image.caption}
                </figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
