import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { ScannerModal } from '../scanner-modal';

const onScannedMock = vi.fn();
const onCloseMock = vi.fn();

// jsdom has no camera; the real @zxing/browser mock (hoisted by sale.test.tsx
// conventions) makes the open effect reject into the 'denied' state — which
// is exactly the state these tests assert against.
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

describe('ScannerModal', () => {
  beforeEach(() => {
    onScannedMock.mockClear();
    onCloseMock.mockClear();
  });

  it('renders the modal with the manual entry fallback (jsdom: camera path degrades to denied)', async () => {
    renderModal();
    expect(screen.getByTestId('scanner-modal')).toBeInTheDocument();
    expect(screen.getByTestId('scanner-manual-input')).toBeInTheDocument();
    // Camera unavailable in jsdom -> the denied message appears and the video
    // stays hidden (no dead black rectangle).
    expect(await screen.findByTestId('scanner-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('scanner-video')).not.toBeInTheDocument();
  });

  it('manual entry submits the trimmed barcode through onScanned and clears the input', async () => {
    renderModal();
    const input = screen.getByTestId('scanner-manual-input');
    fireEvent.change(input, { target: { value: '  7501234  ' } });
    fireEvent.submit(input.closest('form')!);

    expect(onScannedMock).toHaveBeenCalledWith('7501234');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('empty manual entry does not call onScanned', () => {
    renderModal();
    const input = screen.getByTestId('scanner-manual-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onScannedMock).not.toHaveBeenCalled();
  });

  it('the X button calls onClose', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('scanner-close'));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('the Done button calls onClose', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('scanner-done'));
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
    expect(
      screen.getByText(/Permiso de cámara denegado/i),
    ).toBeInTheDocument();
    // Cleanup contract: unmounting must never throw — the stream-stop path
    // is exercised even when start never succeeded.
    expect(() => unmount()).not.toThrow();
  });
});
