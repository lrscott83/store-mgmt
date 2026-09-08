import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { ScannerModal } from '../scanner-modal';

const onScannedMock = vi.fn();
const onCloseMock = vi.fn();

// jsdom has no camera; the mock makes the open effect reject into the
// 'denied' state — which is exactly the state these tests assert against.
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
    decodeFromVideoDevice: vi.fn().mockRejectedValue(new Error('no camera in jsdom')),
  })),
}));

function renderModal() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <ScannerModal onScanned={onScannedMock} onClose={onCloseMock} />
    </IntlProvider>,
  );
}

/**
 * ScannerModal — 2026-09-07 redesign suite. The manual barcode form, its +
 * submit button and the "Listo" button are GONE; the modal now carries a
 * quantity stepper (default 1, right-aligned, cart-style round −/+ buttons)
 * whose value the camera decode reads at scan time. These tests pin the
 * stepper's behavior directly (the camera decode itself cannot run in jsdom).
 */
describe('ScannerModal', () => {
  beforeEach(() => {
    onScannedMock.mockClear();
    onCloseMock.mockClear();
  });

  it('renders the modal with the quantity stepper and NO manual form / + / Listo', async () => {
    renderModal();
    expect(screen.getByTestId('scanner-modal')).toBeInTheDocument();
    // The 2026-09-07 redesign dropped the manual-entry path entirely.
    expect(screen.queryByTestId('scanner-manual-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scanner-manual-submit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scanner-done')).not.toBeInTheDocument();
    // The quantity stepper is present, defaulting to 1.
    const stepper = screen.getByTestId('scanner-quantity-stepper');
    expect(stepper).toBeInTheDocument();
    const input = screen.getByTestId('scanner-quantity-input') as HTMLInputElement;
    expect(input.value).toBe('1');
    // Camera unavailable in jsdom -> the denied message appears and the video
    // stays hidden (no dead black rectangle).
    expect(await screen.findByTestId('scanner-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('scanner-video')).not.toBeInTheDocument();
  });

  it('the + button increments the quantity and − decrements it (floor 1)', () => {
    renderModal();
    const input = screen.getByTestId('scanner-quantity-input') as HTMLInputElement;
    fireEvent.click(screen.getByTestId('scanner-quantity-increase'));
    expect(input.value).toBe('2');
    fireEvent.click(screen.getByTestId('scanner-quantity-increase'));
    expect(input.value).toBe('3');
    fireEvent.click(screen.getByTestId('scanner-quantity-decrease'));
    expect(input.value).toBe('2');
    // Floor: at 1 the − button is disabled and never drops below 1.
    fireEvent.click(screen.getByTestId('scanner-quantity-decrease'));
    expect(input.value).toBe('1');
    const decrease = screen.getByTestId('scanner-quantity-decrease') as HTMLButtonElement;
    expect(decrease.disabled).toBe(true);
  });

  it('the quantity input accepts typed values and falls back to 1 on invalid', () => {
    renderModal();
    const input = screen.getByTestId('scanner-quantity-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '7' } });
    expect(input.value).toBe('7');
    fireEvent.change(input, { target: { value: '0' } });
    expect(input.value).toBe('1');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.value).toBe('1');
  });

  it('the X button calls onClose', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('scanner-close'));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('Escape key calls onClose', () => {
    renderModal();
    fireEvent.keyDown(screen.getByTestId('scanner-modal'), { key: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('camera failure shows CAMERA_PERMISSION_DENIED and stops the stream on unmount', async () => {
    const { unmount } = renderModal();
    expect(await screen.findByTestId('scanner-denied')).toBeInTheDocument();
    expect(screen.getByText(/Permiso de cámara denegado/i)).toBeInTheDocument();
    // Cleanup contract: unmounting must never throw — the stream-stop path
    // is exercised even when start never succeeded.
    expect(() => unmount()).not.toThrow();
  });
});
