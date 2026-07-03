import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Module, Owner } from '@store-mgmt/domain';

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 1,
    name: 'Module A',
    price: 10,
    currentPrice: 8,
    priceIncluded: false,
    discountText: '',
    selected: false,
    ...overrides,
  };
}

function makeOwner(overrides: Partial<Owner> = {}): Owner {
  return {
    id: 'o1',
    userId: 'u1',
    fullName: 'Owner One',
    cellPhone: '+123',
    email: 'owner@test.com',
    description: '',
    guest: false,
    storeModules: [],
    reSellerId: '',
    reSellerName: '',
    approved: true,
    isActive: true,
    createdDate: new Date(),
    createdByName: 'system',
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
  modules: [makeModule()],
  owners: [] as Owner[],
  initialValues: undefined as unknown as undefined,
  isLoading: false,
  isSuperAdmin: false,
  isOwnerAdmin: false,
  isEditMode: false,
  onSubmit: vi.fn(),
  error: '',
};

describe('StoreForm — PRES-4: renders name field (always)', () => {
  it('shows the name input', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
  });
});

describe('StoreForm — PRES-6: role-conditional fields for owner-admin', () => {
  it('shows ownerId and approved fields for ownerAdmin', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isOwnerAdmin={true}
          owners={[makeOwner()]}
        />
      </Wrapper>
    );
    expect(screen.getByLabelText(/propietario/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/aprobada/i)).toBeInTheDocument();
  });

  it('does NOT show paymentStartDate or isActive fields for ownerAdmin in create mode', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isOwnerAdmin={true}
          isEditMode={false}
          owners={[makeOwner()]}
        />
      </Wrapper>
    );
    expect(screen.queryByLabelText(/fecha de inicio/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/activa/i)).not.toBeInTheDocument();
  });
});

describe('StoreForm — PRES-6: role-conditional fields for super-admin', () => {
  it('shows paymentStartDate in edit mode for superAdmin', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isSuperAdmin={true}
          isEditMode={true}
          owners={[makeOwner()]}
        />
      </Wrapper>
    );
    expect(screen.getByLabelText(/fecha de inicio/i)).toBeInTheDocument();
  });

  it('shows isActive for superAdmin', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isSuperAdmin={true}
          owners={[makeOwner()]}
        />
      </Wrapper>
    );
    expect(screen.getByLabelText(/activa/i)).toBeInTheDocument();
  });
});

describe('StoreForm — PRES-4: name required validation', () => {
  it('does not call onSubmit when name is empty', async () => {
    const { StoreForm } = await import('../store-form');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <StoreForm {...baseProps} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('StoreForm — HTTP-only: no offline notice, no isOnline prop (Req: HTTP-Only Data Access)', () => {
  it('never renders an offline notice regardless of connectivity plumbing', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm {...baseProps} />
      </Wrapper>
    );
    expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument();
  });

  it('submitDisabled prop (e.g. catalog load failure) disables submit without any offline notice', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm {...baseProps} submitDisabled />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
    expect(screen.queryByText(/sin conexión/i)).not.toBeInTheDocument();
  });
});

describe('StoreForm — PRES-7: error display', () => {
  it('shows error alert from container when error prop is set', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm {...baseProps} error="Something went wrong" />
      </Wrapper>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

describe('StoreForm — PRES-4: valid submit calls onSubmit with payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onSubmit with name, address and moduleIds on valid submit', async () => {
    const { StoreForm } = await import('../store-form');
    const onSubmit = vi.fn();
    const modules = [makeModule({ id: 1, name: 'Module A', priceIncluded: false, selected: false })];
    render(
      <Wrapper>
        <StoreForm {...baseProps} modules={modules} onSubmit={onSubmit} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'My Store' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'My Store' }));
    });
  });
});

describe('StoreForm — PRES-4: isLoading state', () => {
  it('disables submit button when isLoading is true', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm {...baseProps} isLoading={true} />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: /guardando/i })).toBeDisabled();
  });
});

// ─── Finding 2: Owner select disabled in edit mode ────────────────────────────

describe('StoreForm — EDIT-1: owner select disabled in edit mode', () => {
  it('disables the owner select when isEditMode is true', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isOwnerAdmin={true}
          isEditMode={true}
          owners={[makeOwner()]}
        />
      </Wrapper>
    );
    const ownerSelect = screen.getByLabelText(/propietario/i) as HTMLSelectElement;
    expect(ownerSelect.disabled).toBe(true);
  });

  it('owner select is enabled in create mode', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isOwnerAdmin={true}
          isEditMode={false}
          owners={[makeOwner()]}
        />
      </Wrapper>
    );
    const ownerSelect = screen.getByLabelText(/propietario/i) as HTMLSelectElement;
    expect(ownerSelect.disabled).toBe(false);
  });
});

// ─── Finding 3: ownerId required validation ───────────────────────────────────

describe('StoreForm — VALID-1: ownerId required for ownerAdmin', () => {
  it('blocks submit and shows error when ownerId is empty and user is ownerAdmin', async () => {
    const { StoreForm } = await import('../store-form');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isOwnerAdmin={true}
          isEditMode={false}
          owners={[makeOwner()]}
          onSubmit={onSubmit}
        />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'My Store' } });
    // ownerId left empty
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('allows submit when ownerId is selected and user is ownerAdmin', async () => {
    const { StoreForm } = await import('../store-form');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isOwnerAdmin={true}
          isEditMode={false}
          owners={[makeOwner({ id: 'o1' })]}
          onSubmit={onSubmit}
        />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'My Store' } });
    fireEvent.change(screen.getByLabelText(/propietario/i), { target: { value: 'o1' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });
});

// ─── Finding 4: isActive defaults to false on create ─────────────────────────

describe('StoreForm — INIT-1: isActive defaults false in create mode', () => {
  it('isActive checkbox is unchecked by default in create mode for superAdmin', async () => {
    const { StoreForm } = await import('../store-form');
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isSuperAdmin={true}
          isEditMode={false}
        />
      </Wrapper>
    );
    const isActiveCheckbox = screen.getByLabelText(/activa/i) as HTMLInputElement;
    expect(isActiveCheckbox.checked).toBe(false);
  });
});

// ─── Finding 13: paymentStartDate required when isSuperAdmin && isEditMode ────

describe('StoreForm — VALID-2: paymentStartDate required for superAdmin in edit', () => {
  it('blocks submit and shows error when paymentStartDate is empty for superAdmin in edit', async () => {
    const { StoreForm } = await import('../store-form');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isSuperAdmin={true}
          isEditMode={true}
          onSubmit={onSubmit}
        />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'My Store' } });
    // paymentStartDate left empty
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('allows submit when paymentStartDate is set for superAdmin in edit', async () => {
    const { StoreForm } = await import('../store-form');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <StoreForm
          {...baseProps}
          isSuperAdmin={true}
          isEditMode={true}
          owners={[makeOwner({ id: 'o1' })]}
          initialValues={{ ownerId: 'o1', name: 'Existing Store' }}
          onSubmit={onSubmit}
        />
      </Wrapper>
    );
    // name is pre-filled, paymentStartDate needs to be filled
    fireEvent.change(screen.getByLabelText(/fecha de inicio/i), { target: { value: '2024-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });
});
