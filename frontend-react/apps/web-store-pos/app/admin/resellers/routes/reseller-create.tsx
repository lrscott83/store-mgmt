import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { resellerHttpService } from '~/admin/resellers/lib/services/reseller-http-service';
import { useUnsavedChangesPrompt } from '~/shared/lib/hooks/use-unsaved-changes-prompt';

export const loader = superAdminLoader;

// ADR-3: EXACT copy from management/users/components/UserCreateForm.tsx:4
const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/;

// ADR-4: Cuban +53 mobile format
const PHONE_REGEX = /^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/;

export function ResellerCreatePage() {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();

  const [fullName, setFullName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cellPhone, setCellPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');

  const [validationError, setValidationError] = useState('');
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = Boolean(fullName || login || password || confirmPassword || cellPhone || email || description);

  // ADR-5: only the hook — no UnsavedChangesDialog wiring
  useUnsavedChangesPrompt(isDirty);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');
    setServerError('');

    // ADR-3: two-step validate — regex then match (mirrors UserCreateForm.tsx:42-50)
    if (!PASSWORD_REGEX.test(password)) {
      setValidationError(formatMessage({ id: 'RESELLERS.PASSWORD_POLICY' }));
      return;
    }

    if (password !== confirmPassword) {
      setValidationError(formatMessage({ id: 'RESELLERS.PASSWORDS_MUST_MATCH' }));
      return;
    }

    // ADR-4: phone validation
    if (!PHONE_REGEX.test(cellPhone)) {
      setValidationError(formatMessage({ id: 'RESELLERS.PHONE_FORMAT' }));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await resellerHttpService.createReseller({
        fullName,
        login,
        password,
        cellPhone,
        email,
        description,
      });

      if (!res.succeeded) {
        setServerError(res.errors[0]?.description ?? formatMessage({ id: 'RESELLERS.ERROR' }));
        return;
      }

      navigate('/admin/resellers');
    } catch {
      setServerError(formatMessage({ id: 'RESELLERS.ERROR' }));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {formatMessage({ id: 'RESELLERS.CREATE_TITLE' })}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {(validationError || serverError) && (
          <p role="alert" className="text-sm text-red-600">
            {validationError || serverError}
          </p>
        )}

        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'USERS.FULL_NAME' })}
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
          <label htmlFor="login" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'USERS.LOGIN' })}
          </label>
          <input
            id="login"
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'USERS.PASSWORD' })}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'USERS.CONFIRM_PASSWORD' })}
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'USERS.CELL_PHONE' })}
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
            {formatMessage({ id: 'USERS.EMAIL' })}
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
            {formatMessage({ id: 'STORES.DESCRIPTION' })}
          </label>
          <input
            id="description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {formatMessage({ id: 'USERS.SAVE' })}
        </button>
      </form>
    </div>
  );
}

export default ResellerCreatePage;
