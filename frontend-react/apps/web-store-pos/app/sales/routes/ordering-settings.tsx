import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EModules } from '@store-mgmt/domain';
import { ownerModuleLoader } from '~/auth/routes/loaders';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Spinner } from '~/shared/components/ui/spinner';
import { Switch } from '~/shared/components/ui/switch';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { showToastSuccess } from '~/shared/lib/toast';
import {
  orderingHttpService,
  type OrderingSettings,
  type OrderingSettingsPayload,
} from '../lib/services/ordering-http-service';

// El módulo 18 + OwnerAdmin es el gate real (el backend lo vuelve a exigir en ambos endpoints:
// [HasPermission(StoreRoleFeatures.WebCatalogAdmin)]). Configurar la tienda es cosa del dueño,
// igual que la marca del catálogo.
export const clientLoader = ownerModuleLoader(EModules.WebCatalog);

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

/**
 * Formatea la marca de la última sincronización. Misma convención que `web-catalog.tsx`: el
 * backend guarda UTC y, según la columna, el valor puede llegar sin sufijo de zona — sin él el
 * navegador lo leería como hora local, así que se completa antes de convertir.
 *
 * Se exporta para poder fijarla en un test propio (F1-R8): la vista solo la alcanza a través de un
 * `syncedAt` que el servicio controla, así que probarla por la pantalla no cubre ni el valor
 * inválido ni el borde del regex de zona.
 */
export function formatSyncedAt(value: string): string {
  const hasZone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(value);
  return new Date(hasZone ? value : `${value}Z`).toLocaleString('es-ES');
}

/** Lo que el dueño ve y escribe. Los textos van como texto: se envía lo que hay en el campo. */
interface OrderingForm {
  enabled: boolean;
  whatsappNumber: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  businessHours: string;
  deliveryZones: string;
}

/** Texto vacío = sin valor: el backend guarda `null` (su `Trim`), no `""`. */
function text(value: string | null): string {
  return value ?? '';
}

function toForm(settings: OrderingSettings): OrderingForm {
  return {
    enabled: settings.enabled,
    whatsappNumber: text(settings.whatsappNumber),
    pickupEnabled: settings.pickupEnabled,
    deliveryEnabled: settings.deliveryEnabled,
    businessHours: text(settings.businessHours),
    deliveryZones: text(settings.deliveryZones),
  };
}

/** Cuerpo del PUT: la fila completa de pedidos, sin importes (no hay envío ni mínimo). */
function toPayload(form: OrderingForm): OrderingSettingsPayload {
  return {
    enabled: form.enabled,
    whatsappNumber: text(form.whatsappNumber) || null,
    pickupEnabled: form.pickupEnabled,
    deliveryEnabled: form.deliveryEnabled,
    businessHours: text(form.businessHours) || null,
    deliveryZones: text(form.deliveryZones) || null,
  };
}

/**
 * Vista "Pedidos WhatsApp" (`/sales/online-orders/settings`, módulo 18, OwnerAdmin, F1).
 *
 * Un interruptor maestro más la configuración que solo tiene sentido con él encendido: sin el
 * interruptor la tienda NO acepta pedidos y el storefront no ofrece carrito, así que el panel no
 * se muestra (criterio de aceptación 2 — también fuera de alcance hay dos interruptores: publicar
 * el catálogo y aceptar pedidos son cosas distintas).
 *
 * Guardar es un acto explícito, gemelo del "Sincronizar Catálogo": el botón Sincronizar hace el
 * PUT, el servidor fija `syncedAt` y lo que se guarda son SOLO las columnas de pedidos (la marca
 * es de F8 y no se toca).
 */
