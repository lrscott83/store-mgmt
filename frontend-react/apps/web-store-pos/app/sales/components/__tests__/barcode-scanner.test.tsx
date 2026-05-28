import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// --- Cooldown logic unit tests ---
// The cooldown hook is extracted from QuickSaleScanner as a pure testable unit.
// We test the createCooldownController factory directly.

import { createCooldownController } from '../quick-sale-scanner';

describe('createCooldownController — 500ms cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows first decode immediately', () => {
    const ctrl = createCooldownController(500);
    expect(ctrl.isReady()).toBe(true);
  });

  it('blocks decode within cooldown window', () => {
    const ctrl = createCooldownController(500);
    ctrl.markUsed();
    expect(ctrl.isReady()).toBe(false);
  });

  it('allows decode after cooldown elapses', () => {
    const ctrl = createCooldownController(500);
    ctrl.markUsed();
    vi.advanceTimersByTime(501);
    expect(ctrl.isReady()).toBe(true);
  });

  it('blocks decode exactly at cooldown boundary', () => {
    const ctrl = createCooldownController(500);
    ctrl.markUsed();
    vi.advanceTimersByTime(499);
    expect(ctrl.isReady()).toBe(false);
  });

  it('resets correctly after multiple cycles', () => {
    const ctrl = createCooldownController(500);
    ctrl.markUsed();
    vi.advanceTimersByTime(501);
    ctrl.markUsed();
    expect(ctrl.isReady()).toBe(false);
    vi.advanceTimersByTime(501);
    expect(ctrl.isReady()).toBe(true);
  });
});

// --- BarcodeScannerModal smoke render test ---
// @zxing/browser is only imported by BarcodeScannerCore.
// BarcodeScannerModal lazy-imports BarcodeScannerCore — we mock that import.

vi.mock('../barcode-scanner-core', () => ({
  BarcodeScannerCore: ({
    onDecode,
  }: {
    onDecode: (value: string) => void;
    onPermissionDenied: () => void;
  }) => (
    <div data-testid="scanner-core">
      <button onClick={() => onDecode('123456789')}>Decode</button>
    </div>
  ),
}));

// Mock ProductOfflineService for QuickSaleScanner
vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getByBarcode: vi.fn().mockReturnValue(undefined),
  })),
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

vi.mock('~/shared/lib/stores/cart-store', () => ({
  useCartStore: vi.fn(() => ({
    addItem: vi.fn(),
    items: [],
  })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

describe('BarcodeScannerModal — smoke render', () => {
  it('renders without crashing when open', async () => {
    const { BarcodeScannerModal } = await import('../barcode-scanner-modal');
    render(
      <Wrapper>
        <BarcodeScannerModal isOpen={true} onDecode={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    // Await the lazy-loaded scanner core so the Suspense resolution is flushed
    // inside act() (findBy* wraps the update), then assert it rendered.
    expect(await screen.findByTestId('scanner-core')).toBeInTheDocument();
  });

  it('does not render when closed', async () => {
    const { BarcodeScannerModal } = await import('../barcode-scanner-modal');
    render(
      <Wrapper>
        <BarcodeScannerModal isOpen={false} onDecode={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('scanner-modal')).toBeNull();
  });
});
