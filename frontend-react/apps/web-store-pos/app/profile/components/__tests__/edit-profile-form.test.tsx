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
  cellPhone: '+54911',
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

  it('pre-fills cellPhone field from initialValues', () => {
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
    expect(screen.getByDisplayValue('+54911')).toBeInTheDocument();
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
          initialValues={{ fullName: 'Juan', cellPhone: '', email: 'not-an-email' }}
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
          initialValues={{ fullName: 'Juan', cellPhone: '', email: 'bad-email' }}
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
      cellPhone: '+54911',
      email: 'juan@test.com',
    });
  });
});
