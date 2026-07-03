import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { User } from '@store-mgmt/domain';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
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
  onCreate: vi.fn(),
  onEdit: vi.fn(),
  onActivate: vi.fn(),
  onDeactivate: vi.fn(),
};

describe('UserCardList — renders a Card grid (Req: Users List Uses Shared Chrome and Deactivated Indicator)', () => {
  it('renders a card per user with fullName, cellPhone and email', async () => {
    const { UserCardList } = await import('../user-card-list');
    const users = [
      makeUser({ id: 'u1', fullName: 'Alice Smith', cellPhone: '+53 5 123-4567', email: 'alice@test.com' }),
      makeUser({ id: 'u2', fullName: 'Bob Jones' }),
    ];
    render(
      <Wrapper>
        <UserCardList {...baseProps} users={users} />
      </Wrapper>
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('+53 5 123-4567')).toBeInTheDocument();
    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('uses the shared Card chrome (data-slot="card")', async () => {
    const { UserCardList } = await import('../user-card-list');
    const { container } = render(
      <Wrapper>
        <UserCardList {...baseProps} users={[makeUser()]} />
      </Wrapper>
    );
    expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();
  });
});

describe('UserCardList — empty state', () => {
  it('shows empty state message when users array is empty', async () => {
    const { UserCardList } = await import('../user-card-list');
    render(
      <Wrapper>
        <UserCardList {...baseProps} users={[]} />
      </Wrapper>
    );
    expect(screen.getByText(/no hay usuarios/i)).toBeInTheDocument();
  });
});

describe('UserCardList — FAB triggers onCreate', () => {
  it('calls onCreate when the FAB is clicked', async () => {
    const onCreate = vi.fn();
    const { UserCardList } = await import('../user-card-list');
    render(
      <Wrapper>
        <UserCardList {...baseProps} users={[]} onCreate={onCreate} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: esMessages['USERS.CREATE'] }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('UserCardList — gear action menu (Req: Users List Uses Shared Chrome and Deactivated Indicator)', () => {
  it('menu is closed by default, opens on gear click, always shows Editar and calls onEdit', async () => {
    const onEdit = vi.fn();
    const { UserCardList } = await import('../user-card-list');
    render(
      <Wrapper>
        <UserCardList
          {...baseProps}
          onEdit={onEdit}
          users={[makeUser({ id: 'u-active', fullName: 'Active User', isActive: true })]}
        />
      </Wrapper>
    );
    expect(screen.queryByRole('menuitem', { name: esMessages['USERS.EDIT'] })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    const editItem = screen.getByRole('menuitem', { name: esMessages['USERS.EDIT'] });
    expect(editItem).toBeInTheDocument();
    fireEvent.click(editItem);
    expect(onEdit).toHaveBeenCalledWith('u-active');
  });

  it('shows Desactivar (not Activar) for an active user and calls onDeactivate', async () => {
    const onDeactivate = vi.fn();
    const { UserCardList } = await import('../user-card-list');
    render(
      <Wrapper>
        <UserCardList
          {...baseProps}
          onDeactivate={onDeactivate}
          users={[makeUser({ id: 'u-active', isActive: true })]}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    expect(screen.queryByRole('menuitem', { name: esMessages['USERS.ACTIVATE'] })).not.toBeInTheDocument();
    const deactivateItem = screen.getByRole('menuitem', { name: esMessages['USERS.DEACTIVATE'] });
    fireEvent.click(deactivateItem);
    expect(onDeactivate).toHaveBeenCalledWith('u-active');
  });

  it('shows Activar (not Desactivar) for an inactive user and calls onActivate', async () => {
    const onActivate = vi.fn();
    const { UserCardList } = await import('../user-card-list');
    render(
      <Wrapper>
        <UserCardList
          {...baseProps}
          onActivate={onActivate}
          users={[makeUser({ id: 'u-inactive', isActive: false })]}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    expect(screen.queryByRole('menuitem', { name: esMessages['USERS.DEACTIVATE'] })).not.toBeInTheDocument();
    const activateItem = screen.getByRole('menuitem', { name: esMessages['USERS.ACTIVATE'] });
    fireEvent.click(activateItem);
    expect(onActivate).toHaveBeenCalledWith('u-inactive');
  });
});

// Deactivated indicator is a pure Tailwind visual state (no Angular-side semantic marker
// either — `.deactive-user` is a plain background-color class, users.component.scss:3-6).
// Asserting the class name here mirrors this codebase's existing precedent for the same
// kind of visual-only requirement (button.test.tsx:26, info-box.test.tsx:26).
describe('UserCardList — deactivated user shows danger indicator (Req: Users List Uses Shared Chrome and Deactivated Indicator)', () => {
  it('applies a danger/red visual indicator on the card for isActive=false', async () => {
    const { UserCardList } = await import('../user-card-list');
    const { container } = render(
      <Wrapper>
        <UserCardList {...baseProps} users={[makeUser({ id: 'u-deact', isActive: false })]} />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).toContain('bg-danger');
  });

  it('does NOT apply the danger indicator for an active user', async () => {
    const { UserCardList } = await import('../user-card-list');
    const { container } = render(
      <Wrapper>
        <UserCardList {...baseProps} users={[makeUser({ id: 'u-act', isActive: true })]} />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).not.toContain('bg-danger');
  });
});
