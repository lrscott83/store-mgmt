import { useState } from 'react';
import { useIntl } from 'react-intl';
import { NavLink } from 'react-router';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isUserAuthorized } from '~/shared/lib/auth/authorization-service';
import { MENU_GROUPS } from '~/shared/lib/config/menu-config';
import { HelpDialog } from '~/shared/components/ui/help-dialog';
import type { MenuItem } from '~/shared/lib/config/menu-config';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const intl = useIntl();
  const { user } = useAuthStore();
  const [helpItem, setHelpItem] = useState<MenuItem | null>(null);

  const visibleGroups = MENU_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!user) return false;
      if (!item.featureIds || item.featureIds.length === 0) return true;
      return isUserAuthorized(user, item.featureIds, user.selectedStoreId || undefined);
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      {isOpen && (
        <div
          data-testid="sidebar-backdrop"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40"
          aria-hidden="true"
        />
      )}
      <nav
        className={`fixed inset-y-0 left-0 z-40 flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-200 overflow-hidden ${isOpen ? 'w-64' : 'w-0'}`}
        aria-label="Navegación principal"
      >
        {isOpen && (
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
            <span className="text-lg font-bold text-primary">VendeDTo</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Contraer barra lateral"
            >
              <svg data-icon="menu-fold" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
        )}
        {/* Navigation groups */}
        <div className="flex-1 overflow-y-auto py-3">
          {visibleGroups.map((group) => (
            <div key={group.groupLabel} className="mb-4">
              {isOpen && (
                <p className="px-4 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {intl.formatMessage({ id: group.groupLabel })}
                </p>
              )}
              <ul>
                {group.items.map((item) => (
                  <li key={item.path} className="flex items-center justify-between">
                    <NavLink
                      to={item.path}
                      end={item.exact}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-lg mx-2 transition-colors ${
                          isActive
                            ? 'bg-primary-light text-primary'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`
                      }
                      title={isOpen ? undefined : intl.formatMessage({ id: item.label })}
                    >
                      {item.icon && (
                        <span className="shrink-0 text-base">{item.icon}</span>
                      )}
                      {isOpen && (
                        <span>{intl.formatMessage({ id: item.label })}</span>
                      )}
                    </NavLink>
                    {/* Help icon */}
                    {isOpen && item.helpContent && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setHelpItem(item);
                        }}
                        className="mr-2 p-1 rounded text-green-500 hover:text-green-600 hover:bg-green-50 transition-colors"
                        aria-label="Ayuda"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      {/* Help dialog */}
      <HelpDialog
        open={helpItem !== null}
        onClose={() => setHelpItem(null)}
        title={helpItem ? intl.formatMessage({ id: helpItem.label }) : ''}
        content={helpItem?.helpContent ?? ''}
      />
    </>
  );
}
