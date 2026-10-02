import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useIntl } from 'react-intl';
import { LoadingOverlay } from '@store-mgmt/web-common/client';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import { authHttpService } from '~/shared/lib/http/auth-http-service';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { resolveUserHomePath } from '~/shared/lib/auth/user-home';
import { armTracking } from '~/shared/lib/usage/store-usage-tracker';
import { preloadHeavyChunks } from '~/shared/lib/pwa/preload-heavy-chunks';
import { Button } from '~/shared/components/ui/button';
import { EyeIcon, EyeOffIcon, LockOpenIcon } from '~/shared/components/ui/icons';
import { showBlockingError } from '~/shared/lib/blocking-alert';
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
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code') ?? undefined;
  // Same convention as login.tsx: the action comes from the hook (not
  // `getState()`), so the harnesses can mock this module wholesale.
  const { login: signIn } = useAuthStore();

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
  // Covers ONLY the post-registration leg (sign-in -> /me -> DEK -> home), so
  // the button's "Registrando..." copy keeps its existing meaning while the
  // request is in flight. Mirrors login.tsx's AUTH-FLICKER overlay: the form
  // must not flash back between the individual steps.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  // Angular register.component.html:100-103,122-125: a SINGLE showPassword
  // boolean drives BOTH the password and confirm-password fields — two
  // buttons, one shared state, not independent toggles.
  const [showPassword, setShowPassword] = useState(false);

  const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

  function requiredError(fieldName: string): string {
    return intl.formatMessage({ id: 'GENERAL.VALIDATION.REQUIRED' }, { name: fieldName });
  }

  /** Field label plus its requiredness, so the user can tell before typing which fields
   * the form will actually accept. Mirrors what validate() enforces: every field here is
   * required EXCEPT email, which the server treats as optional on registration too. */
  function fieldLabel(id: string, isRequired: boolean): string {
    const suffix = intl.formatMessage({
      id: isRequired
        ? 'GENERAL.VALIDATION.REQUIRED_SUFFIX'
        : 'GENERAL.VALIDATION.OPTIONAL_SUFFIX',
    });
    return `${intl.formatMessage({ id })} ${suffix}`;
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
        intl.formatMessage({ id: 'GENERAL.CONFIRM_PASSWORD' }),
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
        // Auto-login (product decision 2026-09-28): a registration now leaves the
        // owner signed in instead of parking them on /login.
        //
        // The register response's OWN token cannot do this job: `AuthDto` leaves
        // `wrappedDek`/`wrapSalt`/`wrapIv` empty on the register path ("Only the
        // login path populates them") and a brand-new device has neither a device
        // key wrap nor a roster, so `resolveDekForLogin` would find NO source and
        // throw `DekUnwrapError`. Without the store's DEK every encrypted screen
        // fails and the decryption-failure policy logs the owner straight back
        // out — the exact opposite of what is wanted here. The login response is
        // what carries the wrap (built with the password pre-hash that only the
        // login validation computes), so the session is opened through the very
        // same path the login screen uses.
        setIsSubmitting(true);
        try {
          const user = await signIn(form.login, form.password);
          // Parity with login.tsx: arm the usage tracker and warm the heavy
          // route chunks before landing on the home view.
          armTracking();
          preloadHeavyChunks();
          navigate(await resolveUserHomePath(user));
        } catch {
          // The account EXISTS (the 201 already happened): this must never read as
          // a failed registration. /login is the honest destination — it is where
          // the key-recovery routes live when the session cannot be opened.
          setIsSubmitting(false);
          showBlockingError(
            intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
            intl.formatMessage({ id: 'REGISTRATION.AUTO_LOGIN_FAILED' }),
          );
          navigate('/login');
        }
      }
    } catch (err: unknown) {
      // Backend contract: AuthController.RegisterAsync returns Created(...) on success and
      // BadRequest(result) on EVERY failure — a succeeded:false envelope never resolves, it
      // always arrives here as a rejection. ResponseResult.Message is always null (no setter
      // populated by ErrorHandlerMiddleware), so the literal failure text lives at
      // errors[0].description, never at data.message.
      //
      // The error is surfaced in a blocking popup, never as an inline banner.
      const axiosErr = err as {
        response?: { status: number; data?: { errors?: Array<{ description?: string }> } };
      };
      const status = axiosErr.response?.status;
      // A 500 already opened the app-wide blocking error popup (api-client.ts
      // response interceptor) — a second popup here would stack two dialogs.
      if (status === 500) {
        return;
      }
      let message: string;
      if (status === 400) {
        message =
          axiosErr.response?.data?.errors?.[0]?.description ??
          intl.formatMessage({ id: 'REGISTRATION.VALIDATION_ERROR' });
      } else if (status === 429) {
        message = intl.formatMessage({ id: 'REGISTRATION.TOO_MANY_ATTEMPTS' });
      } else {
        message = intl.formatMessage({ id: 'REGISTRATION.UNEXPECTED_ERROR' });
      }
      showBlockingError(intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }), message);
    } finally {
      setIsLoading(false);
    }
  }

  // While the post-registration leg runs, show ONLY the overlay — never the
  // form — so the just-filled fields cannot flash back before the home view.
  if (isSubmitting) {
    return <LoadingOverlay label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />;
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

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
            {fieldLabel('GENERAL.FULL_NAME', true)}
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
        </div>

        <div className="mb-4">
          <label htmlFor="login" className="block text-sm font-medium text-gray-700 mb-1">
            {fieldLabel('GENERAL.LOGIN', true)}
          </label>
          <input
            id="login"
            type="text"
            autoComplete="username"
            value={form.login}
            onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.login && <p className="mt-1 text-xs text-red-600">{errors.login}</p>}
        </div>

        <div className="mb-4">
          <label htmlFor="storeName" className="block text-sm font-medium text-gray-700 mb-1">
            {fieldLabel('STORE.STORE_NAME', true)}
          </label>
          <input
            id="storeName"
            type="text"
            autoComplete="organization"
            value={form.storeName}
            onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.storeName && <p className="mt-1 text-xs text-red-600">{errors.storeName}</p>}
        </div>

        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            {fieldLabel('GENERAL.PASSWORD', true)}
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
              {showPassword ? <EyeIcon className="h-5 w-5" /> : <EyeOffIcon className="h-5 w-5" />}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
        </div>

        <div className="mb-6">
          <label
            htmlFor="passwordConfirmation"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {fieldLabel('GENERAL.CONFIRM_PASSWORD', true)}
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
              {showPassword ? <EyeIcon className="h-5 w-5" /> : <EyeOffIcon className="h-5 w-5" />}
            </button>
          </div>
          {errors.passwordConfirmation && (
            <p className="mt-1 text-xs text-red-600">{errors.passwordConfirmation}</p>
          )}
        </div>

        {/* Phone and email sit BELOW the credentials block: the credentials are what the
            user came here to set, and the contact pair reads as one group once the two
            password fields are done. */}
        <div className="mb-4">
          <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700 mb-1">
            {fieldLabel('GENERAL.CELL_PHONE', true)}
          </label>
          <input
            id="cellPhone"
            type="tel"
            autoComplete="tel"
            value={form.cellPhone}
            onChange={(e) => setForm((f) => ({ ...f, cellPhone: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.cellPhone && <p className="mt-1 text-xs text-red-600">{errors.cellPhone}</p>}
        </div>

        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            {fieldLabel('GENERAL.EMAIL', false)}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
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
              {' '}
              {intl.formatMessage({ id: 'GENERAL.VALIDATION.REQUIRED_SUFFIX' })}
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

        <Button
          type="submit"
          variant="fab"
          disabled={isLoading || !accepted}
          className="w-full justify-center"
        >
          <LockOpenIcon />
          {isLoading
            ? intl.formatMessage({ id: 'AUTH.REGISTERING' })
            : intl.formatMessage({ id: 'REGISTRATION.SIGNUP_BUTTON' })}
        </Button>
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
