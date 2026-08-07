import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { ownerHttpService } from '~/admin/owners/lib/services/owner-http-service';
import { ownerErrorMessageId } from '~/admin/owners/lib/owner-error-message';
import { API_ERROR_CODE_CELL_PHONE } from '~/shared/lib/http/api-error-message';
import { resellerHttpService } from '~/admin/resellers/lib/services/reseller-http-service';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useUnsavedChangesPrompt } from '~/shared/lib/hooks/use-unsaved-changes-prompt';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon, EditIcon } from '~/shared/components/ui/icons';
// presentation-parity-bucket-b WU2: Angular's app-store-list (store-list.component.html)
// is grid-only — no page title, no add-store fab. The old approach mounted the FULL
// AdminStoreListPage here, duplicating its own STORES.LIST_TITLE h1 + "+ Agregar" fab
// inside this tab. Render StoreCardList directly instead, with fetch/approve/disapprove/
// edit logic copied from `admin/stores/routes/store-list.tsx:26-70`. AdminStoreListPage
// itself stays untouched — still the sole list mounted at /admin/stores.
import { StoreCardList } from '~/admin/stores/components/store-card-list';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { confirmDialog } from '~/shared/lib/blocking-alert';
import type { Owner, ReSeller, Store } from '@store-mgmt/domain';

export const clientLoader = resellerFeatureLoader([EFeatures.Owners]);

// D-3: one hoisted map shared by BOTH arms of the load effect — the resolved
// succeeded:false envelope (actionCode) and the rejected .catch (response.status)
// — so a future edit can't drift them apart.
const LOAD_ERROR_KEYS: Record<number, string> = { 404: 'OWNER.NOT_FOUND', 403: 'OWNER.FORBIDDEN' };

type TabKey = 'details' | 'stores' | 'users';

interface Snapshot {
  fullName: string;
  cellPhone: string;
  email: string;
  description: string;
  isActive: boolean;
  reSellerId: string;
}

function makeSnapshot(o: Owner): Snapshot {
  return {
    fullName: o.fullName,
    cellPhone: o.cellPhone,
    email: o.email,
    description: o.description,
    isActive: o.isActive,
    reSellerId: o.reSellerId ?? '',
  };
}

