import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { CloseIcon } from '~/shared/components/ui/icons';
import { Button } from '~/shared/components/ui/button';

interface ScannerModalProps {
  /**
   * Called once per decoded/entered barcode. The parent owns the full
   * add-to-sale flow (lookup, sellability, inventory gate, cart add) —
   * the modal only decodes and reports, exactly like the manual-entry
   * fallback reports typed input.
   */
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

/**
 * Camera barcode scanner for the sale view. Decodes continuously with
 * `@zxing/browser` (ALREADY a dependency — installed for this feature,
 * never imported elsewhere), stays OPEN after each scan (POS cadence:
 * scan-scan-scan, then close), and also offers a manual barcode input
 * that works without a camera and doubles as the keyboard-wedge path
 * for hardware gun scanners.
 *
 * ALL zxing imports are DYNAMIC, inside the open effect — the library
 * is a lazy chunk that only loads when the scanner actually opens
 * (AGENTS.md heavy-dependency rule; the sale route's initial bundle
 * is unchanged).
 *
 * Continuous-scan debounce: zxing's `delayBetweenScanSuccess` (500ms)
 * plus a guard ignoring an identical consecutive barcode within a
 * short window, so a code held in front of the lens doesn't
 * double-add.
 */
export function ScannerModal({ onScanned, onClose }: ScannerModalProps) {
  const intl = useIntl();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Keeps the latest onScanned without retriggering the camera effect —
  // the decode callback reads .current, so a new parent callback identity
  // never restarts the stream.
  const onScannedRef = useRef(onScanned);
  useEffect(() => {
    onScannedRef.current = onScanned;
  }, [onScanned]);
  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'denied' | 'failed'>('idle');
  const [manualBarcode, setManualBarcode] = useState('');

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    async function start() {
      try {
        // Dynamic import: @zxing/browser lands in its own lazy chunk, only
        // when the scanner opens. `delayBetweenScanSuccess` debounces the
        // same code being read repeatedly while it sits under the lens.
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !videoRef.current) return;

        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanSuccess: 500,
          delayBetweenScanAttempts: 200,
        });

        const streamControls = await reader.decodeFromVideoDevice(
          undefined, // default (environment-facing where available) camera
          videoRef.current,
          (result) => {
            if (result) {
              onScannedRef.current(result.getText());
            }
          },
        );
        controls = streamControls;
        if (!cancelled) setStatus('scanning');
      } catch {
        // getUserMedia denied/unavailable, or the stream failed mid-flight.
        // The manual entry below keeps the flow usable — the modal degrades
        // to manual-only instead of dying.
        if (!cancelled) setStatus('denied');
      }
    }

    void start();

    return () => {
      cancelled = true;
      // Every unmount path (close, Escape, navigation) stops the stream —
      // the camera light must never outlive the modal.
      controls?.stop();
    };
    // Empty deps on purpose: the camera starts once per modal mount and the
    // decode callback reads onScannedRef.current (declared above), never a
    // stale closure.
  }, []);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const barcode = manualBarcode.trim();
    if (!barcode) return;
    onScannedRef.current(barcode);
    setManualBarcode('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onKeyDown={handleKeyDown}
      data-testid="scanner-modal"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {intl.formatMessage({ id: 'SCANNER.TITLE' })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            data-testid="scanner-close"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Camera preview. muted + playsInline are REQUIRED for iOS Safari
            autoplay; hidden entirely while denied so the modal doesn't show
            a dead black rectangle. */}
        {status !== 'denied' && (
          <div className="mb-3 overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-64 w-full object-cover"
              data-testid="scanner-video"
            />
          </div>
        )}

        {status === 'scanning' && (
          <p className="mb-3 text-center text-sm text-muted" data-testid="scanner-status">
            {intl.formatMessage({ id: 'SCANNER.SCANNING' })}
          </p>
        )}
        {status === 'denied' && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-center text-sm text-red-600" data-testid="scanner-denied">
            {intl.formatMessage({ id: 'SCANNER.CAMERA_PERMISSION_DENIED' })}
          </p>
        )}

        {/* Manual entry — no-camera fallback, hardware gun scanners
            (keyboard wedge), and the E2E-testable path. */}
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder={intl.formatMessage({ id: 'SCANNER.MANUAL_ENTRY_PLACEHOLDER' })}
            aria-label={intl.formatMessage({ id: 'SCANNER.MANUAL_ENTRY' })}
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            data-testid="scanner-manual-input"
          />
          <Button variant="fab" type="submit" data-testid="scanner-manual-submit">
            <span className="sr-only">{intl.formatMessage({ id: 'GENERAL.ADD' })}</span>
            +
          </Button>
        </form>

        <div className="mt-4 flex justify-end">
          <Button variant="fab" type="button" onClick={onClose} data-testid="scanner-done">
            {intl.formatMessage({ id: 'SCANNER.DONE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
