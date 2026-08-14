import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';
import { CartShell } from './cart-shell';

interface NavbarProps {
  isSidebarOpen: boolean;
  onSidebarToggle: () => void;
}

const HELP_PATH = '/help/tutorial';

export function Navbar({ isSidebarOpen, onSidebarToggle }: NavbarProps) {
  const intl = useIntl();
  const { user, logout } = useAuthStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  // Remembers the last non-help view so the help icon can toggle back to it.
  const lastNonHelpPathRef = useRef('/');

  useClickOutside(userMenuRef, () => setIsUserMenuOpen(false));

  useEffect(() => {
    if (location.pathname !== HELP_PATH) {
      lastNonHelpPathRef.current = location.pathname + location.search;
    }
  }, [location.pathname, location.search]);

  // Toggle: show the tutorial, or if already on it, return to the previous view.
  function handleHelpToggle(event: React.MouseEvent) {
    event.preventDefault();
    if (location.pathname === HELP_PATH) {
      navigate(lastNonHelpPathRef.current);
    } else {
      navigate(HELP_PATH);
    }
  }

  function handleLogout() {
    // Decision 2 (auth-service-parity, Slice 3): logout() now owns the
    // conditional redirect itself (Angular parity) — no manual navigate here.
    logout();
  }

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
      {/* Left: sidebar EXPAND toggle — only shown while the sidebar is closed.
          The COLLAPSE (<<) action now lives in the sidebar's own header row. */}
      {isSidebarOpen ? (
        <div />
      ) : (
        <button
          type="button"
          onClick={onSidebarToggle}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Alternar barra lateral"
        >
          <svg data-icon="menu-unfold" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Right: tutorial + cart + user dropdown */}
      <div className="flex items-center gap-2">
        {/* Tutorial — header link, matches Angular's nav-right question-circle (bg-gray-200 pill) */}
        <Link
          to={HELP_PATH}
          onClick={handleHelpToggle}
          className="rounded-full p-2 bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors"
          aria-label={intl.formatMessage({ id: 'MENU.TUTORIAL' })}
          title={intl.formatMessage({ id: 'MENU.TUTORIAL' })}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </Link>

        <CartShell />

        {/* User dropdown — trigger is a plain person icon, matches Angular's header-user-profile */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((v) => !v)}
            className="flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Menú de usuario"
            aria-expanded={isUserMenuOpen}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
              {/* Header: login + fullName + logout icon on the right — mirrors Angular's
                  header-user-profile dropdown-header (nav-right.component.html:255-267). */}
              <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-gray-800">{user?.login}</p>
                  <p className="truncate text-xs text-gray-500">{user?.fullName}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  aria-label={intl.formatMessage({ id: 'GENERAL.LOGOUT' })}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>

              {/* Tab bar: single "Perfil" tab with a user icon — mirrors Angular's
                  drp-tabs nav (nav-right.component.html:269-271). */}
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
                <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-xs font-medium text-gray-600">
                  {intl.formatMessage({ id: 'GENERAL.PROFILE' })}
                </span>
              </div>

              {/* Tab content: profile items + logout — mirrors Angular's profile array
                  (nav-right.component.html:272-287). */}
              <div className="py-1">
                <Link
                  to="/profile/edit"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  {intl.formatMessage({ id: 'MENU.EDIT_PROFILE' })}
                </Link>
                <Link
                  to="/profile/change-password"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  {intl.formatMessage({ id: 'MENU.CHANGE_PASSWORD' })}
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {intl.formatMessage({ id: 'GENERAL.LOGOUT' })}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
