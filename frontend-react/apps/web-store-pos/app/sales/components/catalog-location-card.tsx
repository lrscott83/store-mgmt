import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { OpeningHoursEntry, Store, WeekdayName } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { ChevronDownIcon, SaveIcon } from '~/shared/components/ui/icons';
import { InfoBox } from '~/shared/components/ui/info-box';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { showToastSuccess } from '~/shared/lib/toast';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { toStorePassThrough } from '~/management/stores/lib/store-location-payload';

/** Orden canónico de los días — el mismo que emite el serializador del backend. */
const WEEKDAYS: WeekdayName[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const DAY_LABEL_IDS: Record<WeekdayName, string> = {
  Monday: 'WEB_CATALOG.LOCATION_DAY_MONDAY',
  Tuesday: 'WEB_CATALOG.LOCATION_DAY_TUESDAY',
  Wednesday: 'WEB_CATALOG.LOCATION_DAY_WEDNESDAY',
  Thursday: 'WEB_CATALOG.LOCATION_DAY_THURSDAY',
  Friday: 'WEB_CATALOG.LOCATION_DAY_FRIDAY',
  Saturday: 'WEB_CATALOG.LOCATION_DAY_SATURDAY',
  Sunday: 'WEB_CATALOG.LOCATION_DAY_SUNDAY',
};

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none disabled:opacity-50';

interface DayHours {
  opens: string;
  closes: string;
}

/** Valores del formulario: las coordenadas viajan como texto y vacío significa "sin dato". */
interface LocationValues {
  publicPhone: string;
  addressCity: string;
  addressProvince: string;
  latitude: string;
  longitude: string;
  hours: Record<WeekdayName, DayHours>;
}

function emptyHours(): Record<WeekdayName, DayHours> {
  const hours = {} as Record<WeekdayName, DayHours>;
  for (const day of WEEKDAYS) {
    hours[day] = { opens: '', closes: '' };
  }
  return hours;
}

/** Una fila vacía por día; las entradas guardadas llenan su día. */
function toValues(store: Store): LocationValues {
  const hours = emptyHours();
  for (const entry of store.openingHours) {
    hours[entry.day] = { opens: entry.opens, closes: entry.closes };
  }
  return {
    publicPhone: store.publicPhone ?? '',
    addressCity: store.addressCity ?? '',
    addressProvince: store.addressProvince ?? '',
    // `typeof` cubre null Y propiedad ausente: una latitud omitida debe hidratar vacía,
    // nunca el literal "undefined" (algunos payloads no mandan las claves nulas).
    latitude: typeof store.latitude === 'number' ? String(store.latitude) : '',
    longitude: typeof store.longitude === 'number' ? String(store.longitude) : '',
    hours,
  };
}

/** Comparación estructural de los valores (sin serializar): expresa la regla "hay cambios". */
function sameLocationValues(a: LocationValues, b: LocationValues): boolean {
  return (
    a.publicPhone === b.publicPhone &&
    a.addressCity === b.addressCity &&
    a.addressProvince === b.addressProvince &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    WEEKDAYS.every(
      (day) =>
        a.hours[day].opens === b.hours[day].opens && a.hours[day].closes === b.hours[day].closes,
    )
  );
}

/**
 * Ubicación pública del catálogo (T8a): teléfono, ciudad, provincia, coordenadas y horario.
 * La captura vive AQUÍ, antes de los productos, y no en el formulario de tienda — el dato se
 * sigue guardando en `Store` y alimenta la ficha LocalBusiness de la página generada.
 *
 * Guarda por su cuenta (como la tarjeta "Marca"): el endpoint aplica el bloque de ubicación
 * COMPLETO bajo `updateLocation`, así que el guardado reenvía el bloque editado y deja pasar
 * sin tocar el resto de los datos de la tienda (nombre, dirección, descripción, aprobado,
 * activo) tal como vienen de un GET fresco hecho justo antes de guardar.
 */
export function CatalogLocationCard({ storeId }: { storeId: string }) {
  const intl = useIntl();
  const [isExpanded, setIsExpanded] = useState(true);
  const [store, setStore] = useState<Store | null>(null);
  const [values, setValues] = useState<LocationValues | null>(null);
  const [baseline, setBaseline] = useState<LocationValues | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [validationError, setValidationError] = useState('');

  const loadStore = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await storeHttpService.getStore(storeId);
      if (!result.succeeded) {
        setLoadError(intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_LOAD_ERROR' }));
        return;
      }
      setStore(result.data);
      const loaded = toValues(result.data);
      setValues(loaded);
      setBaseline(loaded);
    } catch (error) {
      setLoadError(
        intl.formatMessage({ id: httpErrorKey(error, 'WEB_CATALOG.LOCATION_LOAD_ERROR') }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [storeId, intl]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  const hasChanges =
    values !== null && baseline !== null && !sameLocationValues(values, baseline);

  function updateHours(day: WeekdayName, field: keyof DayHours, value: string) {
    setValues((prev) =>
      prev === null
        ? prev
        : { ...prev, hours: { ...prev.hours, [day]: { ...prev.hours[day], [field]: value } } },
    );
  }

  async function handleSave() {
    if (store === null || values === null) return;
    setSaveError('');
    setValidationError('');

    // Las coordenadas son un par o nada — el backend rechaza un valor suelto.
    const latitude = values.latitude.trim();
    const longitude = values.longitude.trim();
    if ((latitude === '') !== (longitude === '')) {
      setValidationError(
        intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_COORDINATES_PAIR_REQUIRED' }),
      );
      return;
    }
    // Un día está abierto solo si tiene AMBAS horas; medio día es un error, no "cerrado".
    const openingHours: OpeningHoursEntry[] = WEEKDAYS.map((day) => ({
      day,
      ...values.hours[day],
    })).filter((entry) => entry.opens !== '' || entry.closes !== '');
    if (openingHours.some((entry) => entry.opens === '' || entry.closes === '')) {
      setValidationError(
        intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_OPENING_HOURS_INCOMPLETE' }),
      );
      return;
    }

    setIsSaving(true);
    try {
      // GET fresco justo antes de guardar: este panel solo es dueño del bloque de ubicación,
      // pero el endpoint aplica el bloque COMPLETO bajo `updateLocation`. Reenviar el snapshot
      // de la carga pisaría cambios concurrentes (otra pestaña, otro admin) en el resto de los
      // datos; el GET de ahora reduce esa ventana al viaje de la petición.
      const fresh = await storeHttpService.getStore(storeId);
      if (!fresh.succeeded) {
        setSaveError(intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_SAVE_ERROR' }));
        return;
      }

      const result = await storeHttpService.updateStore(storeId, {
        id: storeId,
        ...toStorePassThrough(fresh.data),
        // Sin paymentStartDate: el ancla de facturación no se captura en esta vista y el
        // backend solo la aplica cuando llega con valor, así que omitirla la deja intacta.
        // Sin moduleIds/planId: el plan no se toca desde esta vista.
        updateLocation: true,
        publicPhone: values.publicPhone || undefined,
        addressCity: values.addressCity || undefined,
        addressProvince: values.addressProvince || undefined,
        latitude: latitude !== '' ? Number(latitude) : undefined,
        longitude: longitude !== '' ? Number(longitude) : undefined,
        openingHours,
      });
      if (!result.succeeded) {
        setSaveError(intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_SAVE_ERROR' }));
        return;
      }
      showToastSuccess(intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_SAVED' }));
      await loadStore();
    } catch (error) {
      setSaveError(
        intl.formatMessage({ id: httpErrorKey(error, 'WEB_CATALOG.LOCATION_SAVE_ERROR') }),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card
      title={
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="flex items-center gap-2 text-left"
          aria-expanded={isExpanded}
          data-testid="location-toggle"
        >
          <span>{intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_TITLE' })}</span>
          <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
        </button>
      }
      headerAction={
        <Button
          type="button"
          variant="fab"
          data-testid="location-save"
          disabled={isSaving || values === null || !hasChanges}
          onClick={() => void handleSave()}
        >
          <SaveIcon />
          {isSaving
            ? intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_SAVING' })
            : intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_SAVE' })}
        </Button>
      }
    >
      {isExpanded && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            {intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_SUBTITLE' })}
          </p>

          {isLoading && (
            <p className="text-sm text-text-muted">
              {intl.formatMessage({ id: 'GENERAL.LOADING' })}
            </p>
          )}

          {!isLoading && loadError !== '' && <InfoBox variant="danger">{loadError}</InfoBox>}

          {!isLoading && loadError === '' && values !== null && (
            <>
              <div>
                <label
                  htmlFor="location-public-phone"
                  className="block text-sm font-medium text-text"
                >
                  {intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_PUBLIC_PHONE' })}
                </label>
                <input
                  id="location-public-phone"
                  type="tel"
                  value={values.publicPhone}
                  onChange={(event) => setValues({ ...values, publicPhone: event.target.value })}
                  disabled={isSaving}
                  aria-label={intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_PUBLIC_PHONE' })}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="location-address-city"
                    className="block text-sm font-medium text-text"
                  >
                    {intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_ADDRESS_CITY' })}
                  </label>
                  <input
                    id="location-address-city"
                    type="text"
                    value={values.addressCity}
                    onChange={(event) =>
                      setValues({ ...values, addressCity: event.target.value })
                    }
                    disabled={isSaving}
                    aria-label={intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_ADDRESS_CITY' })}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label
                    htmlFor="location-address-province"
                    className="block text-sm font-medium text-text"
                  >
                    {intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_ADDRESS_PROVINCE' })}
                  </label>
                  <input
                    id="location-address-province"
                    type="text"
                    value={values.addressProvince}
                    onChange={(event) =>
                      setValues({ ...values, addressProvince: event.target.value })
                    }
                    disabled={isSaving}
                    aria-label={intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_ADDRESS_PROVINCE' })}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="location-latitude"
                    className="block text-sm font-medium text-text"
                  >
                    {intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_LATITUDE' })}
                  </label>
                  <input
                    id="location-latitude"
                    type="number"
                    step="any"
                    value={values.latitude}
                    onChange={(event) => setValues({ ...values, latitude: event.target.value })}
                    disabled={isSaving}
                    aria-label={intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_LATITUDE' })}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label
                    htmlFor="location-longitude"
                    className="block text-sm font-medium text-text"
                  >
                    {intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_LONGITUDE' })}
                  </label>
                  <input
                    id="location-longitude"
                    type="number"
                    step="any"
                    value={values.longitude}
                    onChange={(event) => setValues({ ...values, longitude: event.target.value })}
                    disabled={isSaving}
                    aria-label={intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_LONGITUDE' })}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-text">
                  {intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_OPENING_HOURS' })}
                </span>
                <p className="text-xs text-text-muted">
                  {intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_OPENING_HOURS_HINT' })}
                </p>
                <div className="mt-2 space-y-2">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-sm text-text">
                        {intl.formatMessage({ id: DAY_LABEL_IDS[day] })}
                      </span>
                      <input
                        type="time"
                        value={values.hours[day].opens}
                        onChange={(event) => updateHours(day, 'opens', event.target.value)}
                        disabled={isSaving}
                        aria-label={`${intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_OPENS' })} ${intl.formatMessage({ id: DAY_LABEL_IDS[day] })}`}
                        className={INPUT_CLASS}
                      />
                      <input
                        type="time"
                        value={values.hours[day].closes}
                        onChange={(event) => updateHours(day, 'closes', event.target.value)}
                        disabled={isSaving}
                        aria-label={`${intl.formatMessage({ id: 'WEB_CATALOG.LOCATION_CLOSES' })} ${intl.formatMessage({ id: DAY_LABEL_IDS[day] })}`}
                        className={INPUT_CLASS}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {(validationError !== '' || saveError !== '') && (
                <InfoBox variant="danger">{validationError || saveError}</InfoBox>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
