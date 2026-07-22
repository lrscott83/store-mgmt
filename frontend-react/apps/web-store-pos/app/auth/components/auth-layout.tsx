import { Outlet } from 'react-router';
import { useIntl } from 'react-intl';
import { Footer } from '~/shared/components/footer';

/**
 * Guest layout for /login, /register, etc. Ports Angular's
 * `guest-footer.component.html` (legal links + Contact + copyright) below the
 * form card, reusing the shared `Footer` component (near-identical markup to
 * Angular's `client-footer.component.html`, already ported for the client
 * layout — see `shared/components/footer.tsx`) with `variant="guest"` so the
 * Contact trigger gets the gold pill styling from
 * `guest-footer.component.scss` `.contact-link` (client-footer.component.scss
 * is empty, so the authenticated app's Footer stays plain). Angular's guest
 * legal links also carry a cream/gold palette in that stylesheet, but it's
 * dark-theme-only (depends on `login.component.scss`'s `--color-bg: #0a0a0a`);
 * this light auth layout intentionally keeps the legal links on the shared
 * light-theme styling instead — see `shared/components/footer.tsx` for detail.
 */
export default function AuthLayout() {
  const intl = useIntl();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-cyan-700">
            {intl.formatMessage({ id: 'GENERAL.APP_NAME' })}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {intl.formatMessage({ id: 'GENERAL.APP_SUBTITLE' })}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <Outlet />
        </div>
      </div>
      <Footer variant="guest" />
    </div>
  );
}
