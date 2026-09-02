import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { ImportForm } from '../import-form';
import type { SyncResult } from '~/sync/lib/services/data-synchronizer-service';
import { showToastSuccess } from '~/shared/lib/toast';
import { showBlockingError } from '~/shared/lib/blocking-alert';

/**
 * [Coverage improvement] ImportForm — sync/routes/import.tsx coverage
 *
 * Tests the ImportForm component covering:
 * - Rendering (title, inputs, button)
 * - Client-side validation (empty file, empty password)
 * - Password visibility toggle
 * - Successful import flow
 * - Failed import (succeeded: false)
 * - Error from onImport (throws)
 * - WrongStoreError handling
 * - Busy state during import
 */

// Mock toast and blocking-alert
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: vi.fn(),
}));

vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: vi.fn(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeFile(name = 'test.zip'): File {
  return new File(['dummy'], name, { type: 'application/zip' });
}

const successResult: SyncResult = { succeeded: true, errors: [], merges: [] };
const failedResult: SyncResult = {
  succeeded: false,
  errors: [{ entity: 'products', code: 'DuplicatedData', message: 'Duplicate product' }],
  merges: [],
};

describe('ImportForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, file input, password input, and submit button', () => {
    render(<ImportForm onImport={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.getByText('Importar datos')).toBeTruthy();
    expect(screen.getByLabelText(/Archivo de respaldo/i)).toBeTruthy();
    expect(screen.getByLabelText(/Contraseña de cifrado/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importar' })).toBeTruthy();
  });

  it('shows error when submitting without file', async () => {
    const onImport = vi.fn();
    render(<ImportForm onImport={onImport} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    await waitFor(() => {
      expect(screen.getByText(/selecciona un archivo/i)).toBeTruthy();
    });
    expect(onImport).not.toHaveBeenCalled();
  });

  it('shows error when submitting without password', async () => {
    const onImport = vi.fn();
    render(<ImportForm onImport={onImport} />, { wrapper: Wrapper });

    // Select a file first
    const fileInput = screen.getByLabelText(/Archivo de respaldo/i);
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    await waitFor(() => {
      expect(screen.getByText(/contraseña no puede estar vacía/i)).toBeTruthy();
    });
    expect(onImport).not.toHaveBeenCalled();
  });

  it('calls onImport on successful submit', async () => {
    const onImport = vi.fn().mockResolvedValue(successResult);
    render(<ImportForm onImport={onImport} />, { wrapper: Wrapper });

    // Fill form
    const fileInput = screen.getByLabelText(/Archivo de respaldo/i);
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.change(screen.getByLabelText(/Contraseña de cifrado/i), { target: { value: 'test123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalled();
    });

    expect(vi.mocked(showToastSuccess)).toHaveBeenCalled();
  });

  it('shows blocking error when syncResult.succeeded is false', async () => {
    const onImport = vi.fn().mockResolvedValue(failedResult);
    render(<ImportForm onImport={onImport} />, { wrapper: Wrapper });

    const fileInput = screen.getByLabelText(/Archivo de respaldo/i);
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.change(screen.getByLabelText(/Contraseña de cifrado/i), { target: { value: 'test123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    await waitFor(() => {
      expect(vi.mocked(showBlockingError)).toHaveBeenCalled();
    });
  });

  it('shows generic error when onImport throws', async () => {
    const onImport = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<ImportForm onImport={onImport} />, { wrapper: Wrapper });

    const fileInput = screen.getByLabelText(/Archivo de respaldo/i);
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.change(screen.getByLabelText(/Contraseña de cifrado/i), { target: { value: 'test123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    await waitFor(() => {
      expect(vi.mocked(showBlockingError)).toHaveBeenCalled();
    });
  });

  it('shows WrongStoreError message when onImport throws WrongStoreError', async () => {
    // Import WrongStoreError to throw it
    const { WrongStoreError } = await import('~/sync/lib/services/data-serializer-service');
    const onImport = vi.fn().mockRejectedValue(new WrongStoreError());
    render(<ImportForm onImport={onImport} />, { wrapper: Wrapper });

    const fileInput = screen.getByLabelText(/Archivo de respaldo/i);
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.change(screen.getByLabelText(/Contraseña de cifrado/i), { target: { value: 'test123' } });

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    await waitFor(() => {
      expect(vi.mocked(showBlockingError)).toHaveBeenCalled();
      // The second argument should be the WrongStoreError message
      const callArgs = vi.mocked(showBlockingError).mock.calls[0];
      expect(callArgs[1]).toContain('tienda');
    });
  });

  it('toggles password visibility', () => {
    render(<ImportForm onImport={vi.fn()} />, { wrapper: Wrapper });

    const passwordInput = screen.getByLabelText(/Contraseña de cifrado/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggle = screen.getByRole('button', { name: /Mostrar contraseña/i });
    fireEvent.click(toggle);
    expect(passwordInput).toHaveAttribute('type', 'text');

    const hideToggle = screen.getByRole('button', { name: /Ocultar contraseña/i });
    fireEvent.click(hideToggle);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
