import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Module } from '@store-mgmt/domain';
import { formatCurrency } from '~/shared/lib/format-currency';

/** Format as "5.00 USD" (no $ symbol) — plan-picker only. */
function formatPlanPrice(amount: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} USD`;
}

interface PlanPickerProps {
  modules: Module[];
  onChange: (selectedIds: number[]) => void;
  /**
   * DG-7: when true, the "Activar este plan" button does not render. Tabs
   * still render (browsing the catalog stays available) — `onChange` is
   * wired ONLY to that button (`choosePlan`), so removing it structurally
   * prevents `onChange` from firing on tab interaction. Defaults to false.
   */
  readOnly?: boolean;
}

type Plan = 'free' | 'paid';

const getFreeModules = (modules: Module[]) => modules.filter((m) => m.priceIncluded);
const getPaidModules = (modules: Module[]) => modules.filter((m) => !m.priceIncluded);
const getPaidTotal = (modules: Module[]) =>
  getPaidModules(modules).reduce((sum, m) => sum + m.currentPrice, 0);
const getPaidOriginalTotal = (modules: Module[]) =>
  getPaidModules(modules).reduce((sum, m) => sum + m.price, 0);
const getActivePlan = (modules: Module[]): Plan =>
  getPaidModules(modules).some((m) => m.selected) ? 'paid' : 'free';
const getPlanModuleIds = (modules: Module[], plan: Plan) =>
  (plan === 'paid' ? modules : getFreeModules(modules)).map((m) => m.id);

export function PlanPicker({ modules, onChange, readOnly = false }: PlanPickerProps) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const active = getActivePlan(modules);
  const [selected, setSelected] = useState<Plan>(active);
  const [tab, setTab] = useState<Plan>(active);

  // Sync to the store's active plan when modules arrive/refresh async.
  // Never call onChange here — the parent already holds the correct init moduleIds.
  useEffect(() => {
    const next = getActivePlan(modules);
    setSelected(next);
    setTab(next);
  }, [modules]);

  const paidTotal = getPaidTotal(modules);
  const paidOriginalTotal = getPaidOriginalTotal(modules);
  const hasDiscount = paidTotal < paidOriginalTotal;
  const panelModules = tab === 'free' ? getFreeModules(modules) : getPaidModules(modules);

  function choosePlan(plan: Plan) {
    setSelected(plan);
    onChange(getPlanModuleIds(modules, plan));
  }

  function tabClass(isActive: boolean) {
    return `flex items-center gap-2 px-4 py-2 text-sm font-medium ${
      isActive ? 'border-b-2 border-primary text-primary' : 'text-gray-500'
    }`;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">{t('STORES.PLAN.SECTION_TITLE')}</p>

      <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        {t('STORES.PLAN.BILLING_NOTICE')}
      </p>

      <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {t('STORES.PLAN.CURRENCY_NOTICE')}
      </p>

      <div className="flex border-b border-gray-200" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'free'}
          onClick={() => setTab('free')} className={tabClass(tab === 'free')}>
          {t('STORES.PLAN.FREE_TAB')}
          {active === 'free' && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
              {t('STORES.PLAN.ACTIVE_BADGE')}
            </span>
          )}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'paid'}
          onClick={() => setTab('paid')} className={tabClass(tab === 'paid')}>
          <span className="flex items-center gap-2">
            {t('STORES.PLAN.PAID_TAB')} ·
            {hasDiscount && (
              <span className="text-gray-400 line-through">
                {formatPlanPrice(paidOriginalTotal)}
              </span>
            )}
            <span className="font-semibold">
              {formatPlanPrice(paidTotal)}
            </span>
          </span>
          {active === 'paid' && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
              {t('STORES.PLAN.ACTIVE_BADGE')}
            </span>
          )}
        </button>
      </div>

      <div role="tabpanel" className="space-y-2">
        <p className="text-sm text-gray-700">
          {tab === 'free' ? t('STORES.PLAN.INCLUDES') : t('STORES.PLAN.INCLUDES_FREE_PLUS')}
        </p>
        <ul className="list-inside list-disc text-sm text-gray-700">
          {panelModules.map((m) => (
            <li key={m.id}>{m.name}</li>
          ))}
        </ul>

        {selected === tab ? (
          <p className="text-sm font-medium text-primary">{t('STORES.PLAN.SELECTED')}</p>
        ) : (
          !readOnly && (
            <button type="button" onClick={() => choosePlan(tab)}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white">
              {t('STORES.PLAN.ACTIVATE')}
            </button>
          )
        )}

        {selected === tab && selected !== active && (
          <p className="text-xs text-amber-700">{t('STORES.PLAN.WILL_ACTIVATE_ON_SAVE')}</p>
        )}
      </div>
    </div>
  );
}

export default PlanPicker;
