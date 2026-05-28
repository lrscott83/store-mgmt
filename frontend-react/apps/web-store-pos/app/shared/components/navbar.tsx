import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { CartShell } from './cart-shell';

interface NavbarProps {
  onSidebarToggle: () => void;
}

export function Navbar({ onSidebarToggle }: NavbarProps) {
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
      {/* Left: hamburger */}
      <button
        type="button"
        onClick={onSidebarToggle}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="Toggle sidebar"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Right: cart + user dropdown */}
      <div className="flex items-center gap-2">
        <CartShell />

        {/* User dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="User menu"
            aria-expanded={isUserMenuOpen}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 text-xs font-bold">
              {user?.fullName?.charAt(0).toUpperCase() ?? '?'}
            </div>
            {user?.fullName && (
              <span className="hidden sm:block max-w-[120px] truncate font-medium">
                {user.fullName}
              </span>
            )}
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-gray-200 bg-white shadow-lg z-50 py-1">
              <div className="border-b border-gray-100 px-4 py-2">
                <p className="text-xs font-semibold text-gray-800 truncate">{user?.fullName}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {intl.formatMessage({ id: 'AUTH.SIGN_OUT' })}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
