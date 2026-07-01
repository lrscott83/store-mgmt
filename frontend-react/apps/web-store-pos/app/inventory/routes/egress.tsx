import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { EgressEntry } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { EgressOfflineService } from '../lib/services/egress-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { EgressList } from '../components/egress-list';

export const clientLoader = featureLoader([EFeatures.Egress]);

type EgressView = 'today' | 'history';

interface EgressFormState {
  productId: string;
  quantity: string;
  egressType: EgressEntry['egressType'];
  notes: string;
  date: string;
}

function emptyForm(): EgressFormState {
  return {
    productId: '',
    quantity: '',
    egressType: 'waste',
    notes: '',
    date: new Date().toISOString().slice(0, 10),
  };
}

const EGRESS_TYPES: EgressEntry['egressType'][] = ['waste', 'return', 'transfer', 'adjustment'];
const EGRESS_TYPE_KEYS: Record<EgressEntry['egressType'], string> = {
  waste: 'EGRESS.TYPES.WASTE',
  return: 'EGRESS.TYPES.RETURN',
  transfer: 'EGRESS.TYPES.TRANSFER',
  adjustment: 'EGRESS.TYPES.ADJUSTMENT',
};

export function EgressPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [view, setView] = useState<EgressView>('today');
  const [egresses, setEgresses] = useState<EgressEntry[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [productNames, setProductNames] = useState<Map<string, string>>(new Map());

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState<EgressFormState>(emptyForm());
  const [formError, setFormError] = useState('');

  function loadData() {
    const svc = new EgressOfflineService(storeId);
    const productSvc = new ProductOfflineService(storeId);
    const prods = productSvc.getAll();
    const nameMap = new Map(prods.map((p) => [p.id, p.name]));
    setProducts(prods.map((p) => ({ id: p.id, name: p.name })));
    setProductNames(nameMap);

    if (view === 'today') {
      setEgresses(svc.getActiveToday());
    } else {
      setEgresses(svc.getAll().filter((e) => e.isActive));
    }
  }

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, view]);

  function openCreate() {
    setEditingId(undefined);
    setForm(emptyForm());
    setFormError('');
    setIsFormOpen(true);
  }

  function openEdit(entry: EgressEntry) {
    setEditingId(entry.id);
    setForm({
      productId: entry.productId,
      quantity: entry.quantity.toString(),
      egressType: entry.egressType,
      notes: entry.notes ?? '',
      date: new Date(entry.date).toISOString().slice(0, 10),
    });
    setFormError('');
    setIsFormOpen(true);
  }

  function handleDeactivate(entry: EgressEntry) {
    const svc = new EgressOfflineService(storeId);
    try {
      svc.deactivate(entry.id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  }

  function handleSubmit() {
    setFormError('');
    const qty = parseInt(form.quantity, 10);
    if (!form.productId) {
      setFormError(intl.formatMessage({ id: 'EGRESS.FORM.PRODUCT' }) + ' es requerido');
      return;
    }
    if (!form.quantity || isNaN(qty) || qty <= 0) {
      setFormError(intl.formatMessage({ id: 'EGRESS.FORM.QUANTITY' }) + ' debe ser mayor a 0');
      return;
    }

    const svc = new EgressOfflineService(storeId);
    try {
      if (editingId) {
        svc.update(editingId, qty, form.egressType, form.notes);
      } else {
          svc.create(
          form.productId,
          '', // categoryId — not required for egress tracking
          qty,
          form.egressType,
          form.notes,
          new Date(form.date),
        );
      }
      loadData();
      setIsFormOpen(false);
      setEditingId(undefined);
      setForm(emptyForm());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : intl.formatMessage({ id: 'GENERAL.ERROR' }));
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'EGRESS.TITLE' })}
        </h1>
        <button
          onClick={openCreate}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Nuevo egreso
        </button>
      </div>

      {/* Toggle today / history */}
      <div className="flex gap-1">
        {(['today', 'history'] as EgressView[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              view === v
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {v === 'today' ? 'Hoy' : 'Historial'}
          </button>
        ))}
      </div>

      <EgressList
        egresses={egresses}
        productNames={productNames}
        onEdit={openEdit}
        onDeactivate={handleDeactivate}
      />

      {/* Egress Form Modal */}
      {isFormOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsFormOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingId ? 'Editar egreso' : 'Nuevo egreso'}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {intl.formatMessage({ id: 'EGRESS.FORM.PRODUCT' })}
                </label>
                <select
                  value={form.productId}
                  onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
                  disabled={!!editingId}
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                >
                  <option value="">
                    {intl.formatMessage({ id: 'EGRESS.FORM.PRODUCT' })}...
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {intl.formatMessage({ id: 'EGRESS.FORM.QUANTITY' })}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {intl.formatMessage({ id: 'EGRESS.FORM.TYPE' })}
                </label>
                <select
                  value={form.egressType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      egressType: e.target.value as EgressEntry['egressType'],
                    }))
                  }
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {EGRESS_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {intl.formatMessage({ id: EGRESS_TYPE_KEYS[t] })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {intl.formatMessage({ id: 'EGRESS.FORM.NOTES' })}
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {!editingId && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {intl.formatMessage({ id: 'EGRESS.FORM.DATE' })}
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleSubmit}
                className="flex-1 rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {intl.formatMessage({ id: 'GENERAL.SAVE' })}
              </button>
              <button
                onClick={() => setIsFormOpen(false)}
                className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EgressPage;
