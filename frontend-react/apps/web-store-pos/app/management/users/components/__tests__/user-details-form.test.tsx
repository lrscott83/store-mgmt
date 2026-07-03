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
  canToggleActive: false,
  onSubmit: vi.fn(),
};

describe('UserDetailsForm — PRES-6: renders fullName, cellPhone, email fields', () => {
  it('shows fullName, cellPhone, and email inputs', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/teléfono/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/correo|email/i)).toBeInTheDocument();
  });
});

describe('UserDetailsForm — EDIT-5: isActive toggle shown when canToggleActive=true', () => {
  it('renders isActive toggle when canToggleActive is true', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} canToggleActive={true} />
      </Wrapper>
    );
    expect(screen.getByLabelText(/activo/i)).toBeInTheDocument();
  });
});

describe('UserDetailsForm — EDIT-5: isActive toggle hidden when canToggleActive=false', () => {
  it('does not render isActive toggle when canToggleActive is false', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} canToggleActive={false} />
      </Wrapper>
    );
    expect(screen.queryByLabelText(/activo/i)).not.toBeInTheDocument();
  });
});

describe('UserDetailsForm — EDIT-3: pre-fills from initialValues', () => {
  it('populates inputs from initialValues prop, formatting cellPhone with the +53 mask', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    const initialValues = {
      fullName: 'Jane Doe',
      cellPhone: '98765432',
      email: 'jane@test.com',
      isActive: true,
    };
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} initialValues={initialValues} canToggleActive={true} />
      </Wrapper>
    );
    expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+53 9 876-5432')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jane@test.com')).toBeInTheDocument();
  });
});

describe('UserDetailsForm — DET-CELL-REQ: cellPhone is required', () => {
  it('shows required error and blocks submit when cellPhone is empty', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Alice' } });
    // Leave cellPhone empty
    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
    await waitFor(() => {
      expect(screen.getByText(/teléfono es obligatorio/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not show required error when cellPhone is filled', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+123' } });
    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(screen.queryByText(/teléfono es obligatorio/i)).not.toBeInTheDocument();
  });
});

describe('UserDetailsForm — PRES-9: valid submit fires onSubmit', () => {
  it('calls onSubmit with form values when submitted', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Updated Name' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '111' } });
    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Updated Name', cellPhone: '111' })
      );
    });
  });
});

describe('UserDetailsForm — CELL-MASK: cell-phone applies the +53 mask (Req: Cell-Phone Mask and Field Copy Match Angular)', () => {
  it('displays the formatted +53 X XXX-XXXX mask as digits are typed', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '51234567' } });
    expect(screen.getByDisplayValue('+53 5 123-4567')).toBeInTheDocument();
  });

  it('submits raw digits (not the formatted mask string) as cellPhone', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Mask User' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '51234567' } });
    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cellPhone: '51234567' }));
    });
  });
});

describe('UserDetailsForm — EMAIL-PLACEHOLDER: email placeholder matches Angular (Req: Cell-Phone Mask and Field Copy Match Angular)', () => {
  it('has placeholder="info@mail.com" on the email field', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByLabelText(/correo|email/i)).toHaveAttribute('placeholder', 'info@mail.com');
  });
});

describe('UserDetailsForm — PRES-9: offline disables submit and shows notice', () => {
  it('disables submit button and shows offline notice when isOnline=false', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} isOnline={false} />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: /actualizar/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});
