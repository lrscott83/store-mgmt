import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { SystemConfiguration } from '@store-mgmt/domain';

// ── PRES-1..6, SAVE-1, SAVE-3, SAVE-5, OFFLINE-3, OFFLINE-5 ──────────────────

function makeSystemConfiguration(overrides: Partial<SystemConfiguration> = {}): SystemConfiguration {
  return {
    id: '1',
    name: 'tax_rate',
    value: '0.15',
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

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigurationsForm — PRES-2: renders N rows
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsForm — PRES-2: renders N rows (name label + value input)', () => {
  it('renders one row per configuration entry', async () => {
    const { ConfigurationsForm } = await import('../ConfigurationsForm');
    const configs = [
      makeSystemConfiguration({ id: '1', name: 'tax_rate', value: '0.15' }),
      makeSystemConfiguration({ id: '2', name: 'currency', value: 'USD' }),
    ];
    render(
      <Wrapper>
        <ConfigurationsForm
          initialValues={configs}
          isOnline
          onSubmit={vi.fn()}
        />
      </Wrapper>
    );
    expect(screen.getByText('tax_rate')).toBeInTheDocument();
    expect(screen.getByText('currency')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('USD')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigurationsForm — SAVE-5: name is read-only
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsForm — SAVE-5: name is read-only label, value is editable', () => {
  it('value input is editable and updates on change', async () => {
    const { ConfigurationsForm } = await import('../ConfigurationsForm');
    render(
      <Wrapper>
        <ConfigurationsForm
          initialValues={[makeSystemConfiguration({ id: '1', name: 'tax_rate', value: '0.15' })]}
          isOnline
          onSubmit={vi.fn()}
        />
      </Wrapper>
    );
    const input = screen.getByDisplayValue('0.15');
    fireEvent.change(input, { target: { value: '0.20' } });
    expect(screen.getByDisplayValue('0.20')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigurationsForm — SAVE-1: submit emits full updated SystemConfiguration[]
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsForm — SAVE-1: submit emits full updated SystemConfiguration[]', () => {
  it('onSubmit receives updated list with edited value', async () => {
    const { ConfigurationsForm } = await import('../ConfigurationsForm');
    const onSubmit = vi.fn();
    render(
      <Wrapper>
        <ConfigurationsForm
          initialValues={[
            makeSystemConfiguration({ id: '1', name: 'tax_rate', value: '0.15' }),
            makeSystemConfiguration({ id: '2', name: 'currency', value: 'USD' }),
          ]}
          isOnline
          onSubmit={onSubmit}
        />
      </Wrapper>
    );
    fireEvent.change(screen.getByDisplayValue('0.15'), { target: { value: '0.25' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith([
        { id: '1', name: 'tax_rate', value: '0.25' },
        { id: '2', name: 'currency', value: 'USD' },
      ]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigurationsForm — PRES-5 / OFFLINE-3: submit disabled + offline notice
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsForm — PRES-5/OFFLINE-3: submit disabled and offline notice when !isOnline', () => {
  it('disables submit button and shows offline notice when isOnline=false', async () => {
    const { ConfigurationsForm } = await import('../ConfigurationsForm');
    render(
      <Wrapper>
        <ConfigurationsForm
          initialValues={[makeSystemConfiguration()]}
          isOnline={false}
          onSubmit={vi.fn()}
        />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigurationsForm — PRES-6: degraded banner visible when isDegraded=true
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsForm — PRES-6: degraded banner visible when isDegraded=true', () => {
  it('shows degraded notice banner when isDegraded=true', async () => {
    const { ConfigurationsForm } = await import('../ConfigurationsForm');
    render(
      <Wrapper>
        <ConfigurationsForm
          initialValues={[makeSystemConfiguration()]}
          isOnline={false}
          isDegraded
          onSubmit={vi.fn()}
        />
      </Wrapper>
    );
    expect(screen.getByText(/caché/i)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigurationsForm — CONFIG-4: empty state when initialValues=[]
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsForm — CONFIG-4: empty-state message when initialValues=[]', () => {
  it('shows empty state when no configurations', async () => {
    const { ConfigurationsForm } = await import('../ConfigurationsForm');
    render(
      <Wrapper>
        <ConfigurationsForm
          initialValues={[]}
          isOnline
          onSubmit={vi.fn()}
        />
      </Wrapper>
    );
    expect(screen.getByText(/no hay configuraciones/i)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ConfigurationsForm — ERR-2: error prop renders inline
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsForm — ERR-2: error prop renders inline', () => {
  it('shows error message when error prop is provided', async () => {
    const { ConfigurationsForm } = await import('../ConfigurationsForm');
    render(
      <Wrapper>
        <ConfigurationsForm
          initialValues={[makeSystemConfiguration()]}
          isOnline
          onSubmit={vi.fn()}
          error="Ocurrió un error al guardar."
        />
      </Wrapper>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Ocurrió un error al guardar.');
  });
});
