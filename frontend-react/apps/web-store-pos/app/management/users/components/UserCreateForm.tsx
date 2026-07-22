import { useState } from 'react';
import { useIntl } from 'react-intl';
import { toDigits, formatCellPhone } from '~/management/users/lib/cell-phone-mask';
import { Button } from '~/shared/components/ui/button';
import { EyeIcon, EyeOffIcon, PlusIcon } from '~/shared/components/ui/icons';

const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/;

interface CreateFormValues {
  fullName: string;
  login: string;
  password: string;
  cellPhone: string;
  email: string;
}

interface UserCreateFormProps {
  storeId?: string;
  isOnline: boolean;
  isLoading: boolean;
  onSubmit: (values: CreateFormValues) => void;
  error?: string;
}

export function UserCreateForm({
  isOnline,
  isLoading,
  onSubmit,
  error,
}: UserCreateFormProps) {
  const intl = useIntl();

  const [fullName, setFullName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cellPhone, setCellPhone] = useState('');
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState('');
  // create-store-user.component.html:43-48,63-68: a SINGLE showPassword
  // boolean drives BOTH password + confirmPassword fields.
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');

    if (!PASSWORD_REGEX.test(password)) {
      setValidationError(intl.formatMessage({ id: 'USERS.PASSWORD_POLICY' }));
      return;
    }

    if (password !== confirmPassword) {
      setValidationError(intl.formatMessage({ id: 'USERS.PASSWORDS_MUST_MATCH' }));
      return;
    }

    onSubmit({ fullName, login, password, cellPhone, email });
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
        <label htmlFor="login" className="block text-sm font-medium text-gray-700">
          {intl.formatMessage({ id: 'USERS.LOGIN' })}
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
          {intl.formatMessage({ id: 'USERS.PASSWORD' })}
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
            aria-label={intl.formatMessage({
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
          {intl.formatMessage({ id: 'USERS.CONFIRM_PASSWORD' })}
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
            aria-label={intl.formatMessage({
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
          {intl.formatMessage({ id: 'USERS.CELL_PHONE' })}
        </label>
        <input
          id="cellPhone"
          type="text"
          value={formatCellPhone(cellPhone)}
          onChange={(e) => setCellPhone(toDigits(e.target.value))}
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
          placeholder="info@mail.com"
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <Button type="submit" variant="fab" disabled={!isOnline || isLoading}>
        <PlusIcon />
        {intl.formatMessage({ id: 'USERS.SAVE' })}
      </Button>
    </form>
  );
}

export default UserCreateForm;
