import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useIntl } from 'react-intl';
import { LoadingOverlay } from '@store-mgmt/web-common/client';
import { Button } from '~/shared/components/ui/button';
import { EyeIcon, EyeOffIcon, LoginIcon } from '~/shared/components/ui/icons';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { OfflineAccessPanel } from '~/auth/components/offline-access-panel';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import { resolveUserHomePath } from '~/shared/lib/auth/user-home';
import { preloadHeavyChunks } from '~/shared/lib/pwa/preload-heavy-chunks';
import { armTracking } from '~/shared/lib/usage/store-usage-tracker';
import { guestOnlyLoader } from './loaders';

export const clientLoader = guestOnlyLoader;

// `login` is the credential typed to sign in — a username, NOT an email
// address. A user has both, and they are different fields: the login is
// required, the email is optional and is never used to authenticate. See
// `docs/contracts/login-is-not-email.md`.
interface FormState {
  login: string;
  password: string;
}

interface FormErrors {
  login?: string;
  password?: string;
  form?: string;
}

// Design D4 — dispatches by `err.name`, never `instanceof`, so this module
// stays free of a static import of `offline-auth-service` (D1's dependency
// graph: a static import here would drag crypto + roster-store into the
// login chunk and evaluate them for every unprovisioned user). No new
// message ids on this path (offline-auth-mode: "Offline error mapping onto
// existing message ids").
function offlineErrorMessageId(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'OfflineInvalidPasswordError' || name === 'OfflineUserNotFoundError') {
    return 'AUTH.INVALID_CREDENTIALS';
  }
  if (name === 'OfflineUserInactiveError') {
    return 'AUTH.ACCOUNT_INACTIVE';
  }
  // design §10 / at-rest-encryption-errors, corrected by Task 5's controller
  // ruling: the offline verifier has already passed by the time unwrap runs,
  // so a DekUnwrapError here means this device cannot open its own data, not
  // a wrong password. Stays an INLINE banner at this seam (not the app-wide
  // blocking-dialog + sign-out policy) — the user is already ON the login
  // screen, where both recovery routes live, so a modal + logout is pure
  // friction. Only the copy changed from AUTH.UNLOCK_FAILED (names one route,
  // obliquely) to ENCRYPTION.KEY_UNAVAILABLE (names both explicitly), to keep
  // this seam and the app-wide policy agreeing on what a missing key deserves.
  if (name === 'DekUnwrapError') {
    return 'ENCRYPTION.KEY_UNAVAILABLE';
  }
  // Includes NoRosterError, OfflineVerifierError, and anything unexpected.
  return 'AUTH.SERVER_ERROR';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const intl = useIntl();
  // design §5/§10: `authLoader`/`guestOnlyLoader` redirect here with
  // `?unlock=1` when `needsUnlock` is true — a reload on a provisioned
  // device. Without this banner the user lands on a bare login screen with
  // no explanation, which reads as a bug.
  const [searchParams] = useSearchParams();
  const isUnlockRequired = searchParams.get('unlock') === '1';
  // `loginOffline` is destructured from the hook — NOT
  // `useAuthStore.getState()` — per design correction #3:
  // `login.test.tsx`'s existing mock is a bare `vi.fn()` with no `getState`,
  // so any `getState()` call reachable on the unprovisioned path would
  // crash that suite.
  const { login, loginOffline, isLoading } = useAuthStore();

  const [form, setForm] = useState<FormState>({ login: '', password: '' });
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
    if (!form.login.trim()) {
      errs.login = intl.formatMessage({ id: 'AUTH.LOGIN_REQUIRED' });
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

    // offline-auth-mode: "Mode switch, not a fallback" — the roster FILE
    // decides, never connectivity. This dynamic import runs on EVERY
    // submit, including from a device that never provisioned a roster;
    // `roster-store` is a pure module (Task 2/4's purity guard), so this
    // can only ever evaluate 2 string consts + a few declarations.
    const { isRosterProvisioned } = await import('~/shared/lib/offline/roster-store');
    if (isRosterProvisioned()) {
      setIsSubmitting(true);
      try {
        const user = await loginOffline(form.login, form.password);
        armTracking();
        preloadHeavyChunks();
        navigate(await resolveUserHomePath(user));
      } catch (err: unknown) {
        setIsSubmitting(false);
        setErrors({
          form: intl.formatMessage({ id: offlineErrorMessageId(err) }),
        });
      }
      return;
    }

    // UNPROVISIONED — verbatim today's behavior (headline invariant: a
    // device that never imported the roster is byte-for-byte unchanged).
    if (!ConnectivityService.isOnline()) {
      setIsOffline(true);
      return;
    }

    try {
      setIsSubmitting(true);
      const user = await login(form.login, form.password);
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
      // design §10 / at-rest-encryption-errors: the online unwrap (inside
      // auth-store.login, after successful /me hydration) rethrows a
      // DekUnwrapError rather than swallowing it — this is the ONE path
      // that must fail loudly (a swallowed failure would authenticate the
      // user with `needsUnlock` permanently true, looping authLoader ->
      // /login -> "successful" login -> authLoader forever).
      //
      // Task 5 controller ruling: stays an INLINE banner, NOT the app-wide
      // handleDecryptionFailure blocking-dialog + sign-out policy. That
      // policy exists to carry a user OFF an authenticated screen and ONTO
      // /login, where the recovery routes live — here the user is already on
      // /login, so a modal + logout would be pure friction on a form they can
      // act on directly. Only the copy changed, to
      // ENCRYPTION.KEY_UNAVAILABLE, which (unlike the old AUTH.UNLOCK_FAILED)
      // names both recovery routes explicitly, matching what the policy says
      // elsewhere for the same `classifyDecryptionFailure` 'missing-key' case.
      if ((err as { name?: string } | null)?.name === 'DekUnwrapError') {
        setErrors({ form: intl.formatMessage({ id: 'ENCRYPTION.KEY_UNAVAILABLE' }) });
        return;
      }
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
      } else if (status === 429) {
        setErrors({ form: intl.formatMessage({ id: 'AUTH.TOO_MANY_ATTEMPTS' }) });
      } else {
        setErrors({ form: intl.formatMessage({ id: 'AUTH.SERVER_ERROR' }) });
      }
    }
  }

  // While the login flow runs, show ONLY the loading overlay — never the form —
  // so it can't flash back between the login/me/home-resolve calls.
  if (isSubmitting) {
    return <LoadingOverlay label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />;
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

      {isUnlockRequired && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {intl.formatMessage({ id: 'AUTH.UNLOCK_REQUIRED' })}
        </div>
      )}

      {errors.form && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
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
            aria-describedby={errors.login ? 'login-error' : undefined}
          />
          {errors.login && (
            <p id="login-error" className="mt-1 text-xs text-red-600">
              {errors.login}
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
              {showPassword ? <EyeIcon className="h-5 w-5" /> : <EyeOffIcon className="h-5 w-5" />}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="mt-1 text-xs text-red-600">
              {errors.password}
            </p>
          )}
        </div>

        <Button type="submit" variant="fab" disabled={isLoading} className="w-full justify-center">
          <LoginIcon />
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

      <OfflineAccessPanel />
    </div>
  );
}
