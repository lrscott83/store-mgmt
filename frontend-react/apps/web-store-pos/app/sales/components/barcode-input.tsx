import { useState } from 'react';
import { useIntl } from 'react-intl';
import { ScanBarcodeIcon } from '~/shared/components/ui/icons';
import { Button } from '~/shared/components/ui/button';
import { ScannerModal } from './scanner-modal';

interface BarcodeInputProps {
  value: string;
  onChange: (barcode: string) => void;
  inputTestId: string;
  scanTestId: string;
}

// Editable barcode capture field shared by the product modals: a text input with the
// scan-icon button beside it, which opens the existing camera scanner (ScannerModal).
// A captured code fills the input and CLOSES the scanner — this is a capture field, not
// the sale view's scan-scan-scan cadence, which is exactly why onScanned closes here
// while the sale route keeps the modal open. The scan button is type="button" so it can
// never submit the host modal's form; the parent product modal stays mounted underneath
// (both overlays are z-50, the scanner renders later in the DOM so it sits on top).
export function BarcodeInput({ value, onChange, inputTestId, scanTestId }: BarcodeInputProps) {
  const intl = useIntl();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {intl.formatMessage({ id: 'PRODUCTS.FORM.BARCODE' })}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={intl.formatMessage({ id: 'PRODUCTS.FORM.BARCODE' })}
          className="w-full min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
          data-testid={inputTestId}
        />
        <Button
          variant="fab"
          type="button"
          onClick={() => setIsScannerOpen(true)}
          aria-label={intl.formatMessage({ id: 'SCANNER.TITLE' })}
          title={intl.formatMessage({ id: 'SCANNER.TITLE' })}
          data-testid={scanTestId}
        >
          <ScanBarcodeIcon />
        </Button>
      </div>
      {isScannerOpen && (
        <ScannerModal
          onScanned={(barcode) => {
            onChange(barcode);
            setIsScannerOpen(false);
          }}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
    </div>
  );
}
