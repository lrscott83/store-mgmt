import { useIntl } from 'react-intl';

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

export function TutorialPage() {
  const intl = useIntl();

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">
        {intl.formatMessage({ id: 'TUTORIAL.TITLE' })}
      </h1>

      <div className="space-y-2">
        {STEPS.map((step) => (
          <details key={step.title} className="rounded border border-border p-3">
            <summary className="cursor-pointer font-semibold">{step.title}</summary>
            <div className="mt-2">{step.content}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

export default TutorialPage;
