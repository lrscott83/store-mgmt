import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { resellerHttpService } from '~/admin/resellers/lib/services/reseller-http-service';
import { apiErrorMessageId, API_ERROR_CODE_CELL_PHONE } from '~/shared/lib/http/api-error-message';
import { useUnsavedChangesPrompt } from '~/shared/lib/hooks/use-unsaved-changes-prompt';
import { Button } from '~/shared/components/ui/button';
import { EyeIcon, EyeOffIcon, PlusIcon } from '~/shared/components/ui/icons';

export const clientLoader = superAdminLoader;

// ADR-3: EXACT copy from management/users/components/UserCreateForm.tsx:4
const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/;

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
  // create-reseller.component.html:42-47,64-69: a SINGLE showPassword boolean
  // drives BOTH password + confirmPassword fields.
  const [showPassword, setShowPassword] = useState(false);

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
    } catch (error) {
      setServerError(
        formatMessage({
          id: apiErrorMessageId(error, {
            byCode: { [API_ERROR_CODE_CELL_PHONE]: 'RESELLERS.PHONE_REQUIRED' },
            fallback: 'RESELLERS.ERROR',
          }),
        })
      );
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
            {formatMessage({ id: 'GENERAL.FULL_NAME' })}
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
            {formatMessage({ id: 'GENERAL.PASSWORD' })}
          </label>
          <div className="relative mt-1">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="block w-full rounded border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={formatMessage({
                id: showPassword ? 'SYNC.HIDE_PASSWORD' : 'SYNC.SHOW_PASSWORD',
              })}
              className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? <EyeIcon className="h-5 w-5" /> : <EyeOffIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'USERS.CONFIRM_PASSWORD' })}
          </label>
          <div className="relative mt-1">
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="block w-full rounded border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={formatMessage({
                id: showPassword ? 'SYNC.HIDE_PASSWORD' : 'SYNC.SHOW_PASSWORD',
              })}
              className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? <EyeIcon className="h-5 w-5" /> : <EyeOffIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'GENERAL.CELL_PHONE' })}
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
            {formatMessage({ id: 'GENERAL.EMAIL' })}
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
            {formatMessage({ id: 'GENERAL.DESCRIPTION' })}
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
          <PlusIcon />
          {formatMessage({ id: 'GENERAL.ADD' })}
        </Button>
      </form>
    </div>
  );
}

export default ResellerCreatePage;
