import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Modal } from '~/shared/components/ui/modal';
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import type { StorefrontCartLine } from '~/catalog/lib/storefront-cart-store';
import { buildWhatsAppOrderLink } from '~/catalog/lib/whatsapp-order-link';
import { catalogHttpService } from '~/sales/lib/services/catalog-http-service';
import type {
  PublicOrderingConfig,
  PublicOrderCreated,
} from '~/sales/lib/services/catalog-http-service';
import { PublicOrderDeliveryType } from '~/sales/lib/services/catalog-http-service';

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

/** Mínimo de dígitos que se aceptan como teléfono: 7 es el más corto que existe en la práctica. */
const PHONE_MIN_DIGITS = 7;

/**
 * Estado del envío por WhatsApp (F4). `link === null` NO es "aún no está": es que NO hay handoff
 * automático —la tienda SIN número o un resumen que no se pudo componer (R3-1)—, con el envío
 * BLOQUEADO.
 *
 * `code === null` es un ESTADO DISTINTO y no un dato que falte: es el modo SIN PERSISTENCIA (M3,
 * sin el módulo "Gestión de Pedidos"), donde no hay `Order`, así que no hay código que dictar y el
 * aviso no puede decir "pedido guardado". Los dos casos comparten la mecánica (enlace o bloqueo) y
 * se distinguen solo en el texto, que es justo lo que separa "tu pedido está en el sistema" de
 * "tu pedido vive en el chat".
 */
interface WhatsAppSend {
  /** Código del pedido PERSISTIDO. null en el modo sin módulo 20 (M3): no hay pedido guardado. */
  readonly code: string | null;
  readonly link: string | null;
}

interface StorefrontCheckoutProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly storeSlug: string;
  /**
   * Nombre de la tienda para el encabezado del resumen de WhatsApp. Opcional a propósito: si
   * quien lo abre no lo pasa, se usa el slug, que al menos dice de qué tienda es el pedido.
   */
  readonly storeName?: string;
  readonly config: PublicOrderingConfig;
  readonly lines: readonly StorefrontCartLine[];
  /**
   * Se llama con la orden creada para que el padre la pinte y vacíe el carrito. Solo existe con el
   * módulo "Gestión de Pedidos" (20) activo: es el que crea el `Order`. En el modo SIN
   * PERSISTENCIA no hay orden que reportar y se llama a `onSentWithoutOrder` en su lugar.
   */
  readonly onCreated: (order: PublicOrderCreated) => void;
  /**
   * El pedido salió por `wa.me` SIN guardarse (M3): no hay `Order`, así que `onCreated` no puede
   * llamarse y el carrito NO se vacía, porque es la única copia del pedido que el cliente tiene
   * mientras la tienda no lo confirme y vaciarlo tiraría su trabajo si el handoff no se completó.
   *
   * Si el padre lo pasa, cierra el checkout: el aviso vive FUERA del modal y sobrevive al cierre,
   * que es lo mismo que hace `onCreated` en el flujo persistido.
   */
  readonly onSentWithoutOrder?: () => void;
  /**
   * Quien registra el pedido es STAFF de esta tienda: el cliente está presente, así que el
   * pedido se da de alta y no se envía a WhatsApp (y no hay aviso que dar). Todo lo demás —mismos
   * campos, misma llamada, misma validación— es idéntico (decisión D3).
   *
   * Por defecto `false`: el catálogo público lo es para cualquiera, y quien no es staff de la
   * tienda sigue con el flujo de envío intacto.
   *
   * OJO con el cruce con M3: este modo SOLO significa "el pedido se guarda y no se manda". Sin el
   * módulo 20 no hay pedido que registrar, así que el flujo es el de cualquier cliente, con su
   * propia etiqueta en el botón: "Registrar pedido" sería una etiqueta que miente sobre lo que va
   * a pasar.
   */
  readonly staffMode?: boolean;
}

/**
 * Checkout del cliente anónimo (F3): nombre, teléfono, modalidad, dirección (solo si es
 * domicilio) y notas. Sin cuenta, sin login (D4).
 *
 * Valida EN CLIENTE para no gastar el límite de tasa del servidor (`OnlineOrderPolicy`, 20 pedidos
 * por IP y 10 min) con formularios a medio llenar, pero la validación que manda es la del backend:
 * esta se puede saltar desde el navegador.
 */
