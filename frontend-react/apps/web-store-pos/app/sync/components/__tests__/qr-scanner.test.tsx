import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { QrScanner } from '../qr-scanner';

const { decodeFromVideoDevice } = vi.hoisted(() => ({ decodeFromVideoDevice: vi.fn() }));

vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: vi.fn().mockImplementation(() => ({ decodeFromVideoDevice })),
}));

const onDecodedMock = vi.fn();
const onCloseMock = vi.fn();

function renderScanner() {
  return render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <QrScanner onDecoded={onDecodedMock} onClose={onCloseMock} />
    </IntlProvider>,
  );
}

describe('QrScanner', () => {
  beforeEach(() => {
    onDecodedMock.mockClear();
    onCloseMock.mockClear();
    decodeFromVideoDevice.mockReset();
  });

  it('decodes the first QR and reports its text exactly once', async () => {
    decodeFromVideoDevice.mockImplementation(async (..._args: unknown[]) => {
      const callback = _args[2] as (result: { getText: () => string } | undefined) => void;
      callback({ getText: () => 'HOTSPOT-PAYLOAD' });
      callback({ getText: () => 'IGNORED-SECOND-READ' });
      return { stop: vi.fn() };
    });

    renderScanner();
    await screen.findByTestId('qr-scanner-status');

    expect(onDecodedMock).toHaveBeenCalledTimes(1);
    expect(onDecodedMock).toHaveBeenCalledWith('HOTSPOT-PAYLOAD');
  });

  it('shows a clear message when the camera cannot start', async () => {
    decodeFromVideoDevice.mockRejectedValue(new Error('no camera in jsdom'));
    renderScanner();

    expect(await screen.findByTestId('qr-scanner-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('qr-scanner-video')).not.toBeInTheDocument();
  });

  it('closes through the X button', () => {
    decodeFromVideoDevice.mockResolvedValue({ stop: vi.fn() });
    renderScanner();

    fireEvent.click(screen.getByTestId('qr-scanner-close'));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
