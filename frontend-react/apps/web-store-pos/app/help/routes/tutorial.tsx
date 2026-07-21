import { useState } from 'react';
import { useIntl } from 'react-intl';
import { ChevronDownIcon } from '~/shared/components/ui/icons';

const STEPS = [
  {
    title: '1. Adicionar un producto al catálogo.',
    content: (
      <>
        <p>
          1.1 Abrir el menú y en la sección Venta tocar en Productos.
        </p>
        <img src="/images/help/menu.png" alt="Menú principal" className="my-2 max-w-full" />
        <p>
          1.2 Tocar el botón + Categoría para adicionar una nueva Categoría si no está adicionada.
          Escribir el nombre de la categoría y tocar el botón Salvar.
        </p>
        <img src="/images/help/add-cat-dialog.png" alt="Adicionar categoría" className="my-2 max-w-full" />
        <p>
          1.3 Tocar la flecha hacia abajo para desplegar la Categoría y tocar el botón + Producto.
        </p>
        <img src="/images/help/add-product-btn.png" alt="Botón agregar producto" className="my-2 max-w-full" />
        <p>
          1.4 Escribir el nombre y precio del producto y tocar el botón Salvar.
        </p>
        <img src="/images/help/add-product-dialog.png" alt="Diálogo agregar producto" className="my-2 max-w-full" />
      </>
    ),
  },
  {
    title: '2. Adicionar una entrada al inventario.',
    content: (
      <>
        <p>
          2.1 Abrir el menú y en la sección Inventario tocar en Entradas.
        </p>
        <p>2.2 Tocar el botón + Entrada para adicionar una entrada en el Inventario de un producto.</p>
        <p>2.3 Seleccionar el producto, entrar el precio de costo y tocar el botón Salvar.</p>
        <img src="/images/help/add-entry-dialog.png" alt="Diálogo agregar entrada" className="my-2 max-w-full" />
      </>
    ),
  },
  {
    title: '3. Adicionar el producto a la venta actual.',
    content: (
      <>
        <p>
          3.1 Abrir el menú y en la sección Venta tocar en Vender.
        </p>
        <p>
          3.2 Tocar el botón de la categoría deseada y después tocar el botón con el ícono del
          carrito de compra.
        </p>
      </>
    ),
  },
  {
    title: '4. Registrar la venta.',
    content: (
      <>
        <p>
          4.1 Tocar el botón del carrito de compras que está arriba con el circulito azul y la
          cantidad de productos y después tocar en el botón Registrar.
        </p>
        <img src="/images/help/register.png" alt="Registrar venta" className="my-2 max-w-full" />
      </>
    ),
  },
] as const;

/**
 * Controlled step panel — converted from an uncontrolled native `<details>/<summary>` to a
 * `div + button(aria-expanded) + conditional body` pattern (mirroring the other
 * collapsible-panel screens, e.g. `today-stats.tsx`'s `ExpansionPanel`) so it can host the
 * shared rotating `ChevronDownIcon` (collapsible-panel-chevron-parity). Each instance owns
 * its own `isOpen` state, so steps toggle independently. Default-collapsed + click-to-toggle
 * semantics are unchanged from the previous `<details>` version.
 */
function TutorialStep({ title, content }: { title: string; content: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded border border-border p-3">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 text-left font-semibold"
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <ChevronDownIcon isExpanded={isOpen} className="text-text-muted" />
      </button>
      {isOpen && <div className="mt-2">{content}</div>}
    </div>
  );
}

export function TutorialPage() {
  const intl = useIntl();

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">
        {intl.formatMessage({ id: 'TUTORIAL.TITLE' })}
      </h1>

      <div className="space-y-2">
        {STEPS.map((step) => (
          <TutorialStep key={step.title} title={step.title} content={step.content} />
        ))}
      </div>
    </div>
  );
}

export default TutorialPage;
