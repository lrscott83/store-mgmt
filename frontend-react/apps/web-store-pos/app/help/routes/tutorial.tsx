import { useState } from 'react';
import { useIntl } from 'react-intl';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { apiFileUrl } from '~/shared/lib/http/media-url';

/**
 * Collapsible panels, one per task. The first one mirrors Angular's ONE
 * `mat-expansion-panel` titled literally "Pasos para realizar una venta"
 * (`tutorial.component.html`), holding all 4 numbered steps as static content
 * (not independent sub-panels). The second panel covers POS user management
 * (Gestión → Empleados) and was added after the React migration.
 * Converted from an uncontrolled `<details>/<summary>` to a
 * `div + button(aria-expanded) + conditional body` pattern (mirroring the other
 * collapsible-panel screens, e.g. `today-stats.tsx`'s `ExpansionPanel`) so it can
 * host the shared rotating `ChevronDownIcon` (collapsible-panel-chevron-parity).
 * Default-collapsed + click-to-toggle semantics match `[expanded]="false"`.
 */
function TutorialPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded border border-border">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left font-semibold"
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <ChevronDownIcon isExpanded={isOpen} className="text-text-muted" />
      </button>
      {isOpen && <div className="space-y-2 p-3 pt-0">{children}</div>}
    </div>
  );
}

export function TutorialPage() {
  const intl = useIntl();

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">{intl.formatMessage({ id: 'TUTORIAL.TITLE' })}</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={apiFileUrl('/api/manual/')}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary hover:underline"
        >
          {intl.formatMessage({ id: 'TUTORIAL.MANUAL_LINK' })}
        </a>
        <a
          href={apiFileUrl('/api/manual/manual-usuario-pos.pdf')}
          download
          className="text-sm font-medium text-primary hover:underline"
        >
          {intl.formatMessage({ id: 'TUTORIAL.MANUAL_PDF' })}
        </a>
      </div>

      <TutorialPanel title="Pasos para realizar una venta">
        <h6 className="font-semibold">1. Adicionar un producto al catálogo.</h6>
        <p>1.1 Abrir el menú y en la sección Venta tocar en Productos.</p>
        <img src="/images/help/menu.png" alt="Menú principal" className="my-2 max-w-full" />
        <p>
          1.2 Tocar el botón + Categoría para adicionar una nueva Categoría si no está adicionada.
          Escribir el nombre de la categoría y tocar el botón Salvar.
        </p>
        <img
          src="/images/help/add-cat-dialog.png"
          alt="Adicionar categoría"
          className="my-2 max-w-full"
        />
        <p>
          1.3 Tocar la flecha hacia abajo para desplegar la Categoría y tocar el botón + Producto.
        </p>
        <img
          src="/images/help/add-product-btn.png"
          alt="Botón agregar producto"
          className="my-2 max-w-full"
        />
        <p>1.4 Escribir el nombre y precio del producto y tocar el botón Salvar.</p>
        <img
          src="/images/help/add-product-dialog.png"
          alt="Diálogo agregar producto"
          className="my-2 max-w-full"
        />

        <h6 className="font-semibold">2. Adicionar una entrada al inventario.</h6>
        <p>2.1 Abrir el menú y en la sección Inventario tocar en Entradas.</p>
        <p>
          2.2 Tocar el botón + Entrada para adicionar una entrada en el Inventario de un producto.
        </p>
        <p>2.3 Seleccionar el producto, entrar el precio de costo y tocar el botón Salvar.</p>
        <img
          src="/images/help/add-entry-dialog.png"
          alt="Diálogo agregar entrada"
          className="my-2 max-w-full"
        />

        <h6 className="font-semibold">3. Adicionar el producto a la venta actual.</h6>
        <p>3.1 Abrir el menú y en la sección Venta tocar en Vender.</p>
        <p>
          3.2 Tocar el botón de la categoría deseada y después tocar el botón con el ícono del
          carrito de compra.
        </p>

        <h6 className="font-semibold">4. Registrar la venta.</h6>
        <p>
          4.1 Tocar el botón del carrito de compras que está arriba con el circulito azul y la
          cantidad de productos y después tocar en el botón Registrar.
        </p>
        <img src="/images/help/register.png" alt="Registrar venta" className="my-2 max-w-full" />
      </TutorialPanel>

      <TutorialPanel title="Pasos para gestionar los usuarios del POS">
        <h6 className="font-semibold">1. Adicionar un empleado.</h6>
        <p>1.1 Abrir el menú y en la sección Gestión tocar en Empleados.</p>
        <img
          src="/tutorials/usuarios/users-menu.png"
          alt="Menú Gestión Empleados"
          className="my-2 max-w-full"
        />
        <p>
          1.2 Tocar el botón + Empleado. En la misma cabecera están las acciones del roster
          (Exportar roster sin conexión y Compartir por hotspot).
        </p>
        <img
          src="/tutorials/usuarios/users-list.png"
          alt="Lista de empleados"
          className="my-2 max-w-full"
        />
        <p>
          1.3 Escribir Nombre Completo, Usuario, Contraseña, Confirmar Contraseña y Teléfono; el
          Correo es opcional. Tocar el botón Adicionar.
        </p>
        <img
          src="/tutorials/usuarios/users-create-form.png"
          alt="Formulario de nuevo empleado"
          className="my-2 max-w-full"
        />
        <p className="text-sm text-text-muted">
          La contraseña debe tener entre 8 y 30 caracteres e incluir al menos una mayúscula, una
          minúscula y un número. Crear empleados requiere conexión.
        </p>

        <h6 className="font-semibold">2. Editar un empleado.</h6>
        <p>2.1 En la tarjeta del empleado tocar el engranaje y después tocar Editar.</p>
        <img
          src="/tutorials/usuarios/users-card-actions.png"
          alt="Acciones de la tarjeta del empleado"
          className="my-2 max-w-full"
        />
        <p>
          2.2 Cambiar el nombre, el teléfono, el correo o la marca Activo, y tocar el botón
          Actualizar. El Usuario no se puede cambiar.
        </p>
        <img
          src="/tutorials/usuarios/users-edit-form.png"
          alt="Formulario de edición del empleado"
          className="my-2 max-w-full"
        />

        <h6 className="font-semibold">3. Activar o desactivar un empleado.</h6>
        <p>
          3.1 Tocar el engranaje de la tarjeta y tocar Desactivar. Si el empleado está desactivado,
          la opción es Activar.
        </p>
        <p>
          3.2 La tarjeta de un empleado desactivado se muestra en rojo y ese empleado no puede
          entrar al POS.
        </p>

        <h6 className="font-semibold">4. Exportar el roster para el acceso sin conexión.</h6>
        <p>
          4.1 Tocar Exportar roster sin conexión, escribir la Contraseña maestra y tocar Confirmar.
          Se descarga un archivo con extensión .smcabundle.
        </p>
        <img
          src="/tutorials/usuarios/users-roster-export.png"
          alt="Exportar roster sin conexión"
          className="my-2 max-w-full"
        />
        <p>
          4.2 O tocar Compartir por hotspot para enviar ese mismo archivo al equipo del empleado sin
          usar internet.
        </p>
        <p>
          4.3 En el equipo del empleado, abrir el Acceso sin conexión desde la pantalla de acceso,
          elegir el Archivo de roster (.smcabundle), escribir la Contraseña maestra y tocar Activar.
        </p>
      </TutorialPanel>
    </div>
  );
}

export default TutorialPage;
