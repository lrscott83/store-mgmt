import { afterEach, describe, expect, it, vi } from 'vitest';

// Angular's source of truth uses the real `sweetalert2` library (Swal.fire) for every
// blocking dialog in the Sale module — no global Swal.mixin/theme override anywhere in
// `frontend/` (confirmed by grep), so React reproduces the SAME library with stock defaults,
// not a bespoke modal component. Mocking the 'sweetalert2' module itself (rather than
// window.alert/window.confirm) lets these tests assert the EXACT config passed to Swal.fire
// per call site, matching Angular byte-for-byte.
const fireMock = vi.fn();
vi.mock('sweetalert2', () => ({
  default: { fire: (...args: unknown[]) => fireMock(...args) },
}));

import { confirmDialog, showAcknowledgeError, showBlockingError } from '../blocking-alert';

describe('showBlockingError', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Angular: sale-product-row.component.ts:68-74 / :117-121 —
  // Swal.fire({ title, text, icon: 'error' }) — NO showCancelButton, NO confirmButtonText
  // override (SweetAlert2's own default confirm button is used, Angular never translates it
  // here — preserved verbatim, not "fixed").
  it('calls Swal.fire with icon error and the given title/text, no button overrides', () => {
    showBlockingError('Error', 'El producto no existe.');
    expect(fireMock).toHaveBeenCalledWith({
      icon: 'error',
      title: 'Error',
      text: 'El producto no existe.',
    });
  });
});

describe('confirmDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Angular: sale-credit-payment-modal.component.ts:52-60 /
  // order-item-list.component.ts:35-44 — identical shape: icon 'question',
  // showCancelButton true, confirmButtonColor #3456ff, cancelButtonColor #dc3545.
  it('fires a question dialog with the exact Angular button colors and resolves true on confirm', async () => {
    fireMock.mockResolvedValue({ isConfirmed: true });
    const result = await confirmDialog({
      title: 'Confirmación de Pago',
      message: '¿Usted está segura(o) que desea pagar este crédito por venta?',
      confirmButtonText: 'Si',
      cancelButtonText: 'No',
    });
    expect(fireMock).toHaveBeenCalledWith({
      title: 'Confirmación de Pago',
      text: '¿Usted está segura(o) que desea pagar este crédito por venta?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3456ff',
      cancelButtonColor: '#dc3545',
      confirmButtonText: 'Si',
      cancelButtonText: 'No',
    });
    expect(result).toBe(true);
  });

  it('resolves false when the user cancels', async () => {
    fireMock.mockResolvedValue({ isConfirmed: false });
    const result = await confirmDialog({
      title: 'Confirmación para eliminar',
      message: '¿Está seguro que desea eliminar esta Venta?',
      confirmButtonText: 'Si',
      cancelButtonText: 'No',
    });
    expect(result).toBe(false);
  });
});

describe('showAcknowledgeError', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Angular: order-item-list.component.ts:124-135 (showErrorMessage) — icon 'error',
  // showCancelButton false, confirmButtonColor #3456ff, cancelButtonColor #dc3545,
  // confirmButtonText translated (GENERAL.OK).
  it('fires an OK-only error dialog with the exact Angular colors and confirm text', () => {
    showAcknowledgeError({
      title: 'Error',
      message: 'Ocurrió un error eliminando la venta. La venta no pudo ser cancelada.',
      confirmButtonText: 'Ok',
    });
    expect(fireMock).toHaveBeenCalledWith({
      title: 'Error',
      text: 'Ocurrió un error eliminando la venta. La venta no pudo ser cancelada.',
      icon: 'error',
      showCancelButton: false,
      confirmButtonColor: '#3456ff',
      cancelButtonColor: '#dc3545',
      confirmButtonText: 'Ok',
    });
  });
});
