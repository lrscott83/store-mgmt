import { useState } from 'react';
import { useIntl } from 'react-intl';

interface EditProfileFormValues {
  fullName: string;
  cellPhone: string;
  email: string;
}

interface EditProfileFormProps {
  initialValues: EditProfileFormValues;
  isOnline: boolean;
  isLoading: boolean;
  onSubmit: (values: EditProfileFormValues) => void;
  error?: string;
  successMessage?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function EditProfileForm({
  initialValues,
  isOnline,
  isLoading,
  onSubmit,
  error,
  successMessage,
}: EditProfileFormProps) {
  const intl = useIntl();
  const [fullName, setFullName] = useState(initialValues.fullName);
  const [cellPhone, setCellPhone] = useState(initialValues.cellPhone);
  const [email, setEmail] = useState(initialValues.email);
  const [validationError, setValidationError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');

    if (!fullName.trim()) {
      setValidationError(intl.formatMessage({ id: 'PROFILE.REQUIRED' }));
      return;
    }

    if (email.trim() && !isValidEmail(email.trim())) {
      setValidationError(intl.formatMessage({ id: 'PROFILE.INVALID_EMAIL' }));
      return;
    }

    onSubmit({ fullName, cellPhone, email });
  }

  const submitDisabled = isLoading || !isOnline;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'PROFILE.EDIT_TITLE' })}
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

      {successMessage && (
        <p className="text-sm text-green-700">{successMessage}</p>
      )}

      <div>
        <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'PROFILE.FULL_NAME' })}
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={isLoading}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'PROFILE.CELL_PHONE' })}
        </label>
        <input
          id="cellPhone"
          type="text"
          value={cellPhone}
          onChange={(e) => setCellPhone(e.target.value)}
          disabled={isLoading}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'PROFILE.EMAIL' })}
        </label>
        <input
          id="email"
          type="text"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          ? intl.formatMessage({ id: 'PROFILE.SAVING' })
          : intl.formatMessage({ id: 'PROFILE.SAVE' })}
      </button>
    </form>
  );
}

export default EditProfileForm;
