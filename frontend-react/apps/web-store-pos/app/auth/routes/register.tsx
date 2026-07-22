import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useIntl } from 'react-intl';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import { authHttpService } from '~/shared/lib/http/auth-http-service';
import { EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';
import { guestOnlyLoader } from './loaders';

export const clientLoader = guestOnlyLoader;

interface FormState {
  fullName: string;
  login: string;
  email: string;
  cellPhone: string;
  storeName: string;
  password: string;
  passwordConfirmation: string;
}

interface FormErrors {
  fullName?: string;
  login?: string;
  email?: string;
  cellPhone?: string;
  storeName?: string;
  password?: string;
  passwordConfirmation?: string;
  form?: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code') ?? undefined;

  const [form, setForm] = useState<FormState>({
    fullName: '',
    login: '',
    email: '',
    cellPhone: '',
    storeName: '',
    password: '',
    passwordConfirmation: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  // Angular register.component.html:100-103,122-125: a SINGLE showPassword
  // boolean drives BOTH the password and confirm-password fields — two
  // buttons, one shared state, not independent toggles.
  const [showPassword, setShowPassword] = useState(false);

  const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

  function requiredError(fieldName: string): string {
    return intl.formatMessage({ id: 'GENERAL.VALIDATION.REQUIRED' }, { name: fieldName });
  }

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!form.fullName.trim()) {
      errs.fullName = requiredError(intl.formatMessage({ id: 'GENERAL.FULL_NAME' }));
    }
    if (!form.login.trim()) {
      errs.login = requiredError(intl.formatMessage({ id: 'GENERAL.LOGIN' }));
    }
    if (!form.cellPhone.trim()) {
      errs.cellPhone = requiredError(intl.formatMessage({ id: 'GENERAL.CELL_PHONE' }));
    }
    if (!form.storeName.trim()) {
      errs.storeName = requiredError(intl.formatMessage({ id: 'STORE.STORE_NAME' }));
    }
    if (!form.password) {
      errs.password = requiredError(intl.formatMessage({ id: 'GENERAL.PASSWORD' }));
    } else if (!PASSWORD_POLICY_REGEX.test(form.password)) {
      errs.password = intl.formatMessage({ id: 'GENERAL.VALIDATION.PASSWORD_POLICY' });
    }
    if (!form.passwordConfirmation) {
      errs.passwordConfirmation = requiredError(
        intl.formatMessage({ id: 'GENERAL.CONFIRM_PASSWORD' })
      );
    } else if (form.password !== form.passwordConfirmation) {
      errs.passwordConfirmation = intl.formatMessage({ id: 'GENERAL.VALIDATION.INVALID_PASSWORD' });
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setIsOffline(false);

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    if (!ConnectivityService.isOnline()) {
      setIsOffline(true);
      return;
    }

    setIsLoading(true);
    try {
      const response = await authHttpService.register({
        fullName: form.fullName,
        login: form.login,
        email: form.email,
        cellPhone: form.cellPhone,
        storeName: form.storeName,
        password: form.password,
        code,
      });
      if (response.succeeded) {
        navigate('/login');
      } else {
        setErrors({ form: response.errors[0].description });
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number; data?: { message?: string } } };
      const status = axiosErr.response?.status;
      const message = axiosErr.response?.data?.message;
      if (status === 400) {
        if (message?.toLowerCase().includes('email')) {
          setErrors({ email: intl.formatMessage({ id: 'REGISTRATION.EMAIL_TAKEN' }) });
        } else {
          setErrors({
            form: message ?? intl.formatMessage({ id: 'REGISTRATION.VALIDATION_ERROR' }),
          });
        }
      } else {
        setErrors({ form: intl.formatMessage({ id: 'REGISTRATION.UNEXPECTED_ERROR' }) });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">
        {intl.formatMessage({ id: 'REGISTRATION.WELCOME' })}
      </h2>

      {isOffline && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {intl.formatMessage({ id: 'REGISTRATION.OFFLINE_BANNER' })}
        </div>
      )}

      {errors.form && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
            {intl.formatMessage({ id: 'GENERAL.FULL_NAME' })}
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.fullName && (
            <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="login" className="block text-sm font-medium text-gray-700 mb-1">
            {intl.formatMessage({ id: 'GENERAL.LOGIN' })}
          </label>
          <input
            id="login"
            type="text"
            autoComplete="username"
            value={form.login}
            onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.login && (
            <p className="mt-1 text-xs text-red-600">{errors.login}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            {intl.formatMessage({ id: 'GENERAL.EMAIL' })}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700 mb-1">
            {intl.formatMessage({ id: 'GENERAL.CELL_PHONE' })}
          </label>
          <input
            id="cellPhone"
            type="tel"
            autoComplete="tel"
            value={form.cellPhone}
            onChange={(e) => setForm((f) => ({ ...f, cellPhone: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.cellPhone && (
            <p className="mt-1 text-xs text-red-600">{errors.cellPhone}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="storeName" className="block text-sm font-medium text-gray-700 mb-1">
            {intl.formatMessage({ id: 'STORE.STORE_NAME' })}
          </label>
          <input
            id="storeName"
            type="text"
            autoComplete="organization"
            value={form.storeName}
            onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.storeName && (
            <p className="mt-1 text-xs text-red-600">{errors.storeName}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            {intl.formatMessage({ id: 'GENERAL.PASSWORD' })}
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={intl.formatMessage({
                id: showPassword ? 'SYNC.HIDE_PASSWORD' : 'SYNC.SHOW_PASSWORD',
              })}
              className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password}</p>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="passwordConfirmation" className="block text-sm font-medium text-gray-700 mb-1">
            {intl.formatMessage({ id: 'GENERAL.CONFIRM_PASSWORD' })}
          </label>
          <div className="relative">
            <input
              id="passwordConfirmation"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.passwordConfirmation}
              onChange={(e) => setForm((f) => ({ ...f, passwordConfirmation: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={intl.formatMessage({
                id: showPassword ? 'SYNC.HIDE_PASSWORD' : 'SYNC.SHOW_PASSWORD',
              })}
              className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
          {errors.passwordConfirmation && (
            <p className="mt-1 text-xs text-red-600">{errors.passwordConfirmation}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="acceptTerms" className="flex items-start gap-2 text-sm text-gray-700">
            <input
              id="acceptTerms"
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <span>
              {intl.formatMessage({ id: 'REGISTRATION.ACCEPT_CONDITIONS' })}
              <Link
                to="/terms-conditions"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-600 hover:text-cyan-700 font-medium"
              >
                {intl.formatMessage({ id: 'REGISTRATION.TERMS_CONDITIONS' })}
              </Link>
            </span>
          </label>
          <p className="mt-1 text-xs text-gray-500">
            {intl.formatMessage({ id: 'REGISTRATION.INFO_TERMS_CONDITIONS' })}
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading || !accepted}
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading
            ? intl.formatMessage({ id: 'AUTH.REGISTERING' })
            : intl.formatMessage({ id: 'REGISTRATION.SIGNUP_BUTTON' })}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-600">
        {intl.formatMessage({ id: 'REGISTRATION.ALREADY_ACCOUNT' })}{' '}
        <Link to="/login" className="text-cyan-600 hover:text-cyan-700 font-medium">
          {intl.formatMessage({ id: 'REGISTRATION.SIGNIN_LINK' })}
        </Link>
      </div>
    </div>
  );
}