export function OrderingSettingsPage() {
  const intl = useIntl();

  const [form, setForm] = useState<OrderingForm | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  /**
   * Aviso de "guardado, pero no se pudo recargar" (F1-R6). Vive APARTE de `error` a propósito:
   * `error` es el estado FATAL de la vista (no hay nada que pintar) y reutilizarlo convertía un
   * guardado correcto en una pantalla roja que además escondía lo que el dueño acababa de escribir.
   */
  const [staleWarning, setStaleWarning] = useState('');

  /**
   * @param keepOnFailure cuando es `true` (la recarga posterior a un guardado OK), un fallo deja
   * intacto lo ya cargado y se comunica como AVISO en vez de como error fatal.
   */
  const loadData = useCallback(
    async ({ keepOnFailure = false }: { keepOnFailure?: boolean } = {}) => {
      try {
        const result = await orderingHttpService.getSettings();
        if (!result.succeeded) {
          // Sin fila NO es un 404: el backend devuelve los valores por defecto con `enabled=false`.
          // OJO: esta rama tiene que avisar TAMBIÉN con `keepOnFailure` (un rechazo controlado del
          // servicio es el mismo fallo que una excepción, y dejarlo mudo hacía que un guardado
          // correcto + recarga rechazada no dejara ni rastro), pero por el canal que NO es fatal.
          const message = intl.formatMessage({ id: 'ORDERING_SETTINGS.LOAD_FAILED' });
          if (keepOnFailure) setStaleWarning(message);
          else setError(message);
          return;
        }
        setForm(toForm(result.data));
        setSyncedAt(result.data.syncedAt);
        setError('');
      } catch (err) {
        const message = intl.formatMessage({
          id: httpErrorKey(err, 'ORDERING_SETTINGS.LOAD_FAILED'),
        });
        if (keepOnFailure) setStaleWarning(message);
        else setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [intl],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function update<K extends keyof OrderingForm>(key: K, value: OrderingForm[K]) {
    setForm((current) => (current === null ? current : { ...current, [key]: value }));
  }

  async function handleSync() {
    if (form === null) return;

    setIsSyncing(true);
    try {
      const result = await orderingHttpService.updateSettings(toPayload(form));
      if (!result.succeeded) {
        // El servidor decide si eso se puede guardar (WhatsApp obligatorio con el interruptor
        // encendido, al menos una modalidad abierta): su mensaje ES la razón del rechazo, no un
        // texto genérico de esta vista.
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          result.errors[0]?.description ??
            intl.formatMessage({ id: 'ORDERING_SETTINGS.SYNC_FAILED' }),
        );
        return;
      }
      showToastSuccess(intl.formatMessage({ id: 'ORDERING_SETTINGS.SYNC_DONE' }));
      // El servidor manda: tras guardar se recarga para que la pantalla diga la verdad. Pero si ESA
      // recarga falla, el guardado YA está hecho: se avisa y se conserva lo que hay en pantalla
      // (F1-R6). Con `keepOnFailure` el fallo no toca `error` —que es fatal y escondería el
      // formulario— sino `staleWarning`, que solo añade una línea.
      setStaleWarning('');
      await loadData({ keepOnFailure: true });
    } catch (err) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: httpErrorKey(err, 'ORDERING_SETTINGS.SYNC_FAILED') }),
      );
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card
        padding="tight"
        title={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{intl.formatMessage({ id: 'ORDERING_SETTINGS.TITLE' })}</span>
            <Button
              variant="fab"
              onClick={() => void handleSync()}
              disabled={isSyncing || form === null}
              data-testid="ordering-sync"
            >
              {intl.formatMessage({
                id: isSyncing ? 'ORDERING_SETTINGS.SYNCING' : 'ORDERING_SETTINGS.SYNC',
              })}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'ORDERING_SETTINGS.SUBTITLE' })}
        </p>

        <p className="mt-2 text-xs text-text-muted" data-testid="ordering-last-sync">
          {intl.formatMessage({ id: 'ORDERING_SETTINGS.LAST_SYNC' })}:{' '}
          {syncedAt
            ? formatSyncedAt(syncedAt)
            : intl.formatMessage({ id: 'ORDERING_SETTINGS.NEVER_SYNCED' })}
        </p>
      </Card>

      {isLoading && <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />}

      {!isLoading && error && (
        <InfoBox variant="danger" className="text-center">
          <span data-testid="ordering-error">{error}</span>
        </InfoBox>
      )}

      {/* F1-R6: guardado OK + recarga fallida. No es fatal y NO oculta el formulario: el dueño
          escribió unos valores que el servidor ya tiene, y verlos desaparecer sería peor que no
          recargar. El envoltorio existe porque `InfoBox` no acepta `data-testid` ni tiene variante
          `warning`: se usa `info` y el testid va en el div de fuera. */}
      {!isLoading && !error && staleWarning && (
        <div data-testid="ordering-stale-warning">
          <InfoBox variant="info" className="text-center">
            {intl.formatMessage({ id: 'ORDERING_SETTINGS.SYNC_DONE' })} — {staleWarning}
          </InfoBox>
        </div>
      )}

      {!isLoading && !error && form !== null && (
        <>
          <Card padding="tight">
            <div data-testid="ordering-enabled">
              <Switch
                checked={form.enabled}
                onChange={(value) => update('enabled', value)}
                label={intl.formatMessage({ id: 'ORDERING_SETTINGS.ENABLED' })}
                disabled={isSyncing}
              />
            </div>
            <p className="mt-2 text-xs text-text-muted">
              {intl.formatMessage({ id: 'ORDERING_SETTINGS.ENABLED_HINT' })}
            </p>
          </Card>

          {/* El panel de configuración existe SOLO con el interruptor encendido: apagado, la
              tienda no acepta pedidos y sus campos no significan nada (criterio 2). */}
          {form.enabled && (
            <div data-testid="ordering-panel">
              <Card padding="tight">
                <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="ordering-whatsapp"
                    className="mb-1 block text-sm font-medium text-text"
                  >
                    {intl.formatMessage({ id: 'ORDERING_SETTINGS.WHATSAPP_NUMBER' })}
                  </label>
                  <input
                    id="ordering-whatsapp"
                    type="text"
                    inputMode="tel"
                    value={form.whatsappNumber}
                    onChange={(event) => update('whatsappNumber', event.target.value)}
                    placeholder={intl.formatMessage({
                      id: 'ORDERING_SETTINGS.WHATSAPP_NUMBER_PLACEHOLDER',
                    })}
                    className={INPUT_CLASSES}
                    data-testid="ordering-whatsapp"
                  />
                </div>

                <div>
                  <div data-testid="ordering-pickup">
                    <Switch
                      checked={form.pickupEnabled}
                      onChange={(value) => update('pickupEnabled', value)}
                      label={intl.formatMessage({ id: 'ORDERING_SETTINGS.PICKUP_ENABLED' })}
                      disabled={isSyncing}
                    />
                  </div>
                </div>

                <div>
                  <div data-testid="ordering-delivery">
                    <Switch
                      checked={form.deliveryEnabled}
                      onChange={(value) => update('deliveryEnabled', value)}
                      label={intl.formatMessage({ id: 'ORDERING_SETTINGS.DELIVERY_ENABLED' })}
                      disabled={isSyncing}
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="ordering-business-hours"
                    className="mb-1 block text-sm font-medium text-text"
                  >
                    {intl.formatMessage({ id: 'ORDERING_SETTINGS.BUSINESS_HOURS' })}
                  </label>
                  <input
                    id="ordering-business-hours"
                    type="text"
                    value={form.businessHours}
                    onChange={(event) => update('businessHours', event.target.value)}
                    placeholder={intl.formatMessage({
                      id: 'ORDERING_SETTINGS.BUSINESS_HOURS_PLACEHOLDER',
                    })}
                    className={INPUT_CLASSES}
                    data-testid="ordering-business-hours"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="ordering-delivery-zones"
                    className="mb-1 block text-sm font-medium text-text"
                  >
                    {intl.formatMessage({ id: 'ORDERING_SETTINGS.DELIVERY_ZONES' })}
                  </label>
                  <input
                    id="ordering-delivery-zones"
                    type="text"
                    value={form.deliveryZones}
                    onChange={(event) => update('deliveryZones', event.target.value)}
                    placeholder={intl.formatMessage({
                      id: 'ORDERING_SETTINGS.DELIVERY_ZONES_PLACEHOLDER',
                    })}
                    className={INPUT_CLASSES}
                    data-testid="ordering-delivery-zones"
                  />
                </div>
              </div>

              <p className="mt-3 text-xs text-text-muted">
                {intl.formatMessage({ id: 'ORDERING_SETTINGS.CURRENCY_NOTE' })}
              </p>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default OrderingSettingsPage;