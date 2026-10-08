import { useId } from 'react';
import { useIntl } from 'react-intl';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import type { PublicShowcaseImage } from '~/sales/lib/services/catalog-http-service';

interface CatalogDailyProps {
  readonly images: readonly PublicShowcaseImage[];
  /** Nombre de la tienda: el texto alternativo cuando la imagen no lleva pie de foto. */
  readonly storeName: string;
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
export function CatalogDaily({ images, storeName }: CatalogDailyProps) {
  const intl = useIntl();
  const titleId = useId();

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