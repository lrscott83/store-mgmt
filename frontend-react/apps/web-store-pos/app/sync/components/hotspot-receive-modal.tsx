import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { CloseIcon } from '~/shared/components/ui/icons';
import { QrCode } from '~/sync/components/qr-code';
import { QrScanner } from '~/sync/components/qr-scanner';
import { acceptOffer } from '~/sync/lib/hotspot/peer-connection';
import { pairingProof } from '~/sync/lib/hotspot/pairing-code';
import {
  HANDSHAKE_VERSION,
  decodeOfferPayload,
  encodeAnswerPayload,
  type OfferPayload,
} from '~/sync/lib/hotspot/handshake';
import { receiveTransfer } from '~/sync/lib/hotspot/transfer-protocol';

export interface HotspotReceiveModalProps {
  /** Called with the received payload so the caller can open the import flow. */
  readonly onReceived: (file: File) => void;
  readonly onClose: () => void;
}

type Step = 'idle' | 'answering' | 'receiving';

/**
 * Receiver side of the hotspot transfer (plan §3.1/§3.6, one direction per
 * session — owner decision). Scans the emitter's offer QR, shows its own answer
 * QR, receives the payload and hands the resulting `File` to the existing
 * import flow — wrong-password / corrupt-file / wrong-store handling is
 * inherited unchanged.
 */
export function HotspotReceiveModal({ onReceived, onClose }: HotspotReceiveModalProps) {
  const intl = useIntl();
  const [offer, setOffer] = useState<OfferPayload | null>(null);
  const [answer, setAnswer] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(true);
  const connectionRef = useRef<RTCPeerConnection | null>(null);

  function handleClose() {
    connectionRef.current?.close();
    connectionRef.current = null;
    onClose();
  }

  async function handleOffer(encodedOffer: string) {
    setScanning(false);
    setError('');
    try {
      setOffer(await decodeOfferPayload(encodedOffer));
    } catch {
      setError(intl.formatMessage({ id: 'HOTSPOT.ERROR' }));
      setScanning(true);
    }
  }

  async function handleAccept() {
    if (!offer) return;
    setBusy(true);
    setError('');
    try {
      const proof = await pairingProof(offer.code, offer.salt);
      const accepted = await acceptOffer(offer.sdp);
      connectionRef.current = accepted.connection;
      setAnswer(
        await encodeAnswerPayload({
          v: HANDSHAKE_VERSION,
          type: 'answer',
          sdp: accepted.sdp,
          proof,
        }),
      );
      setStep('answering');

      const channel = await accepted.channel;
      setStep('receiving');
      setProgress(0);
      const result = await receiveTransfer(channel, {
        onProgress: ({ transferred, total }) =>
          setProgress(total === 0 ? 1 : transferred / total),
      });
      if (!result.verified) throw new Error('Digest mismatch');
      onReceived(
        new File([result.bytes], result.metadata.name, { type: 'application/octet-stream' }),
      );
    } catch {
      setStep('idle');
      setError(intl.formatMessage({ id: 'HOTSPOT.ERROR' }));
    } finally {
      setBusy(false);
    }
  }

  const percent = Math.round(progress * 100);

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={intl.formatMessage({ id: 'HOTSPOT.RECEIVE_TITLE' })}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        data-testid="hotspot-receive-modal"
        onClick={(event) => {
          if (event.target === event.currentTarget) handleClose();
        }}
      >
        <div className="w-full max-w-md">
          <Card
            title={
              <div className="flex items-center justify-between">
                <span>{intl.formatMessage({ id: 'HOTSPOT.RECEIVE_TITLE' })}</span>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
                  data-testid="hotspot-receive-close"
                  className="text-text-muted hover:text-text"
                >
                  <CloseIcon />
                </button>
              </div>
            }
          >
            {step === 'idle' && !offer && (
              <div className="space-y-3">
                <p className="text-sm text-text" data-testid="hotspot-scan-prompt">
                  {intl.formatMessage({ id: 'HOTSPOT.SCAN_PROMPT' })}
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="fab" onClick={handleClose}>
                    <CloseIcon />
                    {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setScanning(true)}
                    data-testid="hotspot-scan-offer"
                  >
                    {intl.formatMessage({ id: 'HOTSPOT.SCAN_OFFER' })}
                  </Button>
                </div>
              </div>
            )}

            {step === 'idle' && offer && (
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-xs font-medium text-text-muted">
                    {intl.formatMessage({ id: 'HOTSPOT.PAIRING_CODE' })}
                  </p>
                  <p
                    data-testid="hotspot-offer-code"
                    className="font-mono text-2xl tracking-[0.3em] text-text"
                  >
                    {offer.code}
                  </p>
                </div>

                <div className="rounded border border-border p-3">
                  <p className="text-xs font-medium text-text-muted">
                    {intl.formatMessage({ id: 'HOTSPOT.INCOMING_FILE' })}
                  </p>
                  <p data-testid="hotspot-offer-file" className="text-sm text-text">
                    {offer.file.name} · {formatBytes(offer.file.size)}
                  </p>
                </div>

                {error && <InfoBox variant="danger">{error}</InfoBox>}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="fab" onClick={handleClose}>
                    <CloseIcon />
                    {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy}
                    onClick={handleAccept}
                    data-testid="hotspot-accept"
                  >
                    {intl.formatMessage({ id: 'HOTSPOT.ACCEPT' })}
                  </Button>
                </div>
              </div>
            )}

            {step === 'answering' && (
              <div className="space-y-3">
                <p className="text-sm text-text">
                  {intl.formatMessage({ id: 'HOTSPOT.ANSWER_READY' })}
                </p>
                <QrCode
                  value={answer}
                  label={intl.formatMessage({ id: 'HOTSPOT.RECEIVE_TITLE' })}
                />
                {error && <InfoBox variant="danger">{error}</InfoBox>}
              </div>
            )}

            {step === 'receiving' && (
              <div className="space-y-3">
                <p className="text-sm text-text" data-testid="hotspot-receiving">
                  {intl.formatMessage({ id: 'HOTSPOT.RECEIVING' })}
                </p>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  className="h-2 w-full overflow-hidden rounded bg-border"
                >
                  <div
                    className="h-2 bg-primary transition-all"
                    style={{ width: `${percent}%` }}
                    data-testid="hotspot-receive-progress"
                  />
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {scanning && <QrScanner onDecoded={handleOffer} onClose={() => setScanning(false)} />}
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default HotspotReceiveModal;
