import { useIntl } from 'react-intl';
import type { WholesaleConfig, WholesaleTier } from '@store-mgmt/domain';
import { PlusIcon, TrashIcon } from '~/shared/components/ui/icons';

/**
 * Sección \"Vender por mayor\" del formulario de producto (create/edit). Componente controlado:
 * `value === undefined` → desactivado; activar emite una config por defecto
 * (`packSize: 24`, tier base `minPacks: 1` con el precio retail). Cada edición emite la config
 * completa vía `onChange`. La validación de reglas (validateWholesaleConfig) la hace el modal
 * al guardar — este componente solo modela el estado.
 *
 * Campos numéricos: el contenido vacío se preserva (emite NaN, el input renderiza '')
 * — nunca se coacciona a 0 al escribir, para que borrar y reescribir un valor no sea
 * engorroso. La validación al guardar es la que exige enteros/precios válidos.
 */
interface WholesaleConfigSectionProps {
  value: WholesaleConfig | undefined;
  retailPrice: number;
  onChange: (config: WholesaleConfig | undefined) => void;
}

export function WholesaleConfigSection({ value, retailPrice, onChange }: WholesaleConfigSectionProps) {
  const intl = useIntl();

  const enabled = value !== undefined;

  function toggle(checked: boolean) {
    if (checked) {
      onChange({ packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: retailPrice }] });
    } else {
      onChange(undefined);
    }
  }

  function updateTiers(tiers: WholesaleTier[]) {
    if (!value) return;
    onChange({ ...value, tiers });
  }

  function updatePackSize(packSize: number) {
    if (!value) return;
    onChange({ ...value, packSize });
  }

  function addTier() {
    if (!value) return;
    const lastMin = value.tiers[value.tiers.length - 1]?.minPacks ?? 0;
    updateTiers([...value.tiers, { minPacks: lastMin + 1, pricePerUnit: retailPrice }]);
  }

  function removeTier(index: number) {
    if (!value) return;
    updateTiers(value.tiers.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2 rounded-md border border-gray-200 p-3">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-cyan-600"
          data-testid="wholesale-toggle"
        />
        <span className="text-xs font-medium text-gray-600">
          {intl.formatMessage({ id: 'SALES.WHOLESALE.ENABLE' })}
        </span>
      </label>

      {enabled && value && (
        <div className="space-y-3 pl-6">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {intl.formatMessage({ id: 'SALES.WHOLESALE.PACK_SIZE' })}
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={Number.isFinite(value.packSize) ? value.packSize : ''}
              onChange={(e) => updatePackSize(parseInt(e.target.value, 10))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
              data-testid="wholesale-pack-size-input"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">
                {intl.formatMessage({ id: 'SALES.WHOLESALE.TIERS_TITLE' })}
              </span>
              <button
                type="button"
                onClick={addTier}
                className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700"
                data-testid="wholesale-add-tier"
              >
                <PlusIcon />
                {intl.formatMessage({ id: 'SALES.WHOLESALE.ADD_TIER' })}
              </button>
            </div>
            <div className="space-y-2">
              {value.tiers.map((tier, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-500">
                      {intl.formatMessage({ id: 'SALES.WHOLESALE.MIN_PACKS' })}
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={Number.isFinite(tier.minPacks) ? tier.minPacks : ''}
                      onChange={(e) => {
                        const minPacks = parseInt(e.target.value, 10);
                        updateTiers(value.tiers.map((t, i) => (i === index ? { ...t, minPacks } : t)));
                      }}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      data-testid={`wholesale-tier-min-${index}`}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-500">
                      {intl.formatMessage({ id: 'SALES.WHOLESALE.PRICE_PER_UNIT' })}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={Number.isFinite(tier.pricePerUnit) ? tier.pricePerUnit : ''}
                      onChange={(e) => {
                        const pricePerUnit = parseFloat(e.target.value);
                        updateTiers(value.tiers.map((t, i) => (i === index ? { ...t, pricePerUnit } : t)));
                      }}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      data-testid={`wholesale-tier-price-${index}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTier(index)}
                    className="mt-4 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
                    aria-label={intl.formatMessage({ id: 'SALES.WHOLESALE.REMOVE_TIER' })}
                    data-testid={`wholesale-remove-tier-${index}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}