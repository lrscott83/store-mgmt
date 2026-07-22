import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { LoadingOverlay } from '@store-mgmt/web-common/client';
import { Button } from '~/shared/components/ui/button';
import { EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import { resolveUserHomePath } from '~/shared/lib/auth/user-home';
import { preloadHeavyChunks } from '~/shared/lib/pwa/preload-heavy-chunks';
import { armTracking } from '~/shared/lib/usage/store-usage-tracker';
import { guestOnlyLoader } from './loaders';

export const clientLoader = guestOnlyLoader;

interface FormState {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  form?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const { login, isLoading } = useAuthStore();

  const [form, setForm] = useState<FormState>({ email: '', password: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isOffline, setIsOffline] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // AUTH-FLICKER: covers the WHOLE login flow (login -> getUserByToken ->
  // resolveUserHomePath -> navigate) with one loading state, so the form never
  // flashes back between the individual API calls (whose per-request overlay
  // toggles off in the gaps). Stays true through navigation (the route unmounts
  // on success); only reset on error so the form + message reappear.
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!form.email.trim()) {
      errs.email = intl.formatMessage({ id: 'AUTH.EMAIL_REQUIRED' });
    }
    if (!form.password) {
      errs.password = intl.formatMessage({ id: 'AUTH.PASSWORD_REQUIRED' });
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

    try {
      setIsSubmitting(true);
      const user = await login(form.email, form.password);
      // Arm the store-usage tracker on explicit login, mirroring Angular's
      // login.component.ts:169-170 (stopTracking() + startTracking()). This is
      // the ONLY place tracking arms — after a page reload it stays dormant,
      // exactly like Angular (no usage POST on navigation post-reload).
      armTracking();
      // Mirror Angular's navigateToUserHome() (shared with guestOnlyLoader):
      // warm the heavy route chunks, then resolve where to land.
      preloadHeavyChunks();
      navigate(await resolveUserHomePath(user));
    } catch (err: unknown) {
      // Reveal the form again so the user can see the error and retry.
      setIsSubmitting(false);
      // Angular login.component.ts:162-167 INVALID_ERROR path: a body-level
      // failure (HTTP 200 + succeeded:false) carries the backend's own message
      // (auth-store tags it as loginRejectionDescription). Surface it verbatim,
      // interpolated into AUTH.INVALID_ERROR, instead of a generic fallback.
      const rejectionDescription = (err as { loginRejectionDescription?: string })
        ?.loginRejectionDescription;
      if (rejectionDescription) {
        setErrors({
          form: intl.formatMessage(
            { id: 'AUTH.INVALID_ERROR' },
            { error: rejectionDescription }
          ),
        });
        return;
      }

      const status = (err as { status?: number })?.status;
      if (status === 401) {
        setErrors({ form: intl.formatMessage({ id: 'AUTH.INVALID_CREDENTIALS' }) });
      } else if (status === 403) {
        setErrors({ form: intl.formatMessage({ id: 'AUTH.ACCOUNT_INACTIVE' }) });
      } else {
        setErrors({ form: intl.formatMessage({ id: 'AUTH.SERVER_ERROR' }) });
      }
    }
  }

  // While the login flow runs, show ONLY the loading overlay — never the form —
  // so it can't flash back between the login/me/home-resolve calls.
  if (isSubmitting) {
    return <LoadingOverlay />;
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">
        {intl.formatMessage({ id: 'AUTH.SIGN_IN_TITLE' })}
      </h2>

      {isOffline && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {intl.formatMessage({ id: 'AUTH.OFFLINE_LOGIN' })}
        </div>
      )}

      {errors.form && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            {intl.formatMessage({ id: 'GENERAL.LOGIN' })}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-xs text-red-600">
              {errors.email}
            </p>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            {intl.formatMessage({ id: 'AUTH.PASSWORD' })}
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              aria-describedby={errors.password ? 'password-error' : undefined}
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
            <p id="password-error" className="mt-1 text-xs text-red-600">
              {errors.password}
            </p>
          )}
        </div>

        <Button type="submit" variant="fab" disabled={isLoading} className="w-full justify-center">
          {isLoading
            ? intl.formatMessage({ id: 'AUTH.SIGNING_IN' })
            : intl.formatMessage({ id: 'AUTH.SIGN_IN' })}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-600">
        {intl.formatMessage({ id: 'AUTH.NO_ACCOUNT' })}{' '}
        <Link to="/register" className="text-cyan-600 hover:text-cyan-700 font-medium">
          {intl.formatMessage({ id: 'AUTH.REGISTER' })}
        </Link>
      </div>
    </div>
  );
}
