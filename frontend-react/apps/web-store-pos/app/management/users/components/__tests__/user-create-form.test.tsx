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
  storeId: 's1',
  isOnline: true,
  isLoading: false,
  onSubmit: vi.fn(),
};

describe('UserCreateForm — PRES-4: renders all required fields', () => {
  it('shows storeId display, fullName, login, password, confirmPassword, cellPhone fields', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^usuario$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^contraseña$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirmar contraseña/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/teléfono/i)).toBeInTheDocument();
  });
});

describe('UserCreateForm — CREATE-4: password regex validation blocks submit', () => {
  it('shows policy error for password that fails regex', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText(/^usuario$/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'weakpass' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'weakpass' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+123' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    await waitFor(() => {
      expect(screen.getByText(/contraseña debe/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('UserCreateForm — CREATE-4: confirm password mismatch blocks submit', () => {
  it('shows mismatch error when passwords do not match', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText(/^usuario$/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'DifferentPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+123' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    await waitFor(() => {
      expect(screen.getByText(/contraseñas no coinciden/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('UserCreateForm — PRES-9: valid submit fires onSubmit with correct payload', () => {
  it('calls onSubmit with fullName, login, password, cellPhone, email when valid', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Valid User' } });
    fireEvent.change(screen.getByLabelText(/^usuario$/i), { target: { value: 'validuser' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '51234567' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        fullName: 'Valid User',
        login: 'validuser',
        password: 'ValidPass1',
        cellPhone: '51234567',
        email: '',
      });
    });
  });
});

describe('UserCreateForm — FREE-TEXT: cellPhone has no Cuban mask (the product must not assume Cuban phone numbers)', () => {
  it('renders exactly what was typed, including a non-Cuban international number, unmodified', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+1 555 123 4567' } });
    expect(screen.getByDisplayValue('+1 555 123 4567')).toBeInTheDocument();
  });

  it('submits exactly what was typed as cellPhone (no digit-stripping, no formatting)', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Free Text User' } });
    fireEvent.change(screen.getByLabelText(/^usuario$/i), { target: { value: 'freetextuser' } });
    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: 'ValidPass1' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+1 555 123 4567' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cellPhone: '+1 555 123 4567' }));
    });
  });
});

describe('UserCreateForm — EMAIL-PLACEHOLDER: email placeholder matches Angular (Req: Cell-Phone Mask and Field Copy Match Angular)', () => {
  it('has placeholder="info@mail.com" on the email field', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByLabelText(/correo|email/i)).toHaveAttribute('placeholder', 'info@mail.com');
  });
});

describe('UserCreateForm — L6 exact copy parity (Req: Copy Matches Angular Terminology Exactly)', () => {
  it('uses exact Angular label case/text: "Nombre Completo", "Usuario", "Correo"', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByText('Nombre Completo')).toBeInTheDocument();
    expect(screen.getByText('Usuario')).toBeInTheDocument();
    expect(screen.getByText('Correo')).toBeInTheDocument();
  });

  it('submit button reads exactly "Adicionar", not "Guardar"', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeInTheDocument();
  });
});

describe('UserCreateForm — PRES-9: offline disables submit and shows notice', () => {
  it('disables submit button and shows offline notice when isOnline=false', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} isOnline={false} />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: /adicionar/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });

  it('offline notice reads "Conéctate" (register-neutral), not voseo "Conectate" (Req: Copy Matches Angular Terminology Exactly)', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} isOnline={false} />
      </Wrapper>
    );
    expect(screen.getByText('Sin conexión. Conéctate para guardar cambios.')).toBeInTheDocument();
  });
});

describe('UserCreateForm — PRES-10: error prop renders inline', () => {
  it('renders the error message when error prop is provided', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} error="Server error occurred" />
      </Wrapper>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Server error occurred');
  });
});

describe('UserCreateForm — password visibility toggle (create-store-user.component.html:43-48,63-68 parity)', () => {
  // Angular binds a SINGLE showPassword boolean to BOTH password + confirmPassword
  // inputs (two buttons, one shared state) — both flip together on either click.
  it('password and confirmPassword share one toggle state (both flip together)', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} />
      </Wrapper>
    );
    const password = screen.getByLabelText(/^contraseña$/i);
    const confirm = screen.getByLabelText(/confirmar contraseña/i);
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');

    const toggles = screen.getAllByRole('button', { name: 'Mostrar contraseña' });
    expect(toggles).toHaveLength(2);
    // EyeOffIcon (hidden) renders 1 <path>; EyeIcon (revealed) renders 2 — catches
    // an inverted icon even when the aria-label direction is still correct.
    expect(toggles[0].querySelectorAll('svg path')).toHaveLength(1);
    expect(toggles[1].querySelectorAll('svg path')).toHaveLength(1);

    fireEvent.click(toggles[0]);
    expect(password).toHaveAttribute('type', 'text');
    expect(confirm).toHaveAttribute('type', 'text');
    const revealedToggles = screen.getAllByRole('button', { name: 'Ocultar contraseña' });
    expect(revealedToggles).toHaveLength(2);
    expect(revealedToggles[0].querySelectorAll('svg path')).toHaveLength(2);
    expect(revealedToggles[1].querySelectorAll('svg path')).toHaveLength(2);

    fireEvent.click(revealedToggles[1]);
    expect(password).toHaveAttribute('type', 'password');
    expect(confirm).toHaveAttribute('type', 'password');
  });
});

describe('UserCreateForm — submit renders as fab (create-store-user.component.html:106 parity)', () => {
  it('renders the submit control as a fab (Button variant="fab"), not a plain button', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} />
      </Wrapper>
    );
    const submit = screen.getByRole('button', { name: 'Adicionar' });
    expect(submit).toHaveClass('rounded-full');
    expect(submit).not.toHaveClass('rounded');
  });

  // create-store-user.component.html:107 — the fab carries a leading `add` mat-icon.
  it('renders PlusIcon inside the submit fab', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} />
      </Wrapper>
    );
    const submit = screen.getByRole('button', { name: 'Adicionar' });
    const path = submit.querySelector('svg path')?.getAttribute('d');
    expect(path).toBe('M12 4.5v15m7.5-7.5h-15');
  });
});

describe('UserCreateForm — PRES-5: no login/password clash with details shape', () => {
  it('does not render isActive toggle (that belongs to UserDetailsForm)', async () => {
    const { UserCreateForm } = await import('../UserCreateForm');
    render(
      <Wrapper>
        <UserCreateForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.queryByLabelText(/activo/i)).not.toBeInTheDocument();
  });
});
