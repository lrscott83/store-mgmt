import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { StoreUser } from '@store-mgmt/domain';

function makeStoreUser(overrides: Partial<StoreUser> = {}): StoreUser {
  return {
    id: 'u1',
    storeId: 's1',
    storeName: 'Store One',
    login: 'user1',
    fullName: 'User One',
    cellPhone: '+123',
    email: 'user@test.com',
    isActive: true,
    ...overrides,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

const baseProps = {
  users: [],
  isOnline: true,
  isDegraded: false,
  onCreate: vi.fn(),
  onEdit: vi.fn(),
  onActivate: vi.fn(),
  onDeactivate: vi.fn(),
};

describe('UserList — PRES-1: renders user rows', () => {
  it('renders a row per user with their fullName', async () => {
    const { UserList } = await import('../UserList');
    const users = [
      makeStoreUser({ id: 'u1', fullName: 'Alice Smith' }),
      makeStoreUser({ id: 'u2', fullName: 'Bob Jones' }),
    ];
    render(
      <Wrapper>
        <UserList {...baseProps} users={users} />
      </Wrapper>
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });
});

describe('UserList — PRES-3: empty state', () => {
  it('shows empty state message when users array is empty', async () => {
    const { UserList } = await import('../UserList');
    render(
      <Wrapper>
        <UserList {...baseProps} users={[]} />
      </Wrapper>
    );
    expect(screen.getByText(/no hay usuarios/i)).toBeInTheDocument();
  });
});

describe('UserList — PRES-2: degraded indicator', () => {
  it('shows degraded notice when isDegraded=true', async () => {
    const { UserList } = await import('../UserList');
    render(
      <Wrapper>
        <UserList {...baseProps} users={[makeStoreUser()]} isDegraded={true} isOnline={false} />
      </Wrapper>
    );
    expect(screen.getByText(/caché/i)).toBeInTheDocument();
  });
});

describe('UserList — LIST-4: activate/deactivate callbacks fire', () => {
  it('calls onActivate with user id when activate button clicked', async () => {
    const { UserList } = await import('../UserList');
    const onActivate = vi.fn();
    const user = makeStoreUser({ id: 'u-test', isActive: false });
    render(
      <Wrapper>
        <UserList {...baseProps} users={[user]} onActivate={onActivate} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /^activar$/i }));
    expect(onActivate).toHaveBeenCalledWith('u-test');
  });

  it('calls onDeactivate with user id when deactivate button clicked', async () => {
    const { UserList } = await import('../UserList');
    const onDeactivate = vi.fn();
    const user = makeStoreUser({ id: 'u-test2', isActive: true });
    render(
      <Wrapper>
        <UserList {...baseProps} users={[user]} onDeactivate={onDeactivate} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /^desactivar$/i }));
    expect(onDeactivate).toHaveBeenCalledWith('u-test2');
  });
});

describe('UserList — LIST-5: lifecycle buttons disabled when offline', () => {
  it('disables action buttons when isOnline=false', async () => {
    const { UserList } = await import('../UserList');
    render(
      <Wrapper>
        <UserList
          {...baseProps}
          users={[makeStoreUser()]}
          isOnline={false}
          isDegraded={true}
        />
      </Wrapper>
    );
    const editBtn = screen.getByRole('button', { name: /^editar$/i });
    expect(editBtn).toBeDisabled();
  });
});

describe('UserList — ERR: error message renders', () => {
  it('shows inline error when error prop is set', async () => {
    const { UserList } = await import('../UserList');
    render(
      <Wrapper>
        <UserList {...baseProps} error="Failed to load users" />
      </Wrapper>
    );
    expect(screen.getByText('Failed to load users')).toBeInTheDocument();
  });
});

describe('UserList — LIST-4: onCreate/onEdit fire', () => {
  it('calls onCreate when create button clicked', async () => {
    const { UserList } = await import('../UserList');
    const onCreate = vi.fn();
    render(
      <Wrapper>
        <UserList {...baseProps} onCreate={onCreate} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /crear usuario/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('calls onEdit with user id when edit button clicked', async () => {
    const { UserList } = await import('../UserList');
    const onEdit = vi.fn();
    const user = makeStoreUser({ id: 'edit-me', fullName: 'Edit Me' });
    render(
      <Wrapper>
        <UserList {...baseProps} users={[user]} onEdit={onEdit} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /^editar$/i }));
    expect(onEdit).toHaveBeenCalledWith('edit-me');
  });
});