export function StorefrontCheckout({
  open,
  onClose,
  storeSlug,
  storeName,
  config,
  lines,
  onCreated,
  onSentWithoutOrder,
  staffMode = false,
}: StorefrontCheckoutProps) {
  const intl = useIntl();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveryType, setDeliveryType] = useState<PublicOrderDeliveryType>(() =>
    config.deliveryEnabled && !config.pickupEnabled
      ? PublicOrderDeliveryType.Delivery
      : PublicOrderDeliveryType.Pickup,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [whatsapp, setWhatsapp] = useState<WhatsAppSend | null>(null);

  /**
   * Espejo de `submitting` que se escribe EN EL MOMENTO (F3-R5), no en el render.
   *
   * Leer el estado no cerraba la ventana que hay que cerrar: dos pulsaciones seguidas leen el
   * MISMO `submitting === false` —el estado solo cambia cuando React vuelve a renderizar, y hasta
   * entonces el closure es el viejo—, así que el segundo `submit()` pasaba igual y creaba un
   * SEGUNDO pedido. Y `disabled={submitting}` tampoco ayuda ahí: depende de ese mismo render
   * pendiente. La ref se escribe antes del primer `await` y se borra en el `finally`, con lo que
   * la segunda pulsación ve el pedido en vuelo aunque llegue en el mismo tick.
   */
  const submittingRef = useRef(false);

  const deliverySelected = deliveryType === PublicOrderDeliveryType.Delivery;

  /**
   * ¿Se PERSISTE el pedido? Solo con el módulo "Gestión de Pedidos" (20, M3).
   *
   * El flag viene del config anónimo, o sea de los módulos ACTIVOS de la fila `StoreModule` de la
   * tienda, que son lo que compró: el storefront no puede deducirlo, igual que no puede deducir el
   * del carrito. Sin este módulo el backend rechaza el alta con un 400 (`OnlineOrdersModuleNot-
   * Enabled`), así que NO se intenta: el pedido se arma en cliente y viaja como resumen por
   * `wa.me`, sin `Order` y sin código.
   *
   * La regla es la MISMA para el staff: sin módulo 20 no hay pedido que registrar, así que el modo
   * staff no cambia nada aquí (solo el texto del botón, que anuncia lo que va a pasar).
   */
  const persistsOrders = config.gestionPedidosEnabled;

  /**
   * ¿Sale el resumen por WhatsApp? Para el cliente anónimo siempre; para el STAFF de la tienda
   * solo cuando el pedido NO se persistió.
   *
   * El modo staff significa "el pedido queda en el sistema de esta tienda, que lo está
   * managing": mandarlo también a WhatsApp sería duplicarlo. Pero sin el módulo 20 no hay sistema
   * al que quede — no se ha creado ningún `Order` — así que el `wa.me` es el ÚNICO camino que le
   * queda al pedido y se le da a cualquiera. La alternativa (suprimir el aviso por ser staff)
   * dejaría un botón que no hace nada visible, que es peor que un handoff de más.
   */
  const sendsByWhatsapp = !staffMode || !persistsOrders;

  // Un aviso del pedido ANTERIOR no puede quedar flotando mientras se hace el siguiente: abrir
  // el checkout es empezar un pedido nuevo.
  useEffect(() => {
    if (open) setWhatsapp(null);
  }, [open]);

  function validate(): string | null {
    if (lines.length === 0) return intl.formatMessage({ id: 'CHECKOUT.ERROR_EMPTY' });
    if (!customerName.trim()) return intl.formatMessage({ id: 'CHECKOUT.ERROR_NAME' });
    if (customerPhone.replace(/\D/g, '').length < PHONE_MIN_DIGITS) {
      return intl.formatMessage({ id: 'CHECKOUT.ERROR_PHONE' });
    }
    if (deliverySelected && !deliveryAddress.trim()) {
      return intl.formatMessage({ id: 'CHECKOUT.ERROR_ADDRESS' });
    }
    return null;
  }

  async function submit() {
    // Guarda de doble envío (F3-R5): con una petición en vuelo, un segundo gesto no crea un
    // segundo pedido. Va ANTES de `validate()` a propósito —una pulsación de más no tiene que
    // reevaluar el formulario, solo dejar de enviar— y lee la ref, no el estado: ver la nota de
    // `submittingRef`.
    if (submittingRef.current) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    // El estado apaga el botón; la ref frena el envío. Hace falta la pareja: el botón es lo que ve
    // el cliente y el ref es lo que decide.
    submittingRef.current = true;
    setSubmitting(true);

    // ── 1) EL PEDIDO ────────────────────────────────────────────────────────────────────────
    // Aislado en su propio try/catch: un fallo aquí SÍ es un fallo del alta y se muestra como tal.
    //
    // `created === null` NO es un fallo: es el modo SIN PERSISTENCIA (M3). Sin el módulo 20 no
    // se llama al servicio NADA —ni para fallar: un `POST` ahí solo conseguiría el 400 que el
    // backend devuelve por diseño— y lo que sigue arma el resumen con el carrito del cliente.
    let created: PublicOrderCreated | null = null;
    if (persistsOrders) {
      try {
        // Solo `productId` + `quantity`: ni precio, ni total, ni moneda. El servidor los recalcula
        // con el catálogo publicado, y la dirección solo viaja con domicilio (con recogida el
        // backend la ignora y el cliente no la escribe porque ni la ve).
        const result = await catalogHttpService.createPublicOrder(storeSlug, {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          deliveryType,
          ...(deliverySelected ? { deliveryAddress: deliveryAddress.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        });

        if (!result.succeeded) {
          setError(intl.formatMessage({ id: 'CHECKOUT.FAILED' }));
          return;
        }

        created = result.data;
      } catch {
        setError(intl.formatMessage({ id: 'CHECKOUT.FAILED' }));
        return;
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    } else {
      // Sin POST no hay nada en vuelo, así que la guarda se suelta YA: dejarlo puesto dejaría el
      // botón apagado para siempre sin que nadie pueda volver a pulsarlo.
      submittingRef.current = false;
      setSubmitting(false);
    }

    // ── 2) EL AVISO ─────────────────────────────────────────────────────────────────────────
    // A PARTIR DE AQUÍ el pedido YA está guardado, así que NADA de lo que viene puede reportarse
    // como un fallo del alta: `CHECKOUT.FAILED` aquí sería una mentira que además empuja al
    // cliente a reintentar, y el reintento CREA un pedido duplicado (F4-R2). El aviso es un
    // mensaje, no el pedido: si no se arma o no se abre, el pedido sigue existiendo y la tienda
    // lo ve igual en su panel.
    //
    // En el modo SIN PERSISTENCIA (M3) no hay pedido que reintentar, así que la regla de "nada
    // aquí es un fallo del alta" se cumple por la razón contraria y más fuerte: lo único que
    // queda por hacer es el aviso.
    //
    // Por eso el alta se reporta SIEMPRE —también en modo staff, donde no hay aviso que armar—
    // y solo el paso de aviso va protegido.
    try {
      // Con el pedido YA guardado, en modo staff eso es TODO lo que hay que hacer: el cliente
      // está delante y el pedido es suyo, así que no se arma el enlace, no se abre `wa.me` y no
      // se pinta aviso. `onCreated` es lo que el padre ya usaba como confirmación (cierra el
      // checkout y abre el estado del pedido recién creado), así que el mismo gesto confirma
      // igual en los dos modos.
      if (sendsByWhatsapp) {
        // Aquí lo único que queda es mandar el aviso. `buildWhatsAppOrderLink` devuelve
        // `null` cuando la tienda no tiene número utilizable, y en ese caso NO se abre nada — el
        // envío queda bloqueado y el pedido sigue existiendo (la tienda lo ve en su panel).
        //
        // Los DATOS del resumen son los del SERVIDOR cuando el pedido se persistió (snapshot
        // guardado) y los del CARRITO cuando no (M3), porque en ese modo es lo único que hay:
        // no hay `Order` al que cruzarlos y el resumen ES el pedido.
        const link = buildWhatsAppOrderLink({
          whatsappNumber: created ? created.whatsappNumber : config.whatsappNumber,
          storeName: storeName ?? storeSlug,
          code: created ? created.code : null,
          // LÍNEAS, SUBTOTAL Y TOTAL DEL SERVIDOR (snapshot persistido, opción B): el carrito es
          // de presentación. Si el resumen dijera otra cosa, el mensaje no cuadraría con el pedido
          // que la tienda ve en su panel, que es lo único contra lo que se cruza el pedido.
          lines: created
            ? created.lines.map((line) => ({
                name: line.name,
                quantity: line.quantity,
                unitPrice: line.price,
              }))
            : lines.map((line) => ({
                name: line.name,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              })),
          subtotal: created ? created.subtotal : subtotal,
          total: created ? created.total : subtotal,
          // Sin pedido guardado NO hay moneda del servidor: la del catálogo de la línea, que es
          // de donde salió ese precio. Sin costo de envío (A3), el total es el subtotal.
          currency: created ? created.currency : currencyFromCode(currency),
          deliveryType: deliverySelected ? 'delivery' : 'pickup',
          deliveryAddress: deliverySelected ? deliveryAddress.trim() : null,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          notes: notes.trim(),
        });

        if (link) {
          // `noopener` porque la pestaña es de OTRO origen y no debe poder llegar al catálogo por
          // `window.opener`. Con `noopener` el navegador no devuelve handle aunque abra la
          // pestaña, así que el enlace queda SIEMPRE a la vista: es a la vez el fallback del
          // bloqueo de popups y el botón manual para enviar el resumen.
          //
          // Abrir la pestaña es lo ÚNICO de este bloque que es best-effort: si el navegador la
          // bloquea y hasta lanza, el aviso tiene que pintarse igual. Perder el aviso entero
          // (que lleva el código y el enlace manual) sería justo perder el respaldo que existe
          // para el caso del popup bloqueado.
          try {
            window.open(link, '_blank', 'noopener');
          } catch (err) {
            // El aviso de abajo es el respaldo: se pinta igual. Lo que cambia es que el fallo
            // deja SEÑAL (R3-2): antes, un popup que lanzaba era indistinguible de uno abierto,
            // y sin ningún rastro no había forma de saber desde fuera que el cliente tendrá que
            // pulsar el enlace a mano.
            console.warn(
              '[storefront-checkout] window.open falló al enviar el aviso; queda el enlace manual.',
              err,
            );
          }
        }
        setWhatsapp({ code: created?.code ?? null, link });
      }
    } catch (err) {
      // El resumen no se pudo componer (`created.lines` que no es un array, por ejemplo). El
      // pedido YA está guardado, así que callar aquí dejaba al cliente sin handoff de WhatsApp Y
      // sin error visible (R3-1). Ahora el aviso se pinta igualmente con el código y sin enlace:
      // `link: null` ya significa "envío bloqueado, el pedido existe", que es exactamente lo que
      // el cliente puede hacer —decir el código por otro medio— y lo que la tienda ve en su
      // panel. El `console.warn` deja constancia de por qué el resumen no se armó.
      // El `!sendsByWhatsapp` es el mismo criterio del bloque de arriba: en modo staff con el
      // pedido guardado no hay aviso que pintar, ni siquiera al fallar.
      console.warn(
        '[storefront-checkout] no se pudo componer el resumen de WhatsApp; el aviso sale con el código y sin enlace.',
        err,
      );
      if (sendsByWhatsapp) setWhatsapp({ code: created?.code ?? null, link: null });
    }

    // El gesto se reporta según lo que PASÓ, no siempre igual: con pedido guardado se llama a
    // `onCreated` (el padre lo pinta, vacía el carrito y abre su consulta) y sin él —M3— no hay
    // `Order` que reportar, así que se avisa por `onSentWithoutOrder` y el carrito se queda
    // intacto. Confundir los dos sería peor que no decir nada: el padre abriría la consulta de un
    // pedido que no existe.
    if (created) onCreated(created);
    else onSentWithoutOrder?.();
  }

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const currency = lines[0]?.currency;

  return (
    // El modal y el aviso de WhatsApp son HERMANOS, no hijos: el aviso tiene que sobrevivir a
    // que el padre cierre el checkout al dar de alta el pedido.
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={intl.formatMessage({ id: 'CHECKOUT.TITLE' })}
        testId="catalog-checkout-modal"
      >
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-surface-hover p-3">
            <span className="text-xs font-medium text-text-muted">
              {intl.formatMessage({ id: 'CHECKOUT.SUMMARY' })}
            </span>
            <ul className="mt-1 space-y-1" data-testid="checkout-summary">
              {lines.map((line) => (
                <li key={line.productId} className="flex justify-between gap-2 text-sm text-text">
                  <span className="min-w-0 break-words">
                    {line.name} × {line.quantity}
                  </span>
                  <span className="shrink-0 text-text-muted">
                    {formatMoneyWithCurrency(
                      line.unitPrice * line.quantity,
                      currencyFromCode(line.currency),
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-border pt-2 text-sm">
              <span className="font-medium text-text">
                {intl.formatMessage({ id: 'CATALOG_PUBLIC.CART_SUBTOTAL' })}
              </span>{' '}
              <span className="font-bold text-primary" data-testid="checkout-subtotal">
                {formatMoneyWithCurrency(subtotal, currencyFromCode(currency))}
              </span>
            </p>
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-medium text-text-muted"
              htmlFor="checkout-name"
            >
              {intl.formatMessage({ id: 'CHECKOUT.NAME' })}
            </label>
            <input
              id="checkout-name"
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder={intl.formatMessage({ id: 'CHECKOUT.NAME_PLACEHOLDER' })}
              className={INPUT_CLASSES}
              data-testid="checkout-name"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-medium text-text-muted"
              htmlFor="checkout-phone"
            >
              {intl.formatMessage({ id: 'CHECKOUT.PHONE' })}
            </label>
            <input
              id="checkout-phone"
              type="tel"
              inputMode="tel"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder={intl.formatMessage({ id: 'CHECKOUT.PHONE_PLACEHOLDER' })}
              className={INPUT_CLASSES}
              data-testid="checkout-phone"
            />
          </div>

          {/* La modalidad la manda la CONFIG de la tienda: si solo admite una, no se ofrece la
            otra. Con ninguna disponible el propio config llega `enabled: false` y este flujo no
            se abre. */}
          {(config.pickupEnabled || config.deliveryEnabled) && (
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-text-muted">
                {intl.formatMessage({ id: 'CHECKOUT.DELIVERY_TYPE' })}
              </legend>
              <div className="space-y-1">
                {config.pickupEnabled && (
                  <label className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="radio"
                      name="delivery-type"
                      value={PublicOrderDeliveryType.Pickup}
                      checked={deliveryType === PublicOrderDeliveryType.Pickup}
                      onChange={() => setDeliveryType(PublicOrderDeliveryType.Pickup)}
                      data-testid="checkout-pickup"
                    />
                    {intl.formatMessage({ id: 'CHECKOUT.PICKUP' })}
                  </label>
                )}
                {config.deliveryEnabled && (
                  <label className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="radio"
                      name="delivery-type"
                      value={PublicOrderDeliveryType.Delivery}
                      checked={deliveryType === PublicOrderDeliveryType.Delivery}
                      onChange={() => setDeliveryType(PublicOrderDeliveryType.Delivery)}
                      data-testid="checkout-delivery"
                    />
                    {intl.formatMessage({ id: 'CHECKOUT.DELIVERY' })}
                  </label>
                )}
              </div>
            </fieldset>
          )}

          {/* La dirección SOLO con domicilio: con recogida ni se pide ni viaja. */}
          {deliverySelected && (
            <div data-testid="checkout-address-field">
              <label
                className="mb-1 block text-xs font-medium text-text-muted"
                htmlFor="checkout-address"
              >
                {intl.formatMessage({ id: 'CHECKOUT.ADDRESS' })}
              </label>
              <input
                id="checkout-address"
                type="text"
                value={deliveryAddress}
                onChange={(event) => setDeliveryAddress(event.target.value)}
                placeholder={intl.formatMessage({ id: 'CHECKOUT.ADDRESS_PLACEHOLDER' })}
                className={INPUT_CLASSES}
                data-testid="checkout-address"
              />
            </div>
          )}

          <div>
            <label
              className="mb-1 block text-xs font-medium text-text-muted"
              htmlFor="checkout-notes"
            >
              {intl.formatMessage({ id: 'CHECKOUT.NOTES' })}
            </label>
            <textarea
              id="checkout-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={intl.formatMessage({ id: 'CHECKOUT.NOTES_PLACEHOLDER' })}
              className={INPUT_CLASSES}
              data-testid="checkout-notes"
            />
          </div>

          {error && (
            <div data-testid="checkout-error">
              <InfoBox variant="danger">{error}</InfoBox>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => void submit()}
              disabled={submitting}
              data-testid="checkout-submit"
            >
              {/* La etiqueta anuncia lo que va a HACER, y sin el módulo 20 eso no es "registrar"
                  ni "crear": es mandar el resumen por WhatsApp. El modo staff se queda con sus
                  dos etiquetas solo cuando hay pedido que registrar de verdad. */}
              {intl.formatMessage({
                id: !persistsOrders
                  ? submitting
                    ? 'CHECKOUT.SUBMITTING_WHATSAPP'
                    : 'CHECKOUT.SUBMIT_WHATSAPP'
                  : staffMode
                    ? submitting
                      ? 'CHECKOUT.SUBMITTING_STAFF'
                      : 'CHECKOUT.SUBMIT_STAFF'
                    : submitting
                      ? 'CHECKOUT.SUBMITTING'
                      : 'CHECKOUT.SUBMIT',
              })}
            </Button>
          </div>
        </div>
      </Modal>

      {/* El aviso va FUERA del modal a propósito: al dar de alta el pedido, el padre cierra el
          checkout y abre la consulta del pedido recién creado, así que dentro del modal este
          texto no se vería nunca. `z-40` para quedar por debajo de cualquier modal. */}
      {whatsapp && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg p-4"
          data-testid="checkout-whatsapp-notice"
        >
          <div className="rounded-lg border border-border bg-surface p-3 shadow-lg">
            <p className="text-sm font-medium text-text" data-testid="checkout-whatsapp-title">
              {intl.formatMessage({ id: 'CHECKOUT.WHATSAPP_TITLE' })}
            </p>
            {whatsapp.link === null ? (
              <div className="mt-2" data-testid="checkout-whatsapp-blocked">
                <InfoBox variant="danger">
                  {/* Sin pedido guardado (M3) NO se puede decir "pedido K7M2QX guardado": no hay
                      pedido guardado. El texto distingue los dos estados en vez de repetir el
                      mismo con un hueco donde iba el código. */}
                  {whatsapp.code === null
                    ? intl.formatMessage({ id: 'CHECKOUT.WHATSAPP_BLOCKED_NO_ORDER' })
                    : intl.formatMessage({ id: 'CHECKOUT.WHATSAPP_BLOCKED' }, { code: whatsapp.code })}
                </InfoBox>
              </div>
            ) : (
              <>
                <div className="mt-2" data-testid="checkout-whatsapp-pending">
                  <InfoBox variant="primary">
                    {whatsapp.code === null
                      ? intl.formatMessage({ id: 'CHECKOUT.WHATSAPP_SENT' })
                      : intl.formatMessage({ id: 'CHECKOUT.WHATSAPP_PENDING' }, { code: whatsapp.code })}
                  </InfoBox>
                </div>
                {/* El MISMO enlace que se intentó abrir, siempre visible: si el navegador bloqueó
                  la pestaña, o si simplemente se prefirió no saltar fuera, el pedido se puede
                  enviar desde aquí. */}
                <a
                  href={whatsapp.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-primary underline"
                  data-testid="checkout-whatsapp-link"
                >
                  {intl.formatMessage({ id: 'CHECKOUT.WHATSAPP_LINK' })}
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
