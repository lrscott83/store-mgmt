import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { ownerOnlyLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import {
  getOnatConfig,
  saveOnatConfig,
  type OnatActivity,
  type OnatConfig,
} from '~/onat/lib/onat-storage';

/**
 * S2: la configuración fiscal es del Owner — `isOwnerAdmin` y NO `isSuperAdmin`.
 * Cualquier otro rol se deniega igual que en el resto de loaders (logout + /login).
 */
export async function clientLoader() {
  return ownerOnlyLoader();
}

/**
 * La forma del formulario es la configuración guardada sin el Owner: se deriva
 * del tipo persistido para no repetir la lista de campos fiscales.
 */
type OnatConfigForm = Omit<OnatConfig, 'ownerId'>;

type TextField = Exclude<keyof OnatConfigForm, 'actividades'>;

interface FieldDefinition {
  field: TextField;
  messageId: string;
  autoComplete?: string;
}

const FIELDS: readonly FieldDefinition[] = [
  { field: 'nombre', messageId: 'ONAT.NAME', autoComplete: 'organization' },
  { field: 'nit', messageId: 'ONAT.NIT' },
  { field: 'domicilioFiscal', messageId: 'ONAT.FISCAL_ADDRESS', autoComplete: 'street-address' },
  { field: 'domicilioLegal', messageId: 'ONAT.LEGAL_ADDRESS', autoComplete: 'street-address' },
  { field: 'municipio', messageId: 'ONAT.MUNICIPALITY', autoComplete: 'address-level2' },
  { field: 'provincia', messageId: 'ONAT.PROVINCE', autoComplete: 'address-level1' },
];

const LABEL_CLASSES = 'mb-1 block text-xs font-medium text-text';
const INPUT_CLASSES =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';
const PRIMARY_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-card transition-colors hover:bg-primary-hover';
const SECONDARY_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-white shadow-card transition-colors hover:opacity-90';
const OUTLINE_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-md border border-primary bg-transparent px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-light';

function createEmptyForm(): OnatConfigForm {
  return {
    nombre: '',
    nit: '',
    domicilioFiscal: '',
    domicilioLegal: '',
    municipio: '',
    provincia: '',
    actividades: [],
  };
}

/**
 * S11: formulario fiscal del Owner — nombre, NIT, domicilios, municipio,
 * provincia y actividades (nombre + código). Los datos se guardan por Owner en
 * `onat-storage`; la pantalla solo los edita.
 *
 * SSR: en el servidor no hay `window`, así que el primer render es el formulario
 * vacío y el efecto carga lo guardado al hidratar — mismo patrón que el resto de
 * pantallas que leen configuración de localStorage.
 */
export function OnatConfigurationsPage() {
  const intl = useIntl();
  const ownerId = useAuthStore((state) => state.user?.id ?? '');

  const [form, setForm] = useState<OnatConfigForm>(createEmptyForm);
  const [savedMessage, setSavedMessage] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!ownerId) {
      return;
    }
    setForm((current) => ({ ...current, ...getOnatConfig(ownerId) }));
  }, [ownerId]);

  const clearStatus = () => {
    setSavedMessage('');
    setSaveFailed(false);
  };

  const updateField = (field: TextField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    clearStatus();
  };

  const updateActivity = (index: number, field: keyof OnatActivity, value: string) => {
    setForm((prev) => ({
      ...prev,
      actividades: prev.actividades.map((actividad, position) =>
        position === index ? { ...actividad, [field]: value } : actividad,
      ),
    }));
    clearStatus();
  };

  const addActivity = () => {
    setForm((prev) => ({
      ...prev,
      actividades: [...prev.actividades, { nombre: '', codigo: '' }],
    }));
    clearStatus();
  };

  const removeActivity = (index: number) => {
    setForm((prev) => ({
      ...prev,
      actividades: prev.actividades.filter((_, position) => position !== index),
    }));
    clearStatus();
  };

  const save = () => {
    const result = saveOnatConfig({ ...form, ownerId });
    if (!result.succeeded) {
      // Nunca un éxito falso: el almacenamiento rechazó la escritura.
      setSavedMessage('');
      setSaveFailed(true);
      return;
    }
    setSaveFailed(false);
    setSavedMessage(intl.formatMessage({ id: 'ONAT.SAVED' }));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text">
          {intl.formatMessage({ id: 'ONAT.CONFIGURATIONS_TITLE' })}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {intl.formatMessage({ id: 'ONAT.CONFIGURATIONS_SUBTITLE' })}
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        {FIELDS.map(({ field, messageId, autoComplete }) => (
          <div key={field}>
            <label className={LABEL_CLASSES} htmlFor={`onat-${field}`}>
              {intl.formatMessage({ id: messageId })}
            </label>
            <input
              id={`onat-${field}`}
              className={INPUT_CLASSES}
              type="text"
              autoComplete={autoComplete}
              value={form[field]}
              onChange={(event) => updateField(field, event.target.value)}
            />
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">
          {intl.formatMessage({ id: 'ONAT.ACTIVITIES' })}
        </h2>

        {form.actividades.length === 0 && (
          <p className="text-sm text-text-muted">
            {intl.formatMessage({ id: 'ONAT.ACTIVITIES_EMPTY' })}
          </p>
        )}

        {form.actividades.length > 0 && (
          <ul className="space-y-3">
            {form.actividades.map((actividad, index) => (
              <li
                key={index}
                className="flex flex-col gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0 lg:flex-row lg:items-end"
              >
                <div className="min-w-0 flex-1">
                  <label className={LABEL_CLASSES} htmlFor={`onat-actividad-nombre-${index}`}>
                    {intl.formatMessage({ id: 'ONAT.ACTIVITY_NAME' })}
                  </label>
                  <input
                    id={`onat-actividad-nombre-${index}`}
                    className={INPUT_CLASSES}
                    type="text"
                    value={actividad.nombre}
                    onChange={(event) => updateActivity(index, 'nombre', event.target.value)}
                  />
                </div>

                <div className="w-full lg:w-40">
                  <label className={LABEL_CLASSES} htmlFor={`onat-actividad-codigo-${index}`}>
                    {intl.formatMessage({ id: 'ONAT.ACTIVITY_CODE' })}
                  </label>
                  <input
                    id={`onat-actividad-codigo-${index}`}
                    className={INPUT_CLASSES}
                    type="text"
                    inputMode="numeric"
                    value={actividad.codigo}
                    onChange={(event) => updateActivity(index, 'codigo', event.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeActivity(index)}
                  className={OUTLINE_BUTTON_CLASSES}
                >
                  {intl.formatMessage({ id: 'ONAT.REMOVE_ACTIVITY' })}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" onClick={addActivity} className={SECONDARY_BUTTON_CLASSES}>
          {intl.formatMessage({ id: 'ONAT.ADD_ACTIVITY' })}
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} className={PRIMARY_BUTTON_CLASSES}>
          {intl.formatMessage({ id: 'ONAT.SAVE' })}
        </button>

        {savedMessage !== '' && (
          <p role="status" className="text-sm font-medium text-success">
            {savedMessage}
          </p>
        )}

        {saveFailed && (
          <p role="alert" className="text-sm font-medium text-danger">
            {intl.formatMessage({ id: 'ONAT.SAVE_ERROR' })}
          </p>
        )}
      </div>
    </div>
  );
}

export default OnatConfigurationsPage;
