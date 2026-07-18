import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { ExportForm } from '../export-form';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

describe('ExportForm — S-EXPORT-1: empty password blocked', () => {
  it('does not call onExport when password is empty', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(
      <Wrapper>
        <ExportForm onExport={onExport} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /exportar/i }));
    expect(onExport).not.toHaveBeenCalled();
  });

  it('shows SYNC.ERROR_EMPTY_PASSWORD when submitted with empty password', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(
      <Wrapper>
        <ExportForm onExport={onExport} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /exportar/i }));
    expect(
      screen.getByText(/La contraseña no puede estar vacía/i),
    ).toBeInTheDocument();
  });
});

describe('ExportForm — S-EXPORT-2: share API called on success', () => {
  beforeEach(() => {
    // Mock navigator.share as available
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
      writable: true,
    });
  });

  it('calls onExport with the entered password', async () => {
    const payload = new Uint8Array([1, 2, 3]);
    const onExport = vi.fn().mockResolvedValue(payload);
    render(
      <Wrapper>
        <ExportForm onExport={onExport} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /exportar/i }));
    await waitFor(() => expect(onExport).toHaveBeenCalledWith('secret123'));
  });
});

describe('ExportForm — S-EXPORT-3: onExport called and no error on success', () => {
  beforeEach(() => {
    // Remove navigator.share to force fallback (container handles download)
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it('calls onExport with password even when share is unavailable', async () => {
    const payload = new Uint8Array([1, 2, 3]);
    const onExport = vi.fn().mockResolvedValue(payload);

    render(
      <Wrapper>
        <ExportForm onExport={onExport} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /exportar/i }));
    await waitFor(() => expect(onExport).toHaveBeenCalledWith('secret123'));
    // No error shown on success
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ExportForm — S-EXPORT-5: shared UI kit (Card/Button fab/InfoBox)', () => {
  it('renders the title via a Card header (SYNC.EXPORT_TITLE)', () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(
      <Wrapper>
        <ExportForm onExport={onExport} />
      </Wrapper>,
    );
    const card = screen.getByText('Exportar datos').closest('[data-slot="card"]');
    expect(card).not.toBeNull();
  });

  it('renders the submit button with the fab style (rounded-full)', () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(
      <Wrapper>
        <ExportForm onExport={onExport} />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /exportar/i }).className).toContain('rounded-full');
  });

  it('renders the empty-password error inside an InfoBox banner', () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(
      <Wrapper>
        <ExportForm onExport={onExport} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /exportar/i }));
    const banner = screen.getByText(/La contraseña no puede estar vacía/i);
    expect(banner.closest('[role="status"]')).not.toBeNull();
  });
});

describe('ExportForm — S-EXPORT-6: password show/hide toggle', () => {
  it('toggles the password input between hidden and visible text', () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(
      <Wrapper>
        <ExportForm onExport={onExport} />
      </Wrapper>,
    );
    const input = screen.getByLabelText(/contraseña de cifrado/i) as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: /mostrar contraseña/i }));
    expect(input.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: /ocultar contraseña/i }));
    expect(input.type).toBe('password');
  });
});

describe('ExportForm — S-EXPORT-7: export failure shows no error UI (Angular parity)', () => {
  it('shows no error banner and never leaks a raw err.message on export failure', async () => {
    const onExport = vi.fn().mockRejectedValue(new Error('raw boom, do not leak me'));
    render(
      <Wrapper>
        <ExportForm onExport={onExport} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /exportar/i }));

    // Wait for the export attempt to complete (button re-enabled by finally)
    await waitFor(() => expect(onExport).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /exportar/i })).not.toBeDisabled(),
    );

    // Angular's file-export path shows no success/error text at all
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/raw boom/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ocurrió un error inesperado/i)).not.toBeInTheDocument();
  });
});

describe('ExportForm — S-EXPORT-4: loading state (button disabled, label unchanged — Angular parity)', () => {
  it('disables the button while exporting and keeps the "Exportar" label', async () => {
    let resolveExport!: (v: Uint8Array) => void;
    const onExport = vi.fn(
      () =>
        new Promise<Uint8Array>((resolve) => {
          resolveExport = resolve;
        }),
    );

    render(
      <Wrapper>
        <ExportForm onExport={onExport} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /exportar/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /exportar/i })).toBeDisabled(),
    );

    await act(async () => {
      resolveExport(new Uint8Array([1, 2, 3]));
    });
  });
});
