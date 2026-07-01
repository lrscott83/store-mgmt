import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate, Link } from 'react-router';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { CartShell } from './cart-shell';

interface NavbarProps {
  isSidebarOpen: boolean;
  onSidebarToggle: () => void;
}

export function Navbar({ isSidebarOpen, onSidebarToggle }: NavbarProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
      {/* Left: sidebar collapse toggle — matches Angular nav-left's pc-sidebar-collapse position */}
      <button
        type="button"
        onClick={onSidebarToggle}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Toggle sidebar"
      >
        {isSidebarOpen ? (
          <svg data-icon="menu-fold" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        ) : (
          <svg data-icon="menu-unfold" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        )}
      </button>

      {/* Right: tutorial + cart + user dropdown */}
      <div className="flex items-center gap-2">
        {/* Tutorial — header link, matches Angular's nav-right question-circle (bg-gray-200 pill) */}
        <Link
          to="/help/tutorial"
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
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((v) => !v)}
            className="flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="User menu"
            aria-expanded={isUserMenuOpen}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-gray-200 bg-white shadow-lg z-50 py-1">
              <div className="border-b border-gray-100 px-4 py-2">
                <p className="text-xs font-semibold text-gray-800 truncate">{user?.login}</p>
                <p className="text-xs text-gray-500 truncate">{user?.fullName}</p>
              </div>
              <Link
                to="/profile/edit"
                onClick={() => setIsUserMenuOpen(false)}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {intl.formatMessage({ id: 'MENU.EDIT_PROFILE' })}
              </Link>
              <Link
                to="/profile/change-password"
                onClick={() => setIsUserMenuOpen(false)}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          )}
        </div>
      </div>
    </header>
  );
}
