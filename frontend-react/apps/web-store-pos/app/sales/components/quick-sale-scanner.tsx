import { lazy, Suspense, useRef } from 'react';
import { useIntl } from 'react-intl';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';

// React.lazy — @zxing/browser is NOT imported here, only in barcode-scanner-core.tsx
const BarcodeScannerCore = lazy(() =>
  import('./barcode-scanner-core').then((m) => ({ default: m.BarcodeScannerCore })),
);

// --- Cooldown controller (pure, extractable, unit-testable) ---

export interface CooldownController {
  isReady: () => boolean;
  markUsed: () => void;
}

/**
 * Creates a cooldown controller that prevents rapid successive decodes.
 * The controller is a plain object with no React dependencies, making it
 * directly unit-testable with fake timers.
 */
export function createCooldownController(cooldownMs: number): CooldownController {
  let lastUsedAt = 0;

  return {
    isReady() {
      return Date.now() - lastUsedAt >= cooldownMs;
    },
    markUsed() {
      lastUsedAt = Date.now();
    },
  };
}

// --- QuickSaleScanner component ---

interface QuickSaleScannerProps {
  className?: string;
}

export function QuickSaleScanner({ className }: QuickSaleScannerProps) {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const addItem = useCartStore((s) => s.addItem);

  const cooldown = useRef<CooldownController>(createCooldownController(500));
  const serviceRef = useRef<ProductOfflineService>(new ProductOfflineService(storeId));

  function handleDecode(barcode: string) {
    if (!cooldown.current.isReady()) return;
    cooldown.current.markUsed();

    const product = serviceRef.current.getByBarcode(barcode);
    if (product) {
      addItem(product);
    } else {
      // Show a simple console warning — full toast integration deferred to route container
      console.warn(
        intl.formatMessage({ id: 'SCANNER.PRODUCT_NOT_FOUND' }, { barcode }),
      );
    }
  }

  function handlePermissionDenied() {
    console.error(intl.formatMessage({ id: 'SCANNER.CAMERA_PERMISSION_DENIED' }));
  }

  return (
    <div className={className} data-testid="quick-sale-scanner">
      <Suspense
        fallback={
          <div className="py-4 text-center text-sm text-gray-400">
            {intl.formatMessage({ id: 'GENERAL.LOADING' })}
          </div>
        }
      >
        <BarcodeScannerCore onDecode={handleDecode} onPermissionDenied={handlePermissionDenied} />
      </Suspense>
    </div>
  );
}
