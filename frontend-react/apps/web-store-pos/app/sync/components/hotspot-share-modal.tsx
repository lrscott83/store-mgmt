import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { InfoBox } from '~/shared/components/ui/info-box';
import { CloseIcon, EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';
import { QrCode } from '~/sync/components/qr-code';
import { QrScanner } from '~/sync/components/qr-scanner';
import {
  completeConnection,
  createOffer,
  waitForChannelOpen,
} from '~/sync/lib/hotspot/peer-connection';
import {
  generatePairingCode,
  generatePairingSalt,
  verifyPairingProof,
} from '~/sync/lib/hotspot/pairing-code';
import {
  HANDSHAKE_VERSION,
  decodeAnswerPayload,
  encodeOfferPayload,
} from '~/sync/lib/hotspot/handshake';
import { sendTransfer, type TransferSource } from '~/sync/lib/hotspot/transfer-protocol';

export interface HotspotShareModalProps {
  /** Produces the payload to share once the master password is entered. */
  readonly prepare: (master: string) => Promise<TransferSource>;
  readonly onClose: () => void;
}

type Step = 'password' | 'waiting' | 'sending' | 'done';

interface PendingSession {
  readonly connection: RTCPeerConnection;
  readonly channel: RTCDataChannel;
  readonly source: TransferSource;
  readonly code: string;
  readonly salt: string;
}

class PairingMismatchError extends Error {}

/**
 * Emitter side of the hotspot transfer (plan §3.1/§3.6, one direction per
 * session — owner decision). Shows the offer QR plus the pairing code, then
 * scans the receiver's answer QR and sends the payload with a progress bar.
 * Encoding/decoding lives in `handshake.ts`; this component only drives the
 * state machine and the UI.
 */
export function HotspotShareModal({ prepare, onClose }: HotspotShareModalProps) {
  const intl = useIntl();
  const [step, setStep] = useState<Step>('password');
  const [master, setMaster] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [offer, setOffer] = useState<{ encoded: string; code: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const sessionRef = useRef<PendingSession | null>(null);

  function handleClose() {
    sessionRef.current?.connection.close();
    sessionRef.current = null;
    onClose();
  }

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    if (!master.trim()) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_EMPTY_PASSWORD' }));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const source = await prepare(master);
      const code = generatePairingCode();
      const salt = generatePairingSalt();
      const { connection, channel, sdp } = await createOffer();
      sessionRef.current = { connection, channel, source, code, salt };
      const encoded = await encodeOfferPayload({
        v: HANDSHAKE_VERSION,
        type: 'offer',
        sdp,
        code,
        salt,
        file: { name: source.name, size: source.bytes.length, kind: source.kind },
      });
      setOffer({ encoded, code });
      setStep('waiting');
    } catch {
      setError(intl.formatMessage({ id: 'HOTSPOT.ERROR' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyCode() {
    const code = offer?.code;
    if (!code || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard unavailable: the code stays visible on screen.
    }
  }

  async function handleAnswer(encodedAnswer: string) {
    const session = sessionRef.current;
    setScanning(false);
    if (!session) return;
    setError('');
    setProgress(0);
    setStep('sending');
    try {
      const answer = await decodeAnswerPayload(encodedAnswer);
      const paired = await verifyPairingProof(session.code, session.salt, answer.proof);
      if (!paired) throw new PairingMismatchError();
      await completeConnection(session.connection, answer.sdp);
      await waitForChannelOpen(session.channel);
      await sendTransfer(session.channel, session.source, {
        onProgress: ({ transferred, total }) =>
          setProgress(total === 0 ? 1 : transferred / total),
      });
      setStep('done');
    } catch (err) {
      setStep('waiting');
      setError(
        intl.formatMessage({
          id: err instanceof PairingMismatchError ? 'HOTSPOT.ERROR_PAIRING' : 'HOTSPOT.ERROR',
        }),
      );
    }
  }

  const percent = Math.round(progress * 100);

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={intl.formatMessage({ id: 'HOTSPOT.SHARE_TITLE' })}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        data-testid="hotspot-share-modal"
        onClick={(event) => {
          if (event.target === event.currentTarget) handleClose();
        }}
      >
        <div className="w-full max-w-md">
          <Card
            title={
              <div className="flex items-center justify-between">
                <span>{intl.formatMessage({ id: 'HOTSPOT.SHARE_TITLE' })}</span>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
                  data-testid="hotspot-share-close"
                  className="text-text-muted hover:text-text"
                >
                  <CloseIcon />
                </button>
              </div>
            }
          >
            {step === 'password' && (
              <form onSubmit={handleGenerate} className="space-y-3">
                <div>
                  <label htmlFor="hotspot-master" className="mb-1 block text-sm font-medium text-text">
                    {intl.formatMessage({ id: 'PROVISION.MASTER_PASSWORD_LABEL' })}
                  </label>
                  <div className="relative">
                    <input
                      id="hotspot-master"
                      type={showPassword ? 'text' : 'password'}
                      value={master}
                      onChange={(event) => setMaster(event.target.value)}
                      disabled={busy}
                      className="w-full rounded border border-border px-3 py-2 pr-10 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={intl.formatMessage({
                        id: showPassword ? 'SYNC.HIDE_PASSWORD' : 'SYNC.SHOW_PASSWORD',
                      })}
                      className="absolute inset-y-0 right-0 flex items-center px-2 text-text-muted hover:text-text"
                    >
                      {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {error && <InfoBox variant="danger">{error}</InfoBox>}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="fab" onClick={handleClose}>
                    <CloseIcon />
                    {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
                  </Button>
                  <Button type="submit" variant="primary" disabled={busy} data-testid="hotspot-generate">
                    {intl.formatMessage({ id: 'HOTSPOT.GENERATE' })}
                  </Button>
                </div>
              </form>
            )}

            {step === 'waiting' && (
              <div className="space-y-3">
                <p className="text-sm text-text">
                  {intl.formatMessage({ id: 'HOTSPOT.OFFER_READY' })}
                </p>
                {offer && (
                  <QrCode
                    value={offer.encoded}
                    label={intl.formatMessage({ id: 'HOTSPOT.SHARE_TITLE' })}
                  />
                )}
                <div className="text-center">
                  <p className="text-xs font-medium text-text-muted">
                    {intl.formatMessage({ id: 'HOTSPOT.PAIRING_CODE' })}
                  </p>
                  <p
                    data-testid="hotspot-pairing-code"
                    className="font-mono text-2xl tracking-[0.3em] text-text"
                  >
                    {offer?.code}
                  </p>
                  <Button type="button" variant="outline" onClick={handleCopyCode}>
                    {intl.formatMessage({ id: 'HOTSPOT.COPY_CODE' })}
                  </Button>
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
                    onClick={() => setScanning(true)}
                    data-testid="hotspot-scan-answer"
                  >
                    {intl.formatMessage({ id: 'HOTSPOT.SCAN_ANSWER' })}
                  </Button>
                </div>
              </div>
            )}

            {step === 'sending' && (
              <div className="space-y-3">
                <p className="text-sm text-text" data-testid="hotspot-sending">
                  {intl.formatMessage({ id: 'HOTSPOT.SENDING' })}
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
                    data-testid="hotspot-progress"
                  />
                </div>
              </div>
            )}

            {step === 'done' && (
              <div className="space-y-3">
                <p className="text-sm text-text" data-testid="hotspot-done">
                  {intl.formatMessage({ id: 'HOTSPOT.SENT' })}
                </p>
                <div className="flex justify-end">
                  <Button type="button" variant="primary" onClick={handleClose}>
                    {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {scanning && <QrScanner onDecoded={handleAnswer} onClose={() => setScanning(false)} />}
    </>
  );
}

export default HotspotShareModal;
