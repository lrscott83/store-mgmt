import { useIntl } from 'react-intl';
import type { User } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';

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
 * actions (`users.component.ts:43-57` calls the service directly) — mirrored here via the
 * shared `ActionMenu` primitive (per-instance open state, gear-menu-action-styling change).
 * Deactivated users get a red/danger card indicator (`users.component.scss:3-6`
 * `.deactive-user`).
 */
export function UserCardList({ users, onCreate, onEdit, onActivate, onDeactivate }: UserCardListProps) {
  const intl = useIntl();

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
                <div className="flex justify-end pt-2">
                  <ActionMenu widthClass="w-40">
                    <ActionMenuItem intent="edit" onClick={() => onEdit(user.id)}>
                      {intl.formatMessage({ id: 'USERS.EDIT' })}
                    </ActionMenuItem>
                    {!user.isActive && (
                      <ActionMenuItem intent="activate" onClick={() => onActivate(user.id)}>
                        {intl.formatMessage({ id: 'USERS.ACTIVATE' })}
                      </ActionMenuItem>
                    )}
                    {user.isActive && (
                      <ActionMenuItem intent="deactivate" onClick={() => onDeactivate(user.id)}>
                        {intl.formatMessage({ id: 'USERS.DEACTIVATE' })}
                      </ActionMenuItem>
                    )}
                  </ActionMenu>
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
