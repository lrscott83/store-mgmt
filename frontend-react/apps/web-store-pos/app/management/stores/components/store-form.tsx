import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Module, Owner, Store } from '@store-mgmt/domain';
import { ModulePicker } from './module-picker';

interface StoreFormValues {
  name: string;
  address: string;
  description: string;
  ownerId: string;
  approved: boolean;
  paymentStartDate: string;
  isActive: boolean;
  moduleIds: number[];
}

interface StoreFormProps {
  modules: Module[];
  owners: Owner[];
  initialValues?: Partial<Store>;
  isOnline: boolean;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isOwnerAdmin: boolean;
  isEditMode: boolean;
  onSubmit: (values: StoreFormValues) => void;
  error?: string;
}

export function StoreForm({
  modules,
  owners,
  initialValues,
  isOnline,
  isLoading,
  isSuperAdmin,
  isOwnerAdmin,
  isEditMode,
  onSubmit,
  error,
}: StoreFormProps) {
  const intl = useIntl();

  const [name, setName] = useState(initialValues?.name ?? '');
  const [address, setAddress] = useState(initialValues?.address ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [ownerId, setOwnerId] = useState(initialValues?.ownerId ?? '');
  const [approved, setApproved] = useState(initialValues?.approved ?? false);
  const [paymentStartDate, setPaymentStartDate] = useState(
    initialValues?.paymentStartDate
      ? new Date(initialValues.paymentStartDate).toISOString().split('T')[0]
      : ''
  );
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [moduleIds, setModuleIds] = useState<number[]>(() =>
    modules.filter((m) => m.priceIncluded || m.selected).map((m) => m.id)
  );
  const [validationError, setValidationError] = useState('');

  const isAdminUser = isSuperAdmin || isOwnerAdmin;
  const submitDisabled = isLoading || !isOnline;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');
    if (!name.trim()) {
      setValidationError(intl.formatMessage({ id: 'STORES.NAME_REQUIRED' }));
      return;
    }
    onSubmit({
      name,
      address,
      description,
      ownerId,
      approved,
      paymentStartDate,
      isActive,
      moduleIds,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isOnline && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
          {intl.formatMessage({ id: 'STORES.OFFLINE_NOTICE' })}
        </p>
      )}

      {(validationError || error) && (
        <p role="alert" className="text-sm text-red-600">
          {validationError || error}
        </p>
      )}

      <div>
        <label htmlFor="store-name" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'STORES.NAME' })}
        </label>
        <input
          id="store-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          aria-label={intl.formatMessage({ id: 'STORES.NAME' })}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="store-address" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'STORES.ADDRESS' })}
        </label>
        <input
          id="store-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={isLoading}
          aria-label={intl.formatMessage({ id: 'STORES.ADDRESS' })}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
      </div>

      {isAdminUser && (
        <div>
          <label htmlFor="store-description" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'STORES.DESCRIPTION' })}
          </label>
          <textarea
            id="store-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLoading}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
          />
        </div>
      )}

      {isAdminUser && (
        <div>
          <label htmlFor="store-owner" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'STORES.OWNER' })}
          </label>
          <select
            id="store-owner"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            disabled={isLoading}
            aria-label={intl.formatMessage({ id: 'STORES.OWNER' })}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
          >
            <option value="">--</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName}
              </option>
            ))}
          </select>
        </div>
      )}

      {isAdminUser && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="store-approved"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
            disabled={isLoading}
          />
          <label htmlFor="store-approved" className="text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'STORES.APPROVED' })}
          </label>
        </div>
      )}

      {isSuperAdmin && isEditMode && (
        <div>
          <label htmlFor="store-payment-start" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'STORES.PAYMENT_START_DATE' })}
          </label>
          <input
            id="store-payment-start"
            type="date"
            value={paymentStartDate}
            onChange={(e) => setPaymentStartDate(e.target.value)}
            disabled={isLoading}
            aria-label={intl.formatMessage({ id: 'STORES.PAYMENT_START_DATE' })}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
          />
        </div>
      )}

      {isSuperAdmin && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="store-is-active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={isLoading}
          />
          <label htmlFor="store-is-active" className="text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'STORES.IS_ACTIVE' })}
          </label>
        </div>
      )}

      <ModulePicker modules={modules} onChange={setModuleIds} />

      <button
        type="submit"
        disabled={submitDisabled}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isLoading
          ? intl.formatMessage({ id: 'STORES.SAVING' })
          : intl.formatMessage({ id: 'STORES.SAVE' })}
      </button>
    </form>
  );
}

export default StoreForm;
