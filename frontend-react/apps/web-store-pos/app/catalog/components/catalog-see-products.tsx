import { useState } from 'react';
import type { RefObject } from 'react';
import { useIntl } from 'react-intl';

interface CatalogSeeProductsProps {
  /** El elemento al que se baja: la rejilla de productos de esta carta. */
  readonly targetRef: RefObject<HTMLElement | null>;
}

/**
 * `prefers-reduced-motion` del SISTEMA, leído UNA vez y sin suscripción (mismo criterio que el
 * carrusel): es una preferencia del dispositivo, no algo que cambie mientras se mira la carta, y
 * `window` no existe en el render de servidor.
 */
function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Botón flotante "Ver Productos": baja a la rejilla sin que el cliente recorra la portada.
 *
 * Va FIJO en el borde inferior y por debajo de los modales (`z-30` frente al `z-50` de `Modal`):
 * el carrito y el checkout se abren encima, así que nunca quedan tapados ni se mezclan con sus
 * controles. No aparece y desaparece al hacer scroll —un botón que huye es peor que uno
 * quieto—: quien ya llegó a la rejilla lo pasa por encima con el dedo o lo deja estar.
 */
export function CatalogSeeProducts({ targetRef }: CatalogSeeProductsProps) {
  const intl = useIntl();
  // La animación se decide en JS y NO solo con `motion-reduce:`, para que sea comprobable en un
  // test de comportamiento (jsdom no aplica media queries). La clase `motion-reduce:animate-none`
  // se conserva como red de seguridad para el HTML sin JS y para el primer render del servidor.
  const [reducedMotion] = useState(readReducedMotion);

  function scrollToProducts() {
    targetRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      {/* El halo pulsante va POR DEBAJO del texto (`-z-10` sobre un contenedor aislado) para
          poder animarse sin que el botón ocupe su sitio: un botón que "bota" mientras se
          apunta a él es un botón al que cuesta acertar. Con movimiento reducido el halo se
          apaga; el botón deja de pedir atención y sigue haciendo su trabajo. */}
      <button
        type="button"
        onClick={scrollToProducts}
        className="pointer-events-auto relative isolate inline-flex items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        data-testid="catalog-see-products"
      >
        <span
          aria-hidden="true"
          data-reduced-motion={reducedMotion ? 'true' : undefined}
          className={`absolute inset-0 -z-10 rounded-full bg-primary/50 motion-reduce:animate-none ${
            reducedMotion ? '' : 'animate-ping'
          }`}
        />
        {intl.formatMessage({ id: 'CATALOG_PUBLIC.SEE_PRODUCTS' })}
      </button>
    </div>
  );
}