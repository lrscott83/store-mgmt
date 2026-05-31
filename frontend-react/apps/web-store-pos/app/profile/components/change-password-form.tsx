import { useState } from 'react';
import { useIntl } from 'react-intl';

// LOCKED regex per spec PWD-4
export const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/;

interface ChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
}

interface ChangePasswordFormProps {
  isOnline: boolean;
  isLoading: boolean;
  onSubmit: (payload: ChangePasswordPayload) => void;
  error?: string;
}

export function ChangePasswordForm({
  isOnline,
  isLoading,
  onSubmit,
  error,
}: ChangePasswordFormProps) {
  const intl = useIntl();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');

    if (!oldPassword.trim()) {
      setValidationError(intl.formatMessage({ id: 'PROFILE.REQUIRED' }));
      return;
    }

    if (!PASSWORD_REGEX.test(newPassword)) {
      setValidationError(intl.formatMessage({ id: 'PROFILE.PASSWORD_REGEX_ERROR' }));
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError(intl.formatMessage({ id: 'PROFILE.PASSWORD_MISMATCH' }));
      return;
    }

    onSubmit({ oldPassword, newPassword });
  }

  const submitDisabled = isLoading || !isOnline;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'PROFILE.CHANGE_PASSWORD_TITLE' })}
      </h1>

      {!isOnline && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
          {intl.formatMessage({ id: 'PROFILE.OFFLINE_NOTICE' })}
        </p>
      )}

      {(validationError || error) && (
        <p role="alert" className="text-sm text-red-600">
          {validationError || error}
        </p>
      )}

      <div>
        <label htmlFor="oldPassword" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'PROFILE.OLD_PASSWORD' })}
        </label>
        <input
          id="oldPassword"
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          disabled={isLoading}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'PROFILE.NEW_PASSWORD' })}
        </label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={isLoading}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
        <p className="mt-1 text-xs text-gray-500">
          {intl.formatMessage({ id: 'PROFILE.PASSWORD_RULES' })}
        </p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'PROFILE.CONFIRM_PASSWORD' })}
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isLoading}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
      </div>

      <button
        type="submit"
        disabled={submitDisabled}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isLoading
          ? intl.formatMessage({ id: 'GENERAL.LOADING' })
          : intl.formatMessage({ id: 'PROFILE.CHANGE_PASSWORD_SUBMIT' })}
      </button>
    </form>
  );
}

export default ChangePasswordForm;
