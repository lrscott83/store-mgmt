import { lazy, Suspense } from 'react';
import { useIntl } from 'react-intl';

// React.lazy — @zxing/browser is NOT imported here, only in barcode-scanner-core.tsx
const BarcodeScannerCore = lazy(() =>
  import('./barcode-scanner-core').then((m) => ({ default: m.BarcodeScannerCore })),
);

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onDecode: (value: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({ isOpen, onDecode, onClose }: BarcodeScannerModalProps) {
  const intl = useIntl();

  if (!isOpen) return null;

  function handleDecode(value: string) {
    onDecode(value);
    onClose();
  }

  function handlePermissionDenied() {
    // Error is shown inside BarcodeScannerCore; close action remains available
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="scanner-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {intl.formatMessage({ id: 'SCANNER.SCANNING' })}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            ✕
          </button>
        </div>
        <Suspense
          fallback={
            <div className="py-8 text-center text-sm text-gray-500">
              {intl.formatMessage({ id: 'GENERAL.LOADING' })}
            </div>
          }
        >
          <BarcodeScannerCore onDecode={handleDecode} onPermissionDenied={handlePermissionDenied} />
        </Suspense>
      </div>
    </div>
  );
}
