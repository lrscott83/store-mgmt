import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { HotspotReceiveModal } from '../hotspot-receive-modal';

const mocks = vi.hoisted(() => ({
  acceptOffer: vi.fn(),
  pairingProof: vi.fn(async () => 'PROOF'),
  decodeOfferPayload: vi.fn(),
  encodeAnswerPayload: vi.fn(async () => 'ENCODED-ANSWER'),
  receiveTransfer: vi.fn(),
  SignalingTimeoutError: class SignalingTimeoutError extends Error {},
  TransferTooLargeError: class TransferTooLargeError extends Error {},
}));

vi.mock('~/sync/lib/hotspot/peer-connection', () => ({
  acceptOffer: mocks.acceptOffer,
  SignalingTimeoutError: mocks.SignalingTimeoutError,
}));
vi.mock('~/sync/lib/hotspot/pairing-code', () => ({ pairingProof: mocks.pairingProof }));
vi.mock('~/sync/lib/hotspot/handshake', () => ({
  HANDSHAKE_VERSION: 1,
  decodeOfferPayload: mocks.decodeOfferPayload,
  encodeAnswerPayload: mocks.encodeAnswerPayload,
}));
vi.mock('~/sync/lib/hotspot/transfer-protocol', () => ({
  receiveTransfer: mocks.receiveTransfer,
  TransferTooLargeError: mocks.TransferTooLargeError,
}));
vi.mock('~/sync/components/qr-code', () => ({
  QrCode: ({ value }: { value: string }) => <div data-testid="qr-code">{value}</div>,
}));
vi.mock('~/sync/components/qr-scanner', () => ({
  QrScanner: ({ onDecoded }: { onDecoded: (text: string) => void }) => (
    <button type="button" data-testid="fake-scan" onClick={() => onDecoded('OFFER-PAYLOAD')}>
      scan
    </button>
  ),
}));

const OFFER = {
  v: 1,
  type: 'offer',
  sdp: 'v=0\r\noffer',
  code: '482913',
  salt: 'SALT',
  file: { name: 'roster.smcabundle', size: 3072, kind: 'roster' },
};

function renderModal() {
  const onReceived = vi.fn();
  const onClose = vi.fn();
  render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <HotspotReceiveModal onReceived={onReceived} onClose={onClose} />
    </IntlProvider>,
  );
  return { onReceived, onClose };
}

async function scanOffer() {
  fireEvent.click(await screen.findByTestId('fake-scan'));
  await screen.findByTestId('hotspot-offer-code');
}

describe('HotspotReceiveModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pairingProof.mockResolvedValue('PROOF');
    mocks.encodeAnswerPayload.mockResolvedValue('ENCODED-ANSWER');
    mocks.decodeOfferPayload.mockResolvedValue(OFFER);
    mocks.acceptOffer.mockResolvedValue({
      connection: { close: vi.fn() },
      channel: Promise.resolve({}),
      sdp: 'v=0\r\nanswer',
    });
    mocks.receiveTransfer.mockResolvedValue({
      metadata: { name: 'roster.smcabundle', size: 3, sha256: 'x', kind: 'roster' },
      bytes: new Uint8Array([1, 2, 3]),
      verified: true,
    });
  });

  it('scans the offer and shows the pairing code plus the incoming file', async () => {
    renderModal();
    await scanOffer();

    expect(screen.getByTestId('hotspot-offer-code')).toHaveTextContent('482913');
    expect(screen.getByTestId('hotspot-offer-file')).toHaveTextContent('roster.smcabundle');
    expect(screen.getByTestId('hotspot-offer-file')).toHaveTextContent('3.0 KB');
  });

  it('answers, receives, and hands the File to the import flow', async () => {
    const { onReceived } = renderModal();
    await scanOffer();

    fireEvent.click(screen.getByTestId('hotspot-accept'));

    await waitFor(() => expect(onReceived).toHaveBeenCalledTimes(1));
    expect(mocks.pairingProof).toHaveBeenCalledWith('482913', 'SALT');
    expect(mocks.acceptOffer).toHaveBeenCalledWith('v=0\r\noffer');
    expect(mocks.encodeAnswerPayload).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'answer', sdp: 'v=0\r\nanswer', proof: 'PROOF' }),
    );

    const file = onReceived.mock.calls[0][0] as File;
    expect(file.name).toBe('roster.smcabundle');
  });

  it('refuses a payload whose digest does not match', async () => {
    mocks.receiveTransfer.mockResolvedValue({
      metadata: { name: 'roster.smcabundle', size: 3, sha256: 'x', kind: 'roster' },
      bytes: new Uint8Array([9, 9, 9]),
      verified: false,
    });
    const { onReceived } = renderModal();
    await scanOffer();

    fireEvent.click(screen.getByTestId('hotspot-accept'));

    expect(await screen.findByText(esMessages['HOTSPOT.ERROR'])).toBeInTheDocument();
    expect(onReceived).not.toHaveBeenCalled();
  });

  it('closes through the X button', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId('hotspot-receive-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the hotspot-unreachable guidance when the peer never answers', async () => {
    mocks.acceptOffer.mockRejectedValue(new mocks.SignalingTimeoutError());
    renderModal();
    await scanOffer();

    fireEvent.click(screen.getByTestId('hotspot-accept'));

    expect(await screen.findByText(esMessages['HOTSPOT.ERROR_UNREACHABLE'])).toBeInTheDocument();
  });

  it('reports an oversized payload', async () => {
    mocks.receiveTransfer.mockRejectedValue(new mocks.TransferTooLargeError());
    renderModal();
    await scanOffer();

    fireEvent.click(screen.getByTestId('hotspot-accept'));

    expect(await screen.findByText(esMessages['HOTSPOT.ERROR_TOO_LARGE'])).toBeInTheDocument();
  });
});
