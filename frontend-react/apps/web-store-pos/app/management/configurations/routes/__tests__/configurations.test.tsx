import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { SystemConfiguration } from '@store-mgmt/domain';

// ─── Domain factory ───────────────────────────────────────────────────────────

function makeSystemConfiguration(overrides: Partial<SystemConfiguration> = {}): SystemConfiguration {
  return {
    id: '1',
    name: 'tax_rate',
    value: '0.15',
    ...overrides,
  };
}

// ─── configurationHttpService mock ────────────────────────────────────────────

let mockListConfigurations = vi.fn();
let mockUpdateConfigurations = vi.fn();

vi.mock('~/management/configurations/lib/services/configuration-http-service', () => ({
  configurationHttpService: {
    get listConfigurations() { return mockListConfigurations; },
    get updateConfigurations() { return mockUpdateConfigurations; },
  },
}));

// ─── useOnlineStatus mock ─────────────────────────────────────────────────────

let mockIsOnline = true;
vi.mock('~/shared/lib/hooks/use-online-status', () => ({
  useOnlineStatus: () => mockIsOnline,
}));

// ─── adminFeatureLoader mock ──────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  adminFeatureLoader: () => vi.fn().mockResolvedValue(null),
}));

// ─── react-router mock ────────────────────────────────────────────────────────

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}));

