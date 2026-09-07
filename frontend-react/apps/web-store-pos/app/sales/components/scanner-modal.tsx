import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { CloseIcon } from '~/shared/components/ui/icons';

interface ScannerModalProps {
  /**
   * Called once per decoded barcode with the quantity to add (the stepper's
   * current value at scan time). The parent owns the full add-to-sale flow
   * (lookup, sellability, inventory gate, cart add) and its own success
   * feedback.
   */
  onScanned: (barcode: string, quantity: number) => void;
  onClose: () => void;
}

/**
 * Camera barcode scanner for the sale/wholesale views. Decodes continuously
 * with `@zxing/browser` (ALREADY a dependency — installed for this feature,
 * never imported elsewhere) and stays OPEN after each scan (POS cadence:
 * scan-scan-scan, then close via the X button or Escape).
 *
 * ALL zxing imports are DYNAMIC, inside the open effect — the library is a
 * lazy chunk that only loads when the scanner actually opens (AGENTS.md
 * heavy-dependency rule; the routes' initial bundles are unchanged).
 *
 * Quantity stepper (2026-09-07 redesign): the manual barcode textbox, its +
 * submit button and the "Listo" button are GONE. In their place sits a
 * compact quantity stepper — the same round −/+ buttons as the shopping cart
 * (cart-shell.tsx) — defaulting to 1, right-aligned and narrow. Each decoded
 * scan adds the product `quantity` times; the stepper resets to 1 after each
 * scan it forwards, so the next scan starts from 1 again.
 *
 * Double-scan guard (2026-09-07 bug: one scan added 2): zxing's own
 * `delayBetweenScanSuccess` (500ms) is not enough on some devices — the
 * decode callback can fire twice for the same frame burst. A local guard
 * drops an identical consecutive barcode within a 900ms window so one
 * physical scan never adds twice.
 */
export function ScannerModal({ onScanned, onClose }: ScannerModalProps) {
  const intl = useIntl();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Latest-callback refs: the camera effect must start ONCE per mount, so the
  // decode callback reads through refs instead of closing over props/state —
  // a new onScanned identity or a changed quantity never restarts the stream.
  const onScannedRef = useRef(onScanned);
  useEffect(() => {
    onScannedRef.current = onScanned;
  }, [onScanned]);
  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'denied' | 'failed'>('idle');
  const [quantity, setQuantity] = useState(1);
  const quantityRef = useRef(quantity);
  useEffect(() => {
    quantityRef.current = quantity;
  }, [quantity]);
  // Double-scan guard state — plain refs (no re-render needed).
  const lastBarcodeRef = useRef<string>('');
  const lastScanAtRef = useRef(0);

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    async function start() {
      try {
        // Dynamic import: @zxing/browser lands in its own lazy chunk, only
        // when the scanner opens.
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
            if (!result) return;
            const barcode = result.getText();
            // Double-scan guard: drop an identical consecutive barcode inside
            // the window — one physical scan must add exactly once.
            const now = Date.now();
            if (barcode === lastBarcodeRef.current && now - lastScanAtRef.current < 900) {
              return;
            }
            lastBarcodeRef.current = barcode;
            lastScanAtRef.current = now;
            const qty = quantityRef.current;
            onScannedRef.current(barcode, qty);
            // Reset the stepper after the forwarded scan: the next scan adds
            // from 1 again (the merchant nudges quantity per-scan, not as a
            // sticky multiplier).
            setQuantity(1);
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
      // Every unmount path (close, Escape, navigation) stops the stream —
      // the camera light must never outlive the modal.
      controls?.stop();
    };
    // Empty deps on purpose: the camera starts once per modal mount and the
    // decode callback reads the refs above, never a stale closure.
  }, []);

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

        {/* Quantity stepper — the same round −/+ buttons as the shopping cart
            (cart-shell.tsx), right-aligned and compact. The value is read at
            scan time; each scan adds the product this many times and the
            stepper resets to 1. */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs font-medium text-text-muted">
            {intl.formatMessage({ id: 'SCANNER.QUANTITY' })}
          </span>
          <div className="flex items-center gap-1" data-testid="scanner-quantity-stepper">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white text-2xl leading-none disabled:opacity-40"
              aria-label={intl.formatMessage({ id: 'SCANNER.DECREASE_QUANTITY' })}
              data-testid="scanner-quantity-decrease"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                setQuantity(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
              }}
              aria-label={intl.formatMessage({ id: 'SCANNER.QUANTITY' })}
              data-testid="scanner-quantity-input"
              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white text-2xl leading-none"
              aria-label={intl.formatMessage({ id: 'SCANNER.INCREASE_QUANTITY' })}
              data-testid="scanner-quantity-increase"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
