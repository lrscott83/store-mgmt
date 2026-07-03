import { useState } from 'react';
import { useIntl } from 'react-intl';
import { toDigits, formatCellPhone } from '~/management/users/lib/cell-phone-mask';

interface DetailsFormValues {
  fullName: string;
  cellPhone: string;
  email: string;
  isActive: boolean;
}

interface UserDetailsFormProps {
  initialValues?: Partial<DetailsFormValues>;
  isOnline: boolean;
  isLoading: boolean;
  canToggleActive: boolean;
  onSubmit: (values: DetailsFormValues) => void;
  error?: string;
}

export function UserDetailsForm({
  initialValues,
  isOnline,
  isLoading,
  canToggleActive,
  onSubmit,
  error,
}: UserDetailsFormProps) {
  const intl = useIntl();

  const [fullName, setFullName] = useState(initialValues?.fullName ?? '');
  const [cellPhone, setCellPhone] = useState(toDigits(initialValues?.cellPhone ?? ''));
  const [email, setEmail] = useState(initialValues?.email ?? '');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [cellPhoneError, setCellPhoneError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCellPhoneError('');

    if (!cellPhone.trim()) {
      setCellPhoneError(intl.formatMessage({ id: 'USERS.CELL_PHONE_REQUIRED' }));
      return;
    }

    onSubmit({ fullName, cellPhone, email, isActive });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isOnline && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
          {intl.formatMessage({ id: 'USERS.OFFLINE_NOTICE' })}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

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

      <div>
        <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'USERS.CELL_PHONE' })}
        </label>
        <input
          id="cellPhone"
          type="text"
          value={formatCellPhone(cellPhone)}
          onChange={(e) => { setCellPhone(toDigits(e.target.value)); setCellPhoneError(''); }}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {cellPhoneError && (
          <p className="mt-1 text-xs text-red-600">{cellPhoneError}</p>
        )}
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
          placeholder="info@mail.com"
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {canToggleActive && (
        <div className="flex items-center gap-2">
          <input
            id="isActive"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'USERS.IS_ACTIVE' })}
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={!isOnline || isLoading}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {intl.formatMessage({ id: 'USERS.UPDATE' })}
      </button>
    </form>
  );
}

export default UserDetailsForm;
