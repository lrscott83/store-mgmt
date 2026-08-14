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

describe('ChangePasswordForm — password visibility toggle (edit-user-credentials.component.html:22-27,42-47 parity + user request 2026-08-14)', () => {
  // Angular binds a SINGLE showPassword boolean to newPassword + confirmPassword.
  // User request 2026-08-14 added an INDEPENDENT toggle to oldPassword too, so
  // "Contraseña actual" can be revealed without exposing the new password.
  it('newPassword and confirmPassword share one toggle state (both flip together)', () => {
    render(
      <Wrapper>
        <ChangePasswordForm isOnline isLoading={false} onSubmit={vi.fn()} />
      </Wrapper>,
    );
    const newPassword = screen.getByLabelText(/^nueva contraseña$/i);
    const confirm = screen.getByLabelText(/confirmar nueva contraseña/i);
    expect(newPassword).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');

    // Old toggle (index 0) flips ONLY oldPassword; new+confirm toggles are 1 and 2.
    const toggles = screen.getAllByRole('button', { name: 'Mostrar contraseña' });
    expect(toggles).toHaveLength(3);
    // EyeOffIcon (hidden) renders 1 <path>; EyeIcon (revealed) renders 2 — catches
    // an inverted icon even when the aria-label direction is still correct.
    expect(toggles[1].querySelectorAll('svg path')).toHaveLength(1);
    expect(toggles[2].querySelectorAll('svg path')).toHaveLength(1);

    fireEvent.click(toggles[1]);
    expect(newPassword).toHaveAttribute('type', 'text');
    expect(confirm).toHaveAttribute('type', 'text');
    // Only new+confirm flip together; the old-password toggle stays in "Mostrar"
    // (hidden) state, so exactly 2 buttons are now labeled "Ocultar contraseña".
    const revealedToggles = screen.getAllByRole('button', { name: 'Ocultar contraseña' });
    expect(revealedToggles).toHaveLength(2);
    expect(revealedToggles[0].querySelectorAll('svg path')).toHaveLength(2);
    expect(revealedToggles[1].querySelectorAll('svg path')).toHaveLength(2);

    fireEvent.click(revealedToggles[1]);
    expect(newPassword).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');
  });

  it('oldPassword has an INDEPENDENT toggle that does not flip the other fields', () => {
    render(
      <Wrapper>
        <ChangePasswordForm isOnline isLoading={false} onSubmit={vi.fn()} />
      </Wrapper>,
    );
    const oldPassword = screen.getByLabelText(/contraseña actual/i);
    const newPassword = screen.getByLabelText(/^nueva contraseña$/i);
    const confirm = screen.getByLabelText(/confirmar nueva contraseña/i);
    expect(oldPassword).toHaveAttribute('type', 'password');

    const toggles = screen.getAllByRole('button', { name: 'Mostrar contraseña' });
    expect(toggles).toHaveLength(3);

    // Toggle #0 is oldPassword's own eye button: flipping it reveals ONLY that field.
    fireEvent.click(toggles[0]);
    expect(oldPassword).toHaveAttribute('type', 'text');
    expect(newPassword).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');
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

describe('ChangePasswordForm — submit renders as fab (edit-user-credentials.component.html:61 parity)', () => {
  it('renders the submit control as a fab (Button variant="fab"), not a plain button', () => {
    render(
      <Wrapper>
        <ChangePasswordForm isOnline isLoading={false} onSubmit={vi.fn()} />
      </Wrapper>,
    );
    const submit = screen.getByRole('button', { name: /cambiar contraseña/i });
    expect(submit).toHaveClass('rounded-full');
    expect(submit).not.toHaveClass('rounded');
  });

  // edit-user-credentials.component.html:62 — the fab carries a leading `edit` mat-icon.
  it('renders EditIcon inside the submit fab', () => {
    render(
      <Wrapper>
        <ChangePasswordForm isOnline isLoading={false} onSubmit={vi.fn()} />
      </Wrapper>,
    );
    const submit = screen.getByRole('button', { name: /cambiar contraseña/i });
    const path = submit.querySelector('svg path')?.getAttribute('d');
    expect(path).toContain('16.862 4.487');
  });
});
