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
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
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
  it('populates inputs from initialValues prop', async () => {
    const { UserDetailsForm } = await import('../UserDetailsForm');
    const initialValues = {
      fullName: 'Jane Doe',
      cellPhone: '+987654321',
      email: 'jane@test.com',
      isActive: true,
    };
    render(
      <Wrapper>
        <UserDetailsForm {...baseProps} initialValues={initialValues} canToggleActive={true} />
      </Wrapper>
    );
    expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+987654321')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jane@test.com')).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '+111' } });
    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Updated Name', cellPhone: '+111' })
      );
    });
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
