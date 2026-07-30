import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// ─── superAdminLoader mock ────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  superAdminLoader: vi.fn().mockResolvedValue(null),
}));

// ─── featureHttpService mock ──────────────────────────────────────────────────

vi.mock('~/admin/features/lib/services/feature-http-service', () => ({
  featureHttpService: {
    activateFeatures: vi.fn(),
  },
}));

// ─── toast mock (toast-notifications-parity #5/#6/#7) ───────────────────────────

vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: vi.fn(),
  showToastError: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESS — exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('FeaturesPage — exports', () => {
  it('exports a named loader function', async () => {
    const mod = await import('../features');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports FeaturesPage as named export', async () => {
    const mod = await import('../features');
    expect(typeof mod.FeaturesPage).toBe('function');
  });

  it('exports FeaturesPage as default export', async () => {
    const mod = await import('../features');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARITY — render: title and activate button
// ═══════════════════════════════════════════════════════════════════════════════

describe('FeaturesPage — render', () => {
  it('renders the page title from FEATURES.TITLE', async () => {
    const { FeaturesPage } = await import('../features');
    render(
      <Wrapper>
        <FeaturesPage />
      </Wrapper>
    );
    expect(screen.getByText(esMessages['FEATURES.TITLE'])).toBeInTheDocument();
  });

  it('renders the activate button from FEATURES.ACTIVATE_FEATURES', async () => {
    const { FeaturesPage } = await import('../features');
    render(
      <Wrapper>
        <FeaturesPage />
      </Wrapper>
    );
    expect(
      screen.getByRole('button', { name: esMessages['FEATURES.ACTIVATE_FEATURES'] })
    ).toBeInTheDocument();
  });

  it('renders the page content inside the shared Card shell', async () => {
    const { FeaturesPage } = await import('../features');
    const { container } = render(
      <Wrapper>
        <FeaturesPage />
      </Wrapper>
    );
    expect(container.querySelector('[data-slot="card"]')).toBeTruthy();
  });

  it('renders the activate action as a FAB carrying an icon', async () => {
    const { FeaturesPage } = await import('../features');
    render(
      <Wrapper>
        <FeaturesPage />
      </Wrapper>
    );
    const button = screen.getByRole('button', {
      name: esMessages['FEATURES.ACTIVATE_FEATURES'],
    });
    expect(button.querySelector('svg')).toBeTruthy();
  });

  it('uses the EditIcon (pencil), not a gear/SettingsIcon (Angular mat-icon "edit")', async () => {
    const { FeaturesPage } = await import('../features');
    render(
      <Wrapper>
        <FeaturesPage />
      </Wrapper>
    );
    const button = screen.getByRole('button', {
      name: esMessages['FEATURES.ACTIVATE_FEATURES'],
    });
    // EditIcon's distinctive pencil path (from ui/icons.tsx) — SettingsIcon's gear path is
    // a completely different `d` value, so this proves the icon actually swapped.
    const path = button.querySelector('svg path');
    expect(path?.getAttribute('d')).toContain('M16.862 4.487l1.687-1.688');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-4 — button click calls activateFeatures
// ═══════════════════════════════════════════════════════════════════════════════

describe('FeaturesPage — button click', () => {
  it('calls featureHttpService.activateFeatures when button is clicked', async () => {
    const { featureHttpService } = await import(
      '~/admin/features/lib/services/feature-http-service'
    );
    vi.mocked(featureHttpService.activateFeatures).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { FeaturesPage } = await import('../features');
    render(
      <Wrapper>
        <FeaturesPage />
      </Wrapper>
    );

    const button = screen.getByRole('button', {
      name: esMessages['FEATURES.ACTIVATE_FEATURES'],
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(featureHttpService.activateFeatures).toHaveBeenCalledTimes(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-5 — succeeded true → inline success
// ═══════════════════════════════════════════════════════════════════════════════

describe('FeaturesPage — success state', () => {
  it('calls showToastSuccess with FEATURES.FEATURES_ACTIVATED + "Éxito" title when succeeded is true (no static <p>)', async () => {
    const { featureHttpService } = await import(
      '~/admin/features/lib/services/feature-http-service'
    );
    const { showToastSuccess } = await import('~/shared/lib/toast');
    vi.mocked(featureHttpService.activateFeatures).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { FeaturesPage } = await import('../features');
    render(
      <Wrapper>
        <FeaturesPage />
      </Wrapper>
    );

    fireEvent.click(
      screen.getByRole('button', { name: esMessages['FEATURES.ACTIVATE_FEATURES'] })
    );

    await waitFor(() => {
      expect(showToastSuccess).toHaveBeenCalledWith(
        esMessages['FEATURES.FEATURES_ACTIVATED'],
        esMessages['GENERAL.RESPONSE.SUCCESS_TITLE'],
      );
    });
    // Angular's success feedback is a toastr, not a static persisted <p> — proves the
    // old non-dismissing text node is gone.
    expect(
      screen.queryByText(esMessages['FEATURES.FEATURES_ACTIVATED'])
    ).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-6 — succeeded false → inline error
// ═══════════════════════════════════════════════════════════════════════════════

describe('FeaturesPage — error state (succeeded false)', () => {
  it('calls showToastError with FEATURES.UNEXPECTED_ERROR + "Error" title when succeeded is false (no static <p>)', async () => {
    const { featureHttpService } = await import(
      '~/admin/features/lib/services/feature-http-service'
    );
    const { showToastError } = await import('~/shared/lib/toast');
    vi.mocked(featureHttpService.activateFeatures).mockResolvedValue({
      succeeded: false,
      data: false,
      message: 'error',
      actionCode: 0,
      errors: [],
    });

    const { FeaturesPage } = await import('../features');
    render(
      <Wrapper>
        <FeaturesPage />
      </Wrapper>
    );

    fireEvent.click(
      screen.getByRole('button', { name: esMessages['FEATURES.ACTIVATE_FEATURES'] })
    );

    await waitFor(() => {
      expect(showToastError).toHaveBeenCalledWith(
        esMessages['FEATURES.UNEXPECTED_ERROR'],
        esMessages['GENERAL.RESPONSE.ERROR_TITLE'],
      );
    });
    expect(
      screen.queryByText(esMessages['FEATURES.UNEXPECTED_ERROR'])
    ).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-7 — double-submit guard: second click while in-flight must be ignored
// ═══════════════════════════════════════════════════════════════════════════════

describe('FeaturesPage — double-submit guard', () => {
  it('ignores a second click while activateFeatures is already in-flight', async () => {
    const { featureHttpService } = await import(
      '~/admin/features/lib/services/feature-http-service'
    );

    let resolveFirst!: (v: { succeeded: boolean; data: boolean; message: string; actionCode: number; errors: unknown[] }) => void;
    const firstCall = new Promise<{ succeeded: boolean; data: boolean; message: string; actionCode: number; errors: unknown[] }>(
      (resolve) => { resolveFirst = resolve; }
    );

    vi.mocked(featureHttpService.activateFeatures).mockReturnValueOnce(
      firstCall as ReturnType<typeof featureHttpService.activateFeatures>,
    );
    const { showToastSuccess } = await import('~/shared/lib/toast');

    const { FeaturesPage } = await import('../features');
    render(
      <Wrapper>
        <FeaturesPage />
      </Wrapper>
    );

    const button = screen.getByRole('button', {
      name: esMessages['FEATURES.ACTIVATE_FEATURES'],
    });

    // First click — initiates the in-flight request
    fireEvent.click(button);

    // Second click while first is still pending — must be ignored
    fireEvent.click(button);

    // Now resolve the first call
    resolveFirst({ succeeded: true, data: true, message: '', actionCode: 0, errors: [] });

    await waitFor(() => {
      expect(showToastSuccess).toHaveBeenCalledWith(
        esMessages['FEATURES.FEATURES_ACTIVATED'],
        esMessages['GENERAL.RESPONSE.SUCCESS_TITLE'],
      );
    });

    // activateFeatures must have been called exactly once
    expect(featureHttpService.activateFeatures).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-6 — HTTP throws → inline error
// ═══════════════════════════════════════════════════════════════════════════════

describe('FeaturesPage — error state (HTTP error)', () => {
  it('calls showToastError with FEATURES.UNEXPECTED_ERROR + "Error" title when activateFeatures throws', async () => {
    const { featureHttpService } = await import(
      '~/admin/features/lib/services/feature-http-service'
    );
    const { showToastError } = await import('~/shared/lib/toast');
    vi.mocked(featureHttpService.activateFeatures).mockRejectedValue(
      new Error('Network error')
    );

    const { FeaturesPage } = await import('../features');
    render(
      <Wrapper>
        <FeaturesPage />
      </Wrapper>
    );

    fireEvent.click(
      screen.getByRole('button', { name: esMessages['FEATURES.ACTIVATE_FEATURES'] })
    );

    await waitFor(() => {
      expect(showToastError).toHaveBeenCalledWith(
        esMessages['FEATURES.UNEXPECTED_ERROR'],
        esMessages['GENERAL.RESPONSE.ERROR_TITLE'],
      );
    });
  });
});
