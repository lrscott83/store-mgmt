import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { User } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon, SettingsIcon } from '~/shared/components/ui/icons';

interface UserCardListProps {
  users: User[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
}

/**
 * Users list card grid at `/management/users`. L5 parity: shared Card/Button chrome + a
 * per-card gear action menu replace the old raw-table markup, mirroring
 * `admin/stores/components/store-card-list.tsx`. Unlike Stores, Angular Users renders a
 * real per-card `mat-menu` (`users.component.html:24-46`) with Editar (always) /
 * Activar (`!isActive`) / Desactivar (`isActive`), and NO confirm dialog gates lifecycle
 * actions (`users.component.ts:43-57` calls the service directly) — mirrored here with a
 * component-local `useState(openMenuId)` toggle, same pattern as `sale-credit-list.tsx`.
 * Deactivated users get a red/danger card indicator (`users.component.scss:3-6`
 * `.deactive-user`).
 */
export function UserCardList({ users, onCreate, onEdit, onActivate, onDeactivate }: UserCardListProps) {
  const intl = useIntl();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  function toggleMenu(id: string) {
    setOpenMenuId((current) => (current === id ? null : id));
  }

  function handleEdit(id: string) {
    onEdit(id);
    setOpenMenuId(null);
  }

  function handleActivate(id: string) {
    onActivate(id);
    setOpenMenuId(null);
  }

  function handleDeactivate(id: string) {
    onDeactivate(id);
    setOpenMenuId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="fab" onClick={onCreate}>
          <PlusIcon />
          {intl.formatMessage({ id: 'USERS.CREATE' })}
        </Button>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-text-muted">{intl.formatMessage({ id: 'USERS.EMPTY' })}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((user) => (
            <Card
              key={user.id}
              title={user.fullName}
              className={!user.isActive ? 'bg-danger/10 border border-danger' : ''}
            >
              <div className="space-y-2">
                <p className="text-sm text-text-muted">{user.cellPhone}</p>
                {user.email && <p className="text-sm text-text-muted">{user.email}</p>}
                <div className="relative flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => toggleMenu(user.id)}
                    aria-label="Acciones"
                    className="rounded-full p-2 text-primary hover:bg-primary-light"
                  >
                    <SettingsIcon />
                  </button>
                  {openMenuId === user.id && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-border bg-surface shadow-card"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleEdit(user.id)}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text hover:bg-primary-light"
                      >
                        {intl.formatMessage({ id: 'USERS.EDIT' })}
                      </button>
                      {!user.isActive && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleActivate(user.id)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text hover:bg-primary-light"
                        >
                          {intl.formatMessage({ id: 'USERS.ACTIVATE' })}
                        </button>
                      )}
                      {user.isActive && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleDeactivate(user.id)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-danger hover:bg-danger/10"
                        >
                          {intl.formatMessage({ id: 'USERS.DEACTIVATE' })}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default UserCardList;
