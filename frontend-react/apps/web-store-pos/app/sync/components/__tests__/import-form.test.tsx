import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { ImportForm } from '../import-form';
import type { SyncResult } from '~/sync/lib/services/data-synchronizer-service';
import {
  WrongPasswordError,
  CorruptFileError,
  WrongStoreError,
} from '~/sync/lib/services/data-serializer-service';

// T6 (Angular parity, receive-data.component.ts:48/55): the two import-failure paths are
// blocking error Swals, mocked via the shared wrapper rather than asserting inline DOM text.
const showBlockingErrorMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

// TOAST-CALLSITES #4 (toast-notifications-parity): sync import success now fires a toast
// instead of the inline <InfoBox variant="primary"> success banner.
const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
  showToastError: vi.fn(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

const SUCCESS_RESULT: SyncResult = {
  succeeded: true,
  errors: [],
  merges: [
    { entity: 'categories', inserted: 2, updated: 1 },
    { entity: 'products', inserted: 5, updated: 3 },
    { entity: 'inventoryEntries', inserted: 4, updated: 0 },
    { entity: 'orders', inserted: 1, updated: 2 },
    { entity: 'expenses', inserted: 0, updated: 1 },
    { entity: 'saleCredits', inserted: 3, updated: 0 },
  ],
};

function makeZipFile(name = 'backup.zip'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'application/zip' });
}

describe('ImportForm — S-IMPORT-1: missing file blocked', () => {
  it('does not call onImport when no file selected', async () => {
    const onImport = vi.fn().mockResolvedValue(SUCCESS_RESULT);
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByText(/Seleccioná un archivo/i)).toBeInTheDocument();
  });
});

describe('ImportForm — S-IMPORT-2: missing password blocked', () => {
  it('does not call onImport when password is empty', async () => {
    const onImport = vi.fn().mockResolvedValue(SUCCESS_RESULT);
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [makeZipFile()],
      configurable: true,
    });
    fireEvent.change(fileInput);
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByText(/La contraseña no puede estar vacía/i)).toBeInTheDocument();
  });
});

describe('ImportForm — S-IMPORT-3: success shows Angular single-line toast (no per-entity counts)', () => {
  it('fires showToastSuccess with the Angular success line, no title, and renders no counts panel', async () => {
    const onImport = vi.fn().mockResolvedValue(SUCCESS_RESULT);
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [makeZipFile()],
      configurable: true,
    });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    await waitFor(() =>
      expect(showToastSuccessMock).toHaveBeenCalledWith('Los datos se importaron correctamente.'),
    );

    // The old inline success InfoBox is gone (toast-notifications-parity #4).
    expect(
      screen.queryByText('Los datos se importaron correctamente.'),
    ).not.toBeInTheDocument();
    // Angular shows no summary panel, no per-entity breakdown, no counts
    expect(screen.queryByText(/Importación completada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/insertado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/categories/i)).not.toBeInTheDocument();
  });
});

describe('ImportForm — S-IMPORT-4: wrong-password collapses into Angular generic error + no writes', () => {
  // T6 (Angular parity, receive-data.component.ts:55-59): a blocking error Swal, not inline
  // DOM text.
  it('shows the generic Angular import error via showBlockingError (no distinct wrong-password text)', async () => {
    const onImport = vi.fn().mockRejectedValue(new WrongPasswordError());
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [makeZipFile()],
      configurable: true,
    });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'wrong-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'Ha ocurrido un error al importar los datos. Si el error persiste contacte al servicio técnico.',
      ),
    );
    // Success message must NOT appear (no writes)
    expect(
      screen.queryByText(/Los datos se importaron correctamente/i),
    ).not.toBeInTheDocument();
  });
});

describe('ImportForm — S-IMPORT-5: corrupt-file collapses into Angular generic error + no writes', () => {
  // T6 (Angular parity, receive-data.component.ts:55-59): a blocking error Swal, not inline
  // DOM text.
  it('shows the generic Angular import error via showBlockingError (no distinct corrupt-file text)', async () => {
    const onImport = vi.fn().mockRejectedValue(new CorruptFileError());
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [makeZipFile()],
      configurable: true,
    });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'any-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'Ha ocurrido un error al importar los datos. Si el error persiste contacte al servicio técnico.',
      ),
    );
    expect(
      screen.queryByText(/Los datos se importaron correctamente/i),
    ).not.toBeInTheDocument();
  });
});

