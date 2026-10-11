import { useIntl } from 'react-intl';
import { CATALOG_TEMPLATES, DEFAULT_TEMPLATE_ID } from '~/catalog/templates/template-ids';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon } from '~/shared/components/ui/icons';
import { InfoBox } from '~/shared/components/ui/info-box';

interface StoreCatalogTemplateModalProps {
  open: boolean;
  /** Store whose catalog template is being set (null = closed). */
  storeId: string | null;
  storeName: string;
  /** Selected template id. */
  value: string;
  loading: boolean;
  saving: boolean;
  /** La carga de la plantilla falló: guardar queda bloqueado para no escribir un valor que no se leyó. */
  loadFailed: boolean;
  error?: string;
  onChange: (templateId: string) => void;
  onClose: () => void;
  onSave: () => void;
}

/**
 * "Plantilla del catálogo" del SuperAdmin: elige la VISTA del catálogo público de UNA tienda. Es
 * presentacional — el padre (`store-list.tsx`) es dueño de la carga, el borrador y el guardado —
 * igual que `StoreModulePricingModal`. Las opciones salen del registro ligero `CATALOG_TEMPLATES`
 * (sin arrastrar los componentes de plantilla al bundle del panel).
 */
export function StoreCatalogTemplateModal({
  open,
  storeId,
  storeName,
  value,
  loading,
  saving,
  loadFailed,
  error,
  onChange,
  onClose,
  onSave,
}: StoreCatalogTemplateModalProps) {
  const intl = useIntl();

  if (!open || !storeId) return null;

  // Version skew (R3-1): un id guardado que ESTE build no anuncia no tiene `<option>`, así que el
  // `select` quedaría sin selección válida. El storefront cae a `default` para ids desconocidos, así
  // que aquí se muestra ese mismo `default` — lo que se ve es lo que se pinta.
  const shownValue = CATALOG_TEMPLATES.some((template) => template.id === value)
    ? value
    : DEFAULT_TEMPLATE_ID;

  // R3-2: si la lectura falló, `value` es el default de relleno, NO lo que tiene la tienda; guardar
  // lo escribiría encima de la plantilla real. Bloquear el guardado hasta una carga correcta.
  const saveDisabled = loading || saving || loadFailed;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={`store-catalog-template-modal-${storeId}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">
            {intl.formatMessage({ id: 'STORES.CATALOG_TEMPLATE.TITLE' })}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            <CloseIcon />
          </button>
        </div>
        <p className="mb-4 text-sm text-text-muted" data-testid="store-catalog-template-store-name">
          {storeName}
        </p>

        {error && (
          <InfoBox variant="danger" className="mb-3">
            <span data-testid="store-catalog-template-error">{error}</span>
          </InfoBox>
        )}

        <label
          className="mb-1 block text-sm font-medium text-text"
          htmlFor="store-catalog-template-select"
        >
          {intl.formatMessage({ id: 'STORES.CATALOG_TEMPLATE.LABEL' })}
        </label>
        <select
          id="store-catalog-template-select"
          value={shownValue}
          disabled={loading || saving}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          data-testid="store-catalog-template-select"
        >
          {CATALOG_TEMPLATES.map((template) => (
            <option key={template.id} value={template.id}>
              {intl.formatMessage({ id: template.labelId })}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-muted">
          {intl.formatMessage({ id: 'STORES.CATALOG_TEMPLATE.HINT' })}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </Button>
          <Button
            variant="fab"
            onClick={onSave}
            disabled={saveDisabled}
            data-testid="store-catalog-template-save"
          >
            {intl.formatMessage({ id: saving ? 'STORES.SAVING' : 'GENERAL.SAVE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default StoreCatalogTemplateModal;
