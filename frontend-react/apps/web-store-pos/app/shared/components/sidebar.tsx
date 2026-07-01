import { useIntl } from 'react-intl';
import { NavLink } from 'react-router';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isUserAuthorized } from '~/shared/lib/auth/authorization-service';
import { MENU_GROUPS } from '~/shared/lib/config/menu-config';

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  const intl = useIntl();
  const { user } = useAuthStore();

  const visibleGroups = MENU_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!user) return false;
      if (!item.featureIds || item.featureIds.length === 0) return true;
      return isUserAuthorized(user, item.featureIds, user.selectedStoreId || undefined);
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <nav
      className={`flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-200 overflow-hidden ${isOpen ? 'w-64' : 'w-16'}`}
      aria-label="Main navigation"
    >
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
                <li key={item.path}>
                  <NavLink
                    to={item.path}
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
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