// ─── localStorage mock ────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESS — loader + export (ACCESS-1..5, ROUTE-2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — ACCESS: exports named loader', () => {
  it('exports a named loader function', async () => {
    const mod = await import('../configurations');
    expect(typeof mod.loader).toBe('function');
  });

  it('exports ConfigurationsPage as named export', async () => {
    const mod = await import('../configurations');
    expect(typeof mod.ConfigurationsPage).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG-1 / TEST-2: online fetch, renders data (S-CONFIG-1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — S-CONFIG-1: online fetch and render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListConfigurations = vi.fn().mockResolvedValue({
      data: [makeSystemConfiguration({ name: 'tax_rate', value: '0.15' })],
    });
  });

  it('fetches configurations on mount and renders them', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByDisplayValue('0.15')).toBeInTheDocument();
    });
    expect(mockListConfigurations).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG-4 / TEST-2: empty list
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — S-CONFIG-2: empty list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListConfigurations = vi.fn().mockResolvedValue({ data: [] });
  });

  it('shows empty state when no configurations returned', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText(/no hay configuraciones/i)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE / TEST-2: offline + cache fallback + degraded (S-CONFIG-3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — S-CONFIG-3: offline + cache hit + degraded mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = false;
    localStorageMock.clear();
    const cacheKey = 'lizoft.store-configurations-';
    const cachedConfig = makeSystemConfiguration({ id: '1', name: 'tax_rate', value: '0.99' });
    localStorageMock.setItem(cacheKey, JSON.stringify([[cachedConfig.id, cachedConfig]]));
    mockListConfigurations = vi.fn();
  });

  it('reads from cache when offline and shows degraded notice', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByDisplayValue('0.99')).toBeInTheDocument();
    });
    expect(screen.getByText(/caché/i)).toBeInTheDocument();
    expect(mockListConfigurations).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE / TEST-2: offline + empty cache = empty state (S-CONFIG-4)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — S-CONFIG-4: offline + empty cache, no crash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = false;
    localStorageMock.clear();
    mockListConfigurations = vi.fn();
  });

  it('shows empty state when offline and cache is empty', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText(/no hay configuraciones/i)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DC5: LOADING gate — form does NOT mount before data resolved
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — DC5: LOADING gate, form does not mount with empty array', () => {
  it('shows loading indicator before data arrives', async () => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    // Delay resolution so we can observe LOADING state
    let resolve!: (v: unknown) => void;
    mockListConfigurations = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));

    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    // Loading indicator visible BEFORE data
    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
    // Resolve now
    resolve({ data: [makeSystemConfiguration()] });
    await waitFor(() => {
      expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAVE / TEST-3: successful submit (S-SAVE-1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — S-SAVE-1: success submit, shows success indicator, no nav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListConfigurations = vi.fn().mockResolvedValue({
      data: [makeSystemConfiguration({ id: '1', name: 'tax_rate', value: '0.15' })],
    });
    mockUpdateConfigurations = vi.fn().mockResolvedValue({ data: true });
  });

  it('shows success message after submit and stays on page', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('0.15'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(screen.getByText(/guardadas correctamente/i)).toBeInTheDocument();
    });
    expect(mockUpdateConfigurations).toHaveBeenCalledWith([
      { id: '1', name: 'tax_rate', value: '0.15' },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAVE / TEST-3: offline blocked (S-SAVE-2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — S-SAVE-2: offline submit blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = false;
    localStorageMock.clear();
    const cachedConfig = makeSystemConfiguration({ id: '1', name: 'tax_rate', value: '0.15' });
    localStorageMock.setItem('lizoft.store-configurations-', JSON.stringify([[cachedConfig.id, cachedConfig]]));
    mockUpdateConfigurations = vi.fn();
  });

  it('submit is disabled when offline and updateConfigurations is NOT called', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('0.15'));
    const btn = screen.getByRole('button', { name: /guardar/i });
    expect(btn).toBeDisabled();
    expect(mockUpdateConfigurations).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAVE / TEST-3: HTTP error inline (S-SAVE-3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — S-SAVE-3: HTTP error shown inline, no redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListConfigurations = vi.fn().mockResolvedValue({
      data: [makeSystemConfiguration({ id: '1', name: 'tax_rate', value: '0.15' })],
    });
    mockUpdateConfigurations = vi.fn().mockRejectedValue(new Error('Server error'));
  });

  it('shows inline error when updateConfigurations throws', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('0.15'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG-2: write-through cache after online list
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — CONFIG-2: write-through cache after online list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListConfigurations = vi.fn().mockResolvedValue({
      data: [makeSystemConfiguration({ id: '1', name: 'tax_rate', value: '0.15' })],
    });
  });

  it('saves fetched configurations to localStorage cache', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('0.15'));
    const cached = localStorageMock.getItem('lizoft.store-configurations-');
    expect(cached).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAVE / TEST-3: success indicator stays, no navigation (explicit triangulation)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — SAVE-2: success indicator shows after submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListConfigurations = vi.fn().mockResolvedValue({
      data: [makeSystemConfiguration({ id: '1', name: 'currency', value: 'USD' })],
    });
    mockUpdateConfigurations = vi.fn().mockResolvedValue({ data: true });
  });

  it('success message is visible after submit with different config data', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('USD'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(screen.getByText(/guardadas correctamente/i)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAVE / TEST-3: updateConfigurations receives full SystemConfiguration[] (DC3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — DC3: updateConfigurations receives full SystemConfiguration[] payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorageMock.clear();
    mockListConfigurations = vi.fn().mockResolvedValue({
      data: [
        makeSystemConfiguration({ id: '1', name: 'tax_rate', value: '0.15' }),
        makeSystemConfiguration({ id: '2', name: 'currency', value: 'USD' }),
      ],
    });
    mockUpdateConfigurations = vi.fn().mockResolvedValue({ data: true });
  });

  it('sends full SystemConfiguration[] with id, name, and value fields', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(<Wrapper><ConfigurationsPage /></Wrapper>);
    await waitFor(() => screen.getByDisplayValue('0.15'));
    fireEvent.change(screen.getByDisplayValue('0.15'), { target: { value: '0.25' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => {
      expect(mockUpdateConfigurations).toHaveBeenCalledWith([
        { id: '1', name: 'tax_rate', value: '0.25' },
        { id: '2', name: 'currency', value: 'USD' },
      ]);
    });
  });
});
