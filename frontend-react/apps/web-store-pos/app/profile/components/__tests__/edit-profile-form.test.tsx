import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { EditProfileForm } from '../edit-profile-form';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

const defaultInitialValues = {
  fullName: 'Juan Pérez',
  cellPhone: '51234567',
  email: 'juan@test.com',
};

describe('EditProfileForm — renders with initialValues (EDIT-3)', () => {
  it('pre-fills fullName field from initialValues', () => {
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={defaultInitialValues}
          isOnline
          isLoading={false}
          onSubmit={vi.fn()}
        />
      </Wrapper>,
    );
    const nameInput = screen.getByDisplayValue('Juan Pérez');
    expect(nameInput).toBeInTheDocument();
  });

  it('pre-fills cellPhone field unmodified, no Cuban mask (the product must not assume Cuban phone numbers)', () => {
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={defaultInitialValues}
          isOnline
          isLoading={false}
          onSubmit={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByDisplayValue('51234567')).toBeInTheDocument();
  });
});

describe('EditProfileForm — FREE-TEXT: cellPhone has no Cuban mask (the product must not assume Cuban phone numbers)', () => {
  it('renders exactly what was typed, including a non-Cuban international number, unmodified', () => {
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={{ fullName: 'Juan', cellPhone: '', email: '' }}
          isOnline
          isLoading={false}
          onSubmit={vi.fn()}
        />
      </Wrapper>,
    );
    const input = screen.getByLabelText(/teléfono celular/i);
    fireEvent.change(input, { target: { value: '+1 555 123 4567' } });
    expect(input).toHaveValue('+1 555 123 4567');
  });
});

describe('EditProfileForm — cellPhone is required (new check, Angular parity)', () => {
  it('does not call onSubmit when cellPhone is empty', () => {
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={{ fullName: 'Juan Pérez', cellPhone: '', email: 'juan@test.com' }}
          isOnline
          isLoading={false}
          onSubmit={onSubmit}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a validation message when cellPhone is empty and submit attempted', () => {
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={{ fullName: 'Juan Pérez', cellPhone: '', email: 'juan@test.com' }}
          isOnline
          isLoading={false}
          onSubmit={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('EditProfileForm — PHONE-3: phoneRequired={false} lets an empty phone through', () => {
  it('calls onSubmit when cellPhone is empty and phoneRequired is false', () => {
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={{ fullName: 'Juan Pérez', cellPhone: '', email: 'juan@test.com' }}
          isOnline
          isLoading={false}
          onSubmit={onSubmit}
          phoneRequired={false}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe('EditProfileForm — PHONE-3 fail-safe: phoneRequired omitted keeps the strictest default', () => {
  it('does not call onSubmit when cellPhone is empty and phoneRequired is not passed', () => {
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={{ fullName: 'Juan Pérez', cellPhone: '', email: 'juan@test.com' }}
          isOnline
          isLoading={false}
          onSubmit={onSubmit}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('EditProfileForm — EDIT-8: blocks submit when fullName is empty', () => {
  it('does not call onSubmit when fullName is empty', () => {
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={{ fullName: '', cellPhone: '', email: '' }}
          isOnline
          isLoading={false}
          onSubmit={onSubmit}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a validation message when fullName is empty and submit attempted', () => {
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={{ fullName: '', cellPhone: '', email: '' }}
          isOnline
          isLoading={false}
          onSubmit={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('EditProfileForm — EDIT-9: blocks submit for invalid email format', () => {
  it('does not call onSubmit when email format is invalid', () => {
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={{ fullName: 'Juan', cellPhone: '51234567', email: 'not-an-email' }}
          isOnline
          isLoading={false}
          onSubmit={onSubmit}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows an email format error message when email is invalid', () => {
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={{ fullName: 'Juan', cellPhone: '51234567', email: 'bad-email' }}
          isOnline
          isLoading={false}
          onSubmit={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/email/i);
  });
});

describe('EditProfileForm — EDIT-5: offline disables submit and shows notice', () => {
  it('disables the submit button when isOnline is false', () => {
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={defaultInitialValues}
          isOnline={false}
          isLoading={false}
          onSubmit={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeDisabled();
  });

  it('shows offline notice when isOnline is false', () => {
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={defaultInitialValues}
          isOnline={false}
          isLoading={false}
          onSubmit={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});

describe('EditProfileForm — onSubmit called with correct payload when valid', () => {
  it('calls onSubmit with fullName, cellPhone and email when all valid', () => {
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <EditProfileForm
          initialValues={defaultInitialValues}
          isOnline
          isLoading={false}
          onSubmit={onSubmit}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      fullName: 'Juan Pérez',
      cellPhone: '51234567',
      email: 'juan@test.com',
    });
  });
});
