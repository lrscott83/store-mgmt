import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { ownerHttpService } from '~/admin/owners/lib/services/owner-http-service';
import { resellerHttpService } from '~/admin/resellers/lib/services/reseller-http-service';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useUnsavedChangesPrompt } from '~/shared/lib/hooks/use-unsaved-changes-prompt';
import { StoreListPage } from '~/management/stores/routes/store-list';
import type { Owner, ReSeller } from '@store-mgmt/domain';

export const clientLoader = resellerFeatureLoader([EFeatures.Owners]);

// ADR-4: Cuban +53 mobile format (from reseller-create.tsx:14)
const PHONE_REGEX = /^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/;

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
      .catch(() => {
        setLoadError(intl.formatMessage({ id: 'OWNER.ERROR' }));
      });
  }, [id, intl]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    resellerHttpService.listResellers().then((res) => {
      setResellers(res.data);
    }).catch(() => {
      // non-critical
    });
  }, [isSuperAdmin]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');
    setServerError('');

    if (!PHONE_REGEX.test(cellPhone)) {
      setValidationError(intl.formatMessage({ id: 'OWNER.PHONE_FORMAT' }));
      return;
    }

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

      // Re-snapshot after successful PUT — stay on page (ADR-5)
      setSnapshot({ fullName, cellPhone, email, description, isActive, reSellerId });
    } catch {
      setServerError(intl.formatMessage({ id: 'OWNER.ERROR' }));
    } finally {
      setIsSubmitting(false);
    }
  }

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
          {intl.formatMessage({ id: 'USERS.FULL_NAME' })}
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
          {intl.formatMessage({ id: 'USERS.CELL_PHONE' })}
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
          {intl.formatMessage({ id: 'USERS.EMAIL' })}
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
          {intl.formatMessage({ id: 'STORES.DESCRIPTION' })}
        </label>
        <input
          id="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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

      <button
        type="submit"
        disabled={!isDirty || isSubmitting}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {intl.formatMessage({ id: 'USERS.SAVE' })}
      </button>
    </form>
  );

  // Reseller: Details only, no tab shell
  if (!isSuperAdmin) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'OWNER.EDIT_TITLE' })}
        </h1>
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
        <div>
          <StoreListPage />
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
