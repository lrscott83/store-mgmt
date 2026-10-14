import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { HotspotShareModal, type HotspotShareModalProps } from '../hotspot-share-modal';

const mocks = vi.hoisted(() => ({
  createOffer: vi.fn(),
  completeConnection: vi.fn(),
  waitForChannelOpen: vi.fn(),
  generatePairingCode: vi.fn(() => '482913'),
  generatePairingSalt: vi.fn(() => 'SALT'),
  verifyPairingProof: vi.fn(),
  encodeOfferPayload: vi.fn(async () => 'ENCODED-OFFER'),
  decodeAnswerPayload: vi.fn(),
  sendTransfer: vi.fn(),
}));

vi.mock('~/sync/lib/hotspot/peer-connection', () => ({
  createOffer: mocks.createOffer,
  completeConnection: mocks.completeConnection,
  waitForChannelOpen: mocks.waitForChannelOpen,
}));
vi.mock('~/sync/lib/hotspot/pairing-code', () => ({
  generatePairingCode: mocks.generatePairingCode,
  generatePairingSalt: mocks.generatePairingSalt,
  verifyPairingProof: mocks.verifyPairingProof,
}));
vi.mock('~/sync/lib/hotspot/handshake', () => ({
  HANDSHAKE_VERSION: 1,
  encodeOfferPayload: mocks.encodeOfferPayload,
  decodeAnswerPayload: mocks.decodeAnswerPayload,
}));
vi.mock('~/sync/lib/hotspot/transfer-protocol', () => ({
  sendTransfer: mocks.sendTransfer,
}));
vi.mock('~/sync/components/qr-code', () => ({
  QrCode: ({ value }: { value: string }) => <div data-testid="qr-code">{value}</div>,
}));
vi.mock('~/sync/components/qr-scanner', () => ({
  QrScanner: ({ onDecoded }: { onDecoded: (text: string) => void }) => (
    <button type="button" data-testid="fake-scan" onClick={() => onDecoded('ANSWER-PAYLOAD')}>
      scan
    </button>
  ),
}));

const SOURCE = { name: 'roster.smcabundle', kind: 'roster', bytes: new Uint8Array([1, 2, 3]) };

function renderModal(prepare: HotspotShareModalProps['prepare'] = vi.fn(async () => SOURCE)) {
  const onClose = vi.fn();
  render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <HotspotShareModal prepare={prepare} onClose={onClose} />
    </IntlProvider>,
  );
  return { prepare, onClose };
}

async function reachWaiting() {
  fireEvent.change(screen.getByLabelText(esMessages['PROVISION.MASTER_PASSWORD_LABEL']), {
    target: { value: 'secret' },
  });
  fireEvent.click(screen.getByTestId('hotspot-generate'));
  await screen.findByTestId('hotspot-pairing-code');
}

describe('HotspotShareModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generatePairingCode.mockReturnValue('482913');
    mocks.generatePairingSalt.mockReturnValue('SALT');
    mocks.encodeOfferPayload.mockResolvedValue('ENCODED-OFFER');
    mocks.createOffer.mockResolvedValue({
      connection: { close: vi.fn() },
      channel: {},
      sdp: 'v=0\r\n',
    });
    mocks.completeConnection.mockResolvedValue(undefined);
    mocks.waitForChannelOpen.mockResolvedValue(undefined);
    mocks.sendTransfer.mockResolvedValue(undefined);
  });

  it('goes password -> offer QR + pairing code', async () => {
    const { prepare } = renderModal();
    await reachWaiting();

    expect(screen.getByTestId('hotspot-pairing-code')).toHaveTextContent('482913');
    expect(screen.getByTestId('qr-code')).toHaveTextContent('ENCODED-OFFER');
    expect(prepare).toHaveBeenCalledWith('secret');
    expect(mocks.encodeOfferPayload).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'offer', code: '482913', salt: 'SALT', sdp: 'v=0\r\n' }),
    );
  });

  it('completes the transfer after scanning a valid answer', async () => {
    mocks.verifyPairingProof.mockResolvedValue(true);
    mocks.decodeAnswerPayload.mockResolvedValue({
      v: 1,
      type: 'answer',
      sdp: 'v=0\r\nanswer',
      proof: 'PROOF',
    });
    renderModal();
    await reachWaiting();

    fireEvent.click(screen.getByTestId('hotspot-scan-answer'));
    fireEvent.click(await screen.findByTestId('fake-scan'));

    expect(await screen.findByTestId('hotspot-done')).toBeInTheDocument();
    expect(mocks.verifyPairingProof).toHaveBeenCalledWith('482913', 'SALT', 'PROOF');
    expect(mocks.completeConnection).toHaveBeenCalledWith(expect.anything(), 'v=0\r\nanswer');
    expect(mocks.sendTransfer).toHaveBeenCalledWith(
      expect.anything(),
      SOURCE,
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
  });

  it('rejects a mismatched answer and returns to the waiting step', async () => {
    mocks.verifyPairingProof.mockResolvedValue(false);
    mocks.decodeAnswerPayload.mockResolvedValue({
      v: 1,
      type: 'answer',
      sdp: 'v=0\r\nanswer',
      proof: 'WRONG',
    });
    renderModal();
    await reachWaiting();

    fireEvent.click(screen.getByTestId('hotspot-scan-answer'));
    fireEvent.click(await screen.findByTestId('fake-scan'));

    expect(await screen.findByText(esMessages['HOTSPOT.ERROR_PAIRING'])).toBeInTheDocument();
    expect(mocks.sendTransfer).not.toHaveBeenCalled();
    expect(screen.getByTestId('hotspot-pairing-code')).toBeInTheDocument();
  });

  it('requires a master password before generating', async () => {
    const { prepare } = renderModal();
    fireEvent.click(screen.getByTestId('hotspot-generate'));

    expect(await screen.findByText(esMessages['SYNC.ERROR_EMPTY_PASSWORD'])).toBeInTheDocument();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('closes through the X button', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId('hotspot-share-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
