import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
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
  type DeliveryDriver,
} from '../lib/services/ordering-http-service';

/**
 * Gate de la vista Repartidores (módulo 18 + feature 123 = `OnlineOrdersAdmin`).
 *
 * `featureLoader` y NO `ownerModuleLoader` (que usa la vista de configuración de F1) porque aquí
 * el backend NO es owner-only: `[HasPermission(StoreRoleFeatures.OnlineOrdersAdmin)]` lleva
 * OwnerAdmin Y StoreUser (D15) — dar de alta repartidores es trabajo del día a día. Y la decisión
 * real es la FEATURE, no el rol: por eso `featureLoader([EFeatures.OnlineOrders])` y no un
 * `rolesOnly` de dueño.
 *
 * Lo que este loader NO replica es el módulo. `featureLoader` deja pasar a cualquier
 * OwnerAdmin/SuperAdmin antes de mirar features (bypass legacy), así que un dueño sin el módulo
 * 18 contractual llegaría a la vista y el backend le devolvería 403 en el primer GET. El `moduleIds`
 * del ítem de menú sí replica ese gate: sin el módulo el enlace no se ofrece. Es la misma
 * división que el resto del panel.
 */
export const clientLoader = featureLoader([EFeatures.OnlineOrders]);

const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

/** Lo que el dueño escribe. El `isActive` solo viaja al editar: un alta nace activa. */
interface DriverForm {
  name: string;
  phone: string;
  isActive: boolean;
}

/** Formulario vacío de alta. */
function emptyForm(): DriverForm {
  return { name: '', phone: '', isActive: true };
}

/** Rellena el formulario desde un repartidor existente. */
function toForm(driver: DeliveryDriver): DriverForm {
  return { name: driver.name, phone: driver.phone, isActive: driver.isActive };
}

/**
 * Vista "Repartidores" (`/sales/online-orders/drivers`, módulo 18 + feature 123, F7).
 *
 * Es un CATÁLOGO DE PERSONAS: alta, edición y el interruptor de activo. Deliberadamente NO hace
 * dos cosas que se le podrían pedir aquí:
 *
 *   * No cuenta pedidos por repartidor. Eso es leer `Order.DriverId`, o sea el endpoint de F5. D8
 *     separa las vistas por responsabilidad y esta es la de las personas.
 *   * No asigna repartidores a pedidos. Es un acto sobre el PEDIDO y vive en F5, que es quien
 *     valida que el repartidor sea de la tienda y esté activo.
 *
 * Desactivar NO borra: el backend hace una baja lógica (`IsActive = false`) para que los pedidos
 * que ya llevó conserven la referencia (criterio 3). Por eso la lista pide `activeOnly=true` y
 * muestra los inactivos tachados, para poder volver a activarlos.
 */