export function OwnerEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const intl = useIntl();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.isSuperAdmin ?? false;

  const [owner, setOwner] = useState<Owner | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState('');

  // Form fields
  const [login, setLogin] = useState('');
  const [fullName, setFullName] = useState('');
  const [cellPhone, setCellPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [reSellerId, setReSellerId] = useState('');
  // ADR-8: guest carried from loaded state, NOT rendered
  const [guest, setGuest] = useState(false);

  const [resellers, setResellers] = useState<ReSeller[]>([]);
  const [validationError, setValidationError] = useState('');
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ADR-9: local tab state
  const [activeTab, setActiveTab] = useState<TabKey>('details');

  // presentation-parity-bucket-b WU2: Tiendas tab grid state (copied from
  // admin/stores/routes/store-list.tsx:23-38, 40-70).
  const [stores, setStores] = useState<Store[]>([]);
  const [storesError, setStoresError] = useState<string | undefined>(undefined);

  async function loadStores() {
    try {
      const res = await storeHttpService.listStores();
      if (!res.succeeded) {
        setStoresError(intl.formatMessage({ id: 'STORES.ERROR' }));
        return;
      }
      setStores(res.data);
      setStoresError(undefined);
    } catch {
      setStoresError(intl.formatMessage({ id: 'STORES.ERROR' }));
    }
  }

  async function handleApproveStore(storeId: string) {
    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'STORES.APPROVE_CONFIRM_TITLE' }),
      message: intl.formatMessage({ id: 'STORES.APPROVE_CONFIRM_MESSAGE' }),
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;
    try {
      await storeHttpService.approveStore(storeId);
      await loadStores();
    } catch {
      setStoresError(intl.formatMessage({ id: 'STORES.ERROR' }));
    }
  }

  async function handleDisapproveStore(storeId: string) {
    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'STORES.DISAPPROVE_CONFIRM_TITLE' }),
      message: intl.formatMessage({ id: 'STORES.DISAPPROVE_CONFIRM_MESSAGE' }),
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;
    try {
      await storeHttpService.disapproveStore(storeId);
      await loadStores();
    } catch {
      setStoresError(intl.formatMessage({ id: 'STORES.ERROR' }));
    }
  }

  // Dirty = any Details field differs from snapshot
  const isDirty = snapshot
    ? fullName !== snapshot.fullName ||
      cellPhone !== snapshot.cellPhone ||
      email !== snapshot.email ||
      description !== snapshot.description ||
      isActive !== snapshot.isActive ||
      reSellerId !== snapshot.reSellerId
    : false;

  useUnsavedChangesPrompt(isDirty);

  useEffect(() => {
    if (!id) return;
    ownerHttpService
      .getOwner(id)
      .then((res) => {
        if (!res.succeeded) {
          setLoadError(intl.formatMessage({ id: ownerErrorMessageId(res, LOAD_ERROR_KEYS) }));
          return;
        }
        const o = res.data;
        setOwner(o);
        setLogin((o as Owner & { login?: string }).login ?? '');
        setFullName(o.fullName);
        setCellPhone(o.cellPhone);
        setEmail(o.email);
        setDescription(o.description);
        setIsActive(o.isActive);
        setReSellerId(o.reSellerId ?? '');
        setGuest(o.guest);
        setSnapshot(makeSnapshot(o));
        setLoadError('');
      })
      .catch((error) => {
        setLoadError(intl.formatMessage({ id: ownerErrorMessageId(error, LOAD_ERROR_KEYS) }));
      });
  }, [id, intl]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    resellerHttpService.listResellers().then((res) => {
      if (!res.succeeded) return;
      setResellers(res.data);
    }).catch(() => {
      // non-critical
    });
  }, [isSuperAdmin]);

  // presentation-parity-bucket-b WU2: the Tiendas tab lazy-renders (ADR-9), so fetch
  // stores each time it becomes active — mirrors AdminStoreListPage's own mount-driven
  // fetch (`admin/stores/routes/store-list.tsx:36-38`).
  useEffect(() => {
    if (!isSuperAdmin || activeTab !== 'stores') return;
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadStores reads no reactive value
  }, [isSuperAdmin, activeTab]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');
    setServerError('');

    if (!id) return;

    setIsSubmitting(true);
    try {
      const res = await ownerHttpService.updateOwner(id, {
        fullName,
        cellPhone,
        email,
        guest,
        isActive: isSuperAdmin ? isActive : (owner?.isActive ?? true),
        description,
        reSellerId: isSuperAdmin ? reSellerId : (owner?.reSellerId ?? ''),
      });

      if (!res.succeeded) {
        setServerError(res.errors[0]?.description ?? intl.formatMessage({ id: 'OWNER.ERROR' }));
        return;
      }

      // D4: rehydrate BOTH the form fields and the dirty-check snapshot from the
      // persisted entity the server returned — not from local form state — so the
      // dirty indicator reflects what was actually saved. setOwner(res.data) keeps
      // the owner?.isActive/owner?.reSellerId fallbacks (lines 208, 210) reading the
      // persisted entity on a second save. Stay on page (ADR-5).
      const saved = res.data;
      setOwner(saved);
      setFullName(saved.fullName);
      setCellPhone(saved.cellPhone);
      setEmail(saved.email);
      setDescription(saved.description);
      setIsActive(saved.isActive);
      setReSellerId(saved.reSellerId ?? '');
      setSnapshot(makeSnapshot(saved));
    } catch (error) {
      setServerError(
        intl.formatMessage({
          id: ownerErrorMessageId(
            error,
            {
              404: 'OWNER.NOT_FOUND',
              403: 'OWNER.FORBIDDEN',
            },
            { [API_ERROR_CODE_CELL_PHONE]: 'OWNER.PHONE_REQUIRED' }
          ),
        })
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // edit-owner.component.ts:28-29 (openCreateOwnerModal): the Angular handler body is
  // empty — a no-op. Mirrored literally here, not implemented as a real create flow.
  function openCreateOwnerModal() {}

  if (loadError) {
    return (
      <div className="space-y-4 p-4">
        <p role="alert" className="text-sm text-red-600">{loadError}</p>
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-gray-500">{intl.formatMessage({ id: 'GENERAL.LOADING' })}</p>
      </div>
    );
  }

  // Render Details form (shared between SuperAdmin and Reseller)
  const detailsForm = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {(validationError || serverError) && (
        <p role="alert" className="text-sm text-red-600">
          {validationError || serverError}
        </p>
      )}

      <div>
        <label htmlFor="login" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'USERS.LOGIN' })}
        </label>
        <input
          id="login"
          type="text"
          value={login}
          disabled
          readOnly
          className="mt-1 block w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
        />
      </div>

      <div>
        <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'GENERAL.FULL_NAME' })}
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {isSuperAdmin && (
        <div>
          <label htmlFor="reSellerId" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'GENERAL.RESELLER' })}
          </label>
          <select
            id="reSellerId"
            value={reSellerId}
            onChange={(e) => setReSellerId(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">--</option>
            {resellers.map((r) => (
              <option key={r.id as string} value={r.id as string}>
                {r.fullName}
              </option>
            ))}
          </select>
        </div>
      )}

      {isSuperAdmin && (
        <div className="flex items-center gap-2">
          <input
            id="isActive"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'USERS.IS_ACTIVE' })}
          </label>
        </div>
      )}

      <div>
        <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'GENERAL.CELL_PHONE' })}
        </label>
        <input
          id="cellPhone"
          type="text"
          value={cellPhone}
          onChange={(e) => setCellPhone(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'GENERAL.EMAIL' })}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'GENERAL.DESCRIPTION' })}
        </label>
        <input
          id="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <Button type="submit" variant="fab" disabled={!isDirty || isSubmitting}>
        <EditIcon />
        {intl.formatMessage({ id: 'GENERAL.UPDATE' })}
      </Button>
    </form>
  );

  // edit-owner.component.html:4-9 — card-toolbar "+" fab, rendered unconditionally
  // (outside the isSuperAdmin @if), distinct from the details-form submit fab above.
  const toolbarFab = (
    <div className="flex justify-end">
      <Button type="button" variant="fab" onClick={openCreateOwnerModal}>
        <PlusIcon />
        {intl.formatMessage({ id: 'OWNER.ADD_OWNER' })}
      </Button>
    </div>
  );

  // Reseller: Details only, no tab shell
  if (!isSuperAdmin) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'OWNER.EDIT_TITLE' })}
        </h1>
        {toolbarFab}
        {detailsForm}
      </div>
    );
  }

  // SuperAdmin: 3-tab shell
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'OWNER.EDIT_TITLE' })}
      </h1>
      {toolbarFab}

      {/* Tab buttons */}
      <div className="flex gap-2 border-b pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('details')}
          className={`px-4 py-2 text-sm font-medium rounded-t ${activeTab === 'details' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
        >
          {intl.formatMessage({ id: 'GENERAL.DETAILS' })}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('stores')}
          className={`px-4 py-2 text-sm font-medium rounded-t ${activeTab === 'stores' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
        >
          {intl.formatMessage({ id: 'GENERAL.STORES' })}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-sm font-medium rounded-t ${activeTab === 'users' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
        >
          {intl.formatMessage({ id: 'GENERAL.USERS' })}
        </button>
      </div>

      {/* Tab panels — ADR-9: lazy render (only active panel) */}
      {activeTab === 'details' && detailsForm}

      {activeTab === 'stores' && (
        <div className="space-y-4">
          {storesError && <p role="alert" className="text-sm text-red-600">{storesError}</p>}
          <StoreCardList
            stores={stores}
            onEdit={(storeId) => navigate(`/management/stores/edit/${storeId}`)}
            onApprove={handleApproveStore}
            onDisapprove={handleDisapproveStore}
          />
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <p>{intl.formatMessage({ id: 'OWNER.USERS_TAB_PLACEHOLDER' })}</p>
        </div>
      )}
    </div>
  );
}

export default OwnerEditPage;
