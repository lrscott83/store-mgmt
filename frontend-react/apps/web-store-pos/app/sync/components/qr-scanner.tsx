import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { CloseIcon } from '~/shared/components/ui/icons';

export interface QrScannerProps {
  readonly onDecoded: (text: string) => void;
  readonly onClose: () => void;
}

/**
 * Camera QR reader for the hotspot handshake. Decodes with `@zxing/browser`
 * (already a dependency; the import is dynamic so it stays in a lazy chunk)
 * and stops at the first successful read — each handshake step consumes
 * exactly one code. Separate from the sale barcode scanner (ScannerModal),
 * which carries a quantity stepper and a scan-scan-scan cadence.
 */
export function QrScanner({ onDecoded, onClose }: QrScannerProps) {
  const intl = useIntl();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDecodedRef = useRef(onDecoded);
  useEffect(() => {
    onDecodedRef.current = onDecoded;
  }, [onDecoded]);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied'>('starting');

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;
    let decoded = false;

    async function start() {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserQRCodeReader();
        const streamControls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (!result || decoded) return;
            decoded = true;
            onDecodedRef.current(result.getText());
          },
        );
        controls = streamControls;
        if (!cancelled) setStatus('scanning');
      } catch {
        // getUserMedia denied/unavailable, or the stream failed mid-flight.
        if (!cancelled) setStatus('denied');
      }
    }

    void start();

    return () => {
      cancelled = true;
      // The camera light must never outlive the overlay.
      controls?.stop();
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={intl.formatMessage({ id: 'HOTSPOT.SCAN_TITLE' })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onKeyDown={handleKeyDown}
      data-testid="qr-scanner"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {intl.formatMessage({ id: 'HOTSPOT.SCAN_TITLE' })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            data-testid="qr-scanner-close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <CloseIcon />
          </button>
        </div>

        {/* muted + playsInline are REQUIRED for iOS Safari autoplay; hidden
            entirely while denied so the modal shows no dead rectangle. */}
        {status !== 'denied' && (
          <div className="mb-3 overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-64 w-full object-cover"
              data-testid="qr-scanner-video"
            />
          </div>
        )}

        {status === 'scanning' && (
          <p className="text-center text-sm text-muted" data-testid="qr-scanner-status">
            {intl.formatMessage({ id: 'HOTSPOT.SCANNING' })}
          </p>
        )}
        {status === 'denied' && (
          <p
            className="rounded bg-red-50 px-3 py-2 text-center text-sm text-red-600"
            data-testid="qr-scanner-denied"
          >
            {intl.formatMessage({ id: 'HOTSPOT.CAMERA_DENIED' })}
          </p>
        )}
      </div>
    </div>
  );
}

export default QrScanner;