describe('ImportForm — V2-10: wrong-store shows the dedicated message (not the generic one)', () => {
  // sync-export-import-v2 (V2-10): WrongStoreError is the ONE import failure
  // with its own message — the archive is valid, the store isn't, so the
  // generic "error importing" text would mislead the user.
  it('shows SYNC.ERROR_WRONG_STORE via showBlockingError when serializer throws WrongStoreError', async () => {
    const onImport = vi.fn().mockRejectedValue(new WrongStoreError());
    // Isolate call history from earlier describe blocks (mock is file-scoped).
    showBlockingErrorMock.mockClear();
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [makeZipFile()],
      configurable: true,
    });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'correct-for-another-store' },
    });
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'Este respaldo pertenece a otra tienda. Usá la contraseña y el archivo de exportación de la tienda actual.',
      ),
    );
    // The generic message must NOT be shown for a store mismatch
    expect(showBlockingErrorMock).not.toHaveBeenCalledWith(
      'Error',
      'Ha ocurrido un error al importar los datos. Si el error persiste contacte al servicio técnico.',
    );
    expect(
      screen.queryByText(/Los datos se importaron correctamente/i),
    ).not.toBeInTheDocument();
  });
});

describe('ImportForm — S-IMPORT-7: shared UI kit (Card/Button fab/InfoBox)', () => {
  it('renders the title via a Card header (SYNC.IMPORT_TITLE)', () => {
    const onImport = vi.fn().mockResolvedValue(SUCCESS_RESULT);
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );
    const card = screen.getByText('Importar datos').closest('[data-slot="card"]');
    expect(card).not.toBeNull();
  });

  it('renders the submit button with the fab style (rounded-full)', () => {
    const onImport = vi.fn().mockResolvedValue(SUCCESS_RESULT);
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /importar/i }).className).toContain('rounded-full');
  });

  it('fires the success toast instead of an InfoBox banner (toast-notifications-parity #4)', async () => {
    const onImport = vi.fn().mockResolvedValue(SUCCESS_RESULT);
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [makeZipFile()], configurable: true });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    await waitFor(() => {
      expect(showToastSuccessMock).toHaveBeenCalledWith('Los datos se importaron correctamente.');
    });
    expect(screen.queryByText('Los datos se importaron correctamente.')).not.toBeInTheDocument();
  });
});

describe('ImportForm — S-IMPORT-8: password show/hide toggle', () => {
  it('toggles the password input between hidden and visible text', () => {
    const onImport = vi.fn().mockResolvedValue(SUCCESS_RESULT);
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
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

describe('ImportForm — S-IMPORT-9: unexpected error collapses into Angular generic message', () => {
  // T6 (Angular parity, receive-data.component.ts:55-59): a blocking error Swal, not inline
  // DOM text.
  it('shows the generic Angular import error via showBlockingError, never a raw err.message', async () => {
    const onImport = vi.fn().mockRejectedValue(new Error('raw boom, do not leak me'));
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [makeZipFile()], configurable: true });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'Ha ocurrido un error al importar los datos. Si el error persiste contacte al servicio técnico.',
      ),
    );
    expect(screen.queryByText(/raw boom/i)).not.toBeInTheDocument();
  });

  // T6: the `!syncResult.succeeded` branch (synchronizer returns a domain error rather than
  // throwing) is the SAME blocking error Swal shape, surfacing the first domain error's message.
  it('shows the domain error message via showBlockingError when the synchronizer resolves succeeded:false', async () => {
    const onImport = vi.fn().mockResolvedValue({
      succeeded: false,
      errors: [{ message: 'La categoría X no existe.' }],
      merges: [],
    });
    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [makeZipFile()], configurable: true });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'La categoría X no existe.'),
    );
  });
});

describe('ImportForm — S-IMPORT-6: loading state (button disabled, label unchanged — Angular parity)', () => {
  it('disables the button while importing and keeps the "Importar" label', async () => {
    let resolveImport!: (v: SyncResult) => void;
    const onImport = vi.fn(
      () =>
        new Promise<SyncResult>((resolve) => {
          resolveImport = resolve;
        }),
    );

    render(
      <Wrapper>
        <ImportForm onImport={onImport} />
      </Wrapper>,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [makeZipFile()],
      configurable: true,
    });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByLabelText(/contraseña de cifrado/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /importar/i })).toBeDisabled(),
    );

    await act(async () => {
      resolveImport(SUCCESS_RESULT);
    });
  });
});
