import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { apiFileUrl } from '~/shared/lib/http/media-url';
import type { PublicShowcaseImage } from '~/sales/lib/services/catalog-http-service';

/**
 * Cada cuánto avanza solo el carrusel. Lento a propósito: la portada se LEE, y a esta velocidad
 * una imagen da tiempo a mirarla antes de que la siguiente la tape.
 */
const AUTOPLAY_MS = 5000;

interface CatalogCarouselProps {
  readonly images: readonly PublicShowcaseImage[];
  /** Nombre de la tienda: el texto alternativo cuando la imagen no lleva pie de foto. */
  readonly storeName: string;
}

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
 * Carrusel de cabecera de la carta pública: la portada visual que sube el dueño (F-showncase).
 *
 * Solo se monta cuando hay imágenes — una tienda sin carrusel NO pinta un hueco vacío ni un
 * marco sin contenido—, así que este componente no decide si hay portada: solo la muestra.
 *
 * Avanza solo, y se detiene en cuanto el cliente lo toca (puntero o teclado) porque un
 * carrusel que se mueve mientras se está leyendo es peor que uno quieto. Con movimiento
 * reducido no hay auto-avance: las flechas y los puntos siguen llevando a cualquier imagen,
 * y eso es lo que un lector de pantalla necesita de todas formas.
 */
export function CatalogCarousel({ images, storeName }: CatalogCarouselProps) {
  const intl = useIntl();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion] = useState(readReducedMotion);

  // Las imágenes llegan del config, que se recarga: si la tienda las quita y quedan menos de
  // las que había, el índice se recorta en vez de apuntar a una que ya no existe.
  const active = Math.min(index, images.length - 1);
  const multiple = images.length > 1;

  useEffect(() => {
    if (!multiple || paused || reducedMotion) return;
    const timer = setInterval(() => {
      setIndex((value) => (value + 1) % images.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [images.length, multiple, paused, reducedMotion]);

  const previous = () => setIndex((active - 1 + images.length) % images.length);
  const next = () => setIndex((active + 1) % images.length);

  return (
    <section
      className="relative mx-auto h-56 max-w-5xl overflow-hidden rounded-lg bg-surface shadow-card sm:h-72 lg:h-96"
      aria-label={intl.formatMessage({ id: 'CATALOG_PUBLIC.CAROUSEL_LABEL' })}
      aria-roledescription={intl.formatMessage({ id: 'CATALOG_PUBLIC.CAROUSEL_ROLE' })}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      data-testid="catalog-carousel"
    >
      {/* Todas las imágenes viven montadas y se distinguen por opacidad: así el cambio es un
          fundido y no un parpadeo de `<img>` en blanco. Las que no están activas salen del árbol
          de accesibilidad (`aria-hidden`) y dejan de recibir clics.

          Y se SUPERPONEN (`absolute inset-0`): en flujo normal cada diapositiva —opacidad 0 o no—
          reservaba su propia altura, así que el marco medía N×alto, la imagen visible saltaba de
          posición al cambiar y las flechas (`top-1/2`) y los puntos (`bottom-2`) quedaban
          anclados al fondo de toda la pila. Con la altura fija del `<section>` y las
          diapositivas superpuestas, el marco mide UNA imagen y los controles se centran en él.
          El pie de foto sigue funcionando: su `relative` ahora es la propia diapositiva. */}
      {images.map((image, position) => {
        const isActive = position === active;
        return (
          <div
            key={image.url}
            className={`absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none ${
              isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            role="group"
            aria-roledescription={intl.formatMessage({ id: 'CATALOG_PUBLIC.CAROUSEL_SLIDE_ROLE' })}
            aria-label={intl.formatMessage(
              { id: 'CATALOG_PUBLIC.CAROUSEL_SLIDE' },
              { index: position + 1, total: images.length },
            )}
            aria-hidden={!isActive}
            data-testid={`catalog-carousel-slide-${position}`}
          >
            <div className="relative h-full">
              <img
                src={apiFileUrl(image.url)}
                // El pie de foto describe la foto mejor que el nombre de la tienda; sin pie de
                // foto, la tienda es lo único que se sabe de ella.
                alt={image.caption || storeName}
                className="h-full w-full object-cover"
                data-testid={`catalog-carousel-image-${position}`}
              />
              {image.caption && (
                <p
                  className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-8 pt-10 text-sm font-medium text-white sm:text-base"
                  data-testid={`catalog-carousel-caption-${position}`}
                >
                  {image.caption}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {multiple && (
        <>
          <button
            type="button"
            onClick={previous}
            aria-label={intl.formatMessage({ id: 'CATALOG_PUBLIC.CAROUSEL_PREVIOUS' })}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-xl leading-none text-white hover:bg-black/70"
            data-testid="catalog-carousel-previous"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label={intl.formatMessage({ id: 'CATALOG_PUBLIC.CAROUSEL_NEXT' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-xl leading-none text-white hover:bg-black/70"
            data-testid="catalog-carousel-next"
          >
            <span aria-hidden="true">›</span>
          </button>
          {/* Puntos = acceso DIRECTO a cada imagen: quien no quiere esperar cinco segundos
              puede saltar a la que le interesa. */}
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2">
            {images.map((image, position) => (
              <button
                key={image.url}
                type="button"
                onClick={() => setIndex(position)}
                aria-label={intl.formatMessage(
                  { id: 'CATALOG_PUBLIC.CAROUSEL_DOT' },
                  { index: position + 1 },
                )}
                aria-current={position === active}
                className={`h-2.5 w-2.5 rounded-full ${
                  position === active ? 'bg-white' : 'bg-white/60 hover:bg-white/80'
                }`}
                data-testid={`catalog-carousel-dot-${position}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}