export function OrderingDriversPage() {
  const intl = useIntl();

  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [form, setForm] = useState<DriverForm | null>(null);
  /** `null` = alta; con id = edición de ese repartidor. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const loadDrivers = useCallback(async () => {
    try {
      const result = await orderingHttpService.getDeliveryDrivers();
      if (!result.succeeded) {
        setError(intl.formatMessage({ id: 'ORDERING_DRIVERS.LOAD_FAILED' }));
        return;
      }
      setDrivers(result.data ?? []);
      setError('');
    } catch (err) {
      setError(intl.formatMessage({ id: httpErrorKey(err, 'ORDERING_DRIVERS.LOAD_FAILED') }));
    } finally {
      setIsLoading(false);
    }
  }, [intl]);

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  function update<K extends keyof DriverForm>(key: K, value: DriverForm[K]) {
    setForm((current) => (current === null ? current : { ...current, [key]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEdit(driver: DeliveryDriver) {
    setEditingId(driver.id);
    setForm(toForm(driver));
  }

  function cancelForm() {
    setEditingId(null);
    setForm(null);
  }

  async function handleSave() {
    if (form === null) return;

    setIsSaving(true);
    try {
      const payload = { name: form.name, phone: form.phone };
      // El interruptor de baja viaja en el PATCH de EDICIÓN, no en el alta: un repartidor
      // recién creado está activo por definición y no hay nada que apagar.
      const result =
        editingId === null
          ? await orderingHttpService.createDeliveryDriver(payload)
          : await orderingHttpService.updateDeliveryDriver(editingId, { ...payload, isActive: form.isActive });

      if (!result.succeeded) {
        // El mensaje del servidor ES la razón del rechazo (nombre o teléfono), no un texto
        // genérico de esta vista.
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          result.errors[0]?.description ?? intl.formatMessage({ id: 'ORDERING_DRIVERS.SAVE_FAILED' }),
        );
        return;
      }

      showToastSuccess(
        intl.formatMessage({
          id: editingId === null ? 'ORDERING_DRIVERS.CREATE_DONE' : 'ORDERING_DRIVERS.UPDATE_DONE',
        }),
      );
      cancelForm();
      // El servidor manda: tras guardar se recarga para que la pantalla diga la verdad.
      await loadDrivers();
    } catch (err) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: httpErrorKey(err, 'ORDERING_DRIVERS.SAVE_FAILED') }),
      );
    } finally {
      setIsSaving(false);
    }
  }

  const isEditing = editingId !== null;

  return (
    <div className="space-y-4">
      <Card
        padding="tight"
        title={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{intl.formatMessage({ id: 'ORDERING_DRIVERS.TITLE' })}</span>
            {!isEditing && (
              <Button variant="fab" onClick={startCreate} data-testid="drivers-new">
                {intl.formatMessage({ id: 'ORDERING_DRIVERS.NEW' })}
              </Button>
            )}
          </div>
        }
      >
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'ORDERING_DRIVERS.SUBTITLE' })}
        </p>
      </Card>

      {isLoading && <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />}

      {!isLoading && error && (
        <InfoBox variant="danger" className="text-center">
          <span data-testid="drivers-error">{error}</span>
        </InfoBox>
      )}

      {!isLoading && !error && form !== null && (
        <Card
          padding="tight"
          title={intl.formatMessage({
            id: isEditing ? 'ORDERING_DRIVERS.EDIT_TITLE' : 'ORDERING_DRIVERS.NEW',
          })}
        >
          <div data-testid="drivers-form" className="space-y-3">
            <div>
              <label htmlFor="driver-name" className="mb-1 block text-sm font-medium text-text">
                {intl.formatMessage({ id: 'ORDERING_DRIVERS.NAME' })}
              </label>
              <input
                id="driver-name"
                type="text"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder={intl.formatMessage({ id: 'ORDERING_DRIVERS.NAME_PLACEHOLDER' })}
                className={INPUT_CLASSES}
                data-testid="drivers-name"
              />
            </div>

            <div>
              <label htmlFor="driver-phone" className="mb-1 block text-sm font-medium text-text">
                {intl.formatMessage({ id: 'ORDERING_DRIVERS.PHONE' })}
              </label>
              <input
                id="driver-phone"
                type="text"
                inputMode="tel"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                placeholder={intl.formatMessage({ id: 'ORDERING_DRIVERS.PHONE_PLACEHOLDER' })}
                className={INPUT_CLASSES}
                data-testid="drivers-phone"
              />
            </div>

            {/* El interruptor solo aparece EDICANDO: en el alta el repartidor nace activo y no
                hay nada que apagar. */}
            {isEditing && (
              <>
                <div data-testid="drivers-active">
                  <Switch
                    checked={form.isActive}
                    onChange={(value) => update('isActive', value)}
                    label={intl.formatMessage({ id: 'ORDERING_DRIVERS.ACTIVE' })}
                    disabled={isSaving}
                  />
                </div>
                <p className="text-xs text-text-muted">
                  {intl.formatMessage({ id: 'ORDERING_DRIVERS.INACTIVE_HINT' })}
                </p>
              </>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleSave()}
                disabled={isSaving}
                data-testid="drivers-save"
              >
                {intl.formatMessage({
                  id: isSaving ? 'ORDERING_DRIVERS.SAVING' : 'ORDERING_DRIVERS.SAVE',
                })}
              </Button>
              <Button variant="outline" onClick={cancelForm} data-testid="drivers-cancel">
                {intl.formatMessage({ id: 'ORDERING_DRIVERS.CANCEL' })}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!isLoading && !error && drivers.length === 0 && form === null && (
        <Card padding="tight">
          <p className="text-sm text-text-muted" data-testid="drivers-empty">
            {intl.formatMessage({ id: 'ORDERING_DRIVERS.EMPTY' })}
          </p>
        </Card>
      )}

      {!isLoading && !error && drivers.length > 0 && (
        <Card padding="tight">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="drivers-table">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-text-muted">
                  <th className="py-2 pr-3">
                    {intl.formatMessage({ id: 'ORDERING_DRIVERS.TABLE_NAME' })}
                  </th>
                  <th className="py-2 pr-3">
                    {intl.formatMessage({ id: 'ORDERING_DRIVERS.TABLE_PHONE' })}
                  </th>
                  <th className="py-2 pr-3">
                    {intl.formatMessage({ id: 'ORDERING_DRIVERS.TABLE_STATUS' })}
                  </th>
                  <th className="py-2">
                    {intl.formatMessage({ id: 'ORDERING_DRIVERS.TABLE_ACTIONS' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr key={driver.id} className="border-b border-border" data-testid="drivers-row">
                    <td className="py-2 pr-3 text-text" data-testid="drivers-row-name">
                      {driver.name}
                    </td>
                    <td className="py-2 pr-3 text-text" data-testid="drivers-row-phone">
                      {driver.phone}
                    </td>
                    <td className="py-2 pr-3">
                      {driver.isActive ? (
                        <span className="text-xs text-text-muted" data-testid="drivers-row-status">
                          {intl.formatMessage({ id: 'ORDERING_DRIVERS.ACTIVE' })}
                        </span>
                      ) : (
                        <span
                          className="text-xs text-text-muted line-through"
                          data-testid="drivers-row-status"
                        >
                          {intl.formatMessage({ id: 'ORDERING_DRIVERS.INACTIVE_BADGE' })}
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <Button
                        variant="outline"
                        onClick={() => startEdit(driver)}
                        data-testid="drivers-edit"
                      >
                        {intl.formatMessage({ id: 'ORDERING_DRIVERS.EDIT' })}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default OrderingDriversPage;
