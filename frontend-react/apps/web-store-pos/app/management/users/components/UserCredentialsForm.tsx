import { useState } from 'react';
import { useIntl } from 'react-intl';

interface CredentialsPayload {
  oldPassword: string;
  newPassword: string;
}

interface UserCredentialsFormProps {
  isOnline: boolean;
  isLoading: boolean;
  onSubmit: (values: CredentialsPayload) => void;
  error?: string;
}

export function UserCredentialsForm({
  isOnline,
  isLoading,
  onSubmit,
  error,
}: UserCredentialsFormProps) {
  const intl = useIntl();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');

    if (!PASSWORD_REGEX.test(newPassword)) {
      setValidationError(intl.formatMessage({ id: 'USERS.PASSWORD_POLICY' }));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setValidationError(intl.formatMessage({ id: 'USERS.PASSWORDS_MUST_MATCH' }));
      return;
    }

    onSubmit({ oldPassword, newPassword });
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

      {validationError && (
        <p className="text-sm text-red-600">{validationError}</p>
      )}

      <div>
        <label htmlFor="oldPassword" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'USERS.OLD_PASSWORD' })}
        </label>
        <input
          id="oldPassword"
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'USERS.NEW_PASSWORD' })}
        </label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'USERS.CONFIRM_NEW_PASSWORD' })}
        </label>
        <input
          id="confirmNewPassword"
          type="password"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={!isOnline || isLoading}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {intl.formatMessage({ id: 'USERS.CHANGE_PASSWORD' })}
      </button>
    </form>
  );
}

export default UserCredentialsForm;
