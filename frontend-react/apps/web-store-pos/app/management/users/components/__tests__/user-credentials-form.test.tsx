import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

const baseProps = {
  isOnline: true,
  isLoading: false,
  onSubmit: vi.fn(),
};

describe('UserCredentialsForm — PRES-7: renders oldPassword (required), newPassword, confirmNewPassword', () => {
  it('shows all three password fields', async () => {
    const { UserCredentialsForm } = await import('../UserCredentialsForm');
    render(
      <Wrapper>
        <UserCredentialsForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByLabelText(/contraseña actual/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^nueva contraseña$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirmar nueva contraseña$/i)).toBeInTheDocument();
  });
});

describe('UserCredentialsForm — CRED-3: no login field present', () => {
  it('does not render any login/username input', async () => {
    const { UserCredentialsForm } = await import('../UserCredentialsForm');
    render(
      <Wrapper>
        <UserCredentialsForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.queryByLabelText(/usuario \(login\)/i)).not.toBeInTheDocument();
  });
});

describe('UserCredentialsForm — CRED-2: confirm mismatch blocks submit', () => {
  it('shows mismatch error when new passwords do not match', async () => {
    const { UserCredentialsForm } = await import('../UserCredentialsForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <UserCredentialsForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), { target: { value: 'OldPass1' } });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), { target: { value: 'NewPass1A' } });
    fireEvent.change(screen.getByLabelText(/^confirmar nueva contraseña$/i), { target: { value: 'Different1A' } });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
    await waitFor(() => {
      expect(screen.getByText(/contraseñas no coinciden/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('UserCredentialsForm — CRED-1: valid submit fires onSubmit with {oldPassword, newPassword}', () => {
  it('calls onSubmit with correct payload when valid', async () => {
    const { UserCredentialsForm } = await import('../UserCredentialsForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <UserCredentialsForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), { target: { value: 'OldPass1' } });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), { target: { value: 'NewPass1A' } });
    fireEvent.change(screen.getByLabelText(/^confirmar nueva contraseña$/i), { target: { value: 'NewPass1A' } });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        oldPassword: 'OldPass1',
        newPassword: 'NewPass1A',
      });
    });
  });
});

describe('UserCredentialsForm — PRES-9: offline disables submit and shows notice', () => {
  it('disables submit button and shows offline notice when isOnline=false', async () => {
    const { UserCredentialsForm } = await import('../UserCredentialsForm');
    render(
      <Wrapper>
        <UserCredentialsForm {...baseProps} isOnline={false} />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: /cambiar contraseña/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});
