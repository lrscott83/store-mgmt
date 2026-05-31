import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { ChangePasswordForm } from '../change-password-form';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

describe('ChangePasswordForm — PWD-4: regex validation blocks submit (S-PWD-2)', () => {
  it('does not call onSubmit when newPassword fails the regex', () => {
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <ChangePasswordForm isOnline isLoading={false} onSubmit={onSubmit} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'password' }, // no digit, no uppercase
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows PROFILE.PASSWORD_REGEX_ERROR message when newPassword fails regex', () => {
    render(
      <Wrapper>
        <ChangePasswordForm isOnline isLoading={false} onSubmit={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'password' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
    // Should show regex error (not mismatch)
    expect(screen.getByRole('alert')).toHaveTextContent(/mayúscula|minúscula|número|8/i);
  });
});

describe('ChangePasswordForm — PWD-8: confirm password mismatch (S-PWD-3)', () => {
  it('does not call onSubmit when confirmPassword does not match newPassword', () => {
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <ChangePasswordForm isOnline isLoading={false} onSubmit={onSubmit} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'ValidPass1' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'DifferentPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows PROFILE.PASSWORD_MISMATCH message (distinct from regex error) when passwords do not match', () => {
    render(
      <Wrapper>
        <ChangePasswordForm isOnline isLoading={false} onSubmit={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'ValidPass1' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'DifferentPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/no coinciden/i);
  });
});

describe('ChangePasswordForm — PWD-5: offline disables submit', () => {
  it('disables the submit button when isOnline is false', () => {
    render(
      <Wrapper>
        <ChangePasswordForm isOnline={false} isLoading={false} onSubmit={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /cambiar contraseña/i })).toBeDisabled();
  });

  it('shows offline notice when isOnline is false', () => {
    render(
      <Wrapper>
        <ChangePasswordForm isOnline={false} isLoading={false} onSubmit={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});

describe('ChangePasswordForm — calls onSubmit with correct payload when valid', () => {
  it('calls onSubmit with { oldPassword, newPassword } when all fields are valid', () => {
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <ChangePasswordForm isOnline isLoading={false} onSubmit={onSubmit} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'OldPass1' },
    });
    fireEvent.change(screen.getByLabelText(/^nueva contraseña$/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.change(screen.getByLabelText(/confirmar nueva contraseña/i), {
      target: { value: 'ValidPass2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      oldPassword: 'OldPass1',
      newPassword: 'ValidPass2',
    });
  });
});
