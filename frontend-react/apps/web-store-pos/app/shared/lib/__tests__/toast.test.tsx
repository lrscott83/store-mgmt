import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import esMessages from '~/shared/lib/i18n/es';

// TOAST-HELPER (toast-notifications-parity): mock react-toastify directly — this is the
// helper's OWN test, the one place allowed to touch `react-toastify` rather than
// `~/shared/lib/toast` (design §5.1).
const successMock = vi.hoisted(() => vi.fn());
const errorMock = vi.hoisted(() => vi.fn());
vi.mock('react-toastify', () => ({
  toast: {
    success: (...args: unknown[]) => successMock(...args),
    error: (...args: unknown[]) => errorMock(...args),
  },
}));

import { showToastSuccess, showToastError } from '../toast';

describe('showToastSuccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires a success toast with the bare message and a message-keyed toastId when no title is given', () => {
    showToastSuccess('msg');

    expect(successMock).toHaveBeenCalledTimes(1);
    const [content, options] = successMock.mock.calls[0];
    expect(options).toEqual({ toastId: 'msg' });
    render(<>{content}</>);
    expect(screen.getByText('msg')).toBeInTheDocument();
  });

  it('renders both the title and the message when a title is given, keyed by message', () => {
    showToastSuccess('msg', 'Éxito');

    expect(successMock).toHaveBeenCalledTimes(1);
    const [content, options] = successMock.mock.calls[0];
    expect(options).toEqual({ toastId: 'msg' });
    render(<>{content}</>);
    expect(screen.getByText('Éxito')).toBeInTheDocument();
    expect(screen.getByText('msg')).toBeInTheDocument();
  });
});

describe('showToastError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires an error toast with title + message content, keyed by message', () => {
    showToastError('msg', 'Error');

    expect(errorMock).toHaveBeenCalledTimes(1);
    const [content, options] = errorMock.mock.calls[0];
    expect(options).toEqual({ toastId: 'msg' });
    render(<>{content}</>);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('msg')).toBeInTheDocument();
  });
});

describe('dedupe intent — toastId is keyed on the MESSAGE, not the title (ADR-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gives two distinct messages sharing the same title two DISTINCT toastIds', () => {
    showToastSuccess('primer mensaje', 'Éxito');
    showToastSuccess('segundo mensaje', 'Éxito');

    const [, firstOptions] = successMock.mock.calls[0];
    const [, secondOptions] = successMock.mock.calls[1];
    expect(firstOptions).toEqual({ toastId: 'primer mensaje' });
    expect(secondOptions).toEqual({ toastId: 'segundo mensaje' });
    expect(firstOptions.toastId).not.toBe(secondOptions.toastId);
  });
});

// TOAST-I18N: guards the new i18n key this change adds (es.ts:299 sibling).
describe('i18n — GENERAL.RESPONSE.SUCCESS_TITLE (TOAST-I18N)', () => {
  it('resolves to "Éxito"', () => {
    expect(esMessages['GENERAL.RESPONSE.SUCCESS_TITLE']).toBe('Éxito');
  });

  it('leaves the pre-existing sibling keys byte-unchanged', () => {
    expect(esMessages['SHOPPING_CART.ORDER_CREATED']).toBe('La venta fue creada satisfactoriamente.');
    expect(esMessages['SYNC.IMPORT_SUCCESS']).toBe('Los datos se importaron correctamente.');
    expect(esMessages['FEATURES.FEATURES_ACTIVATED']).toBe('Las funcionalidades se activaron satisfactoriamente');
    expect(esMessages['FEATURES.UNEXPECTED_ERROR']).toBe('Ocurrió un error inesperado activando las funcionalidades');
    expect(esMessages['GENERAL.RESPONSE.ERROR_TITLE']).toBe('Error');
  });
});
