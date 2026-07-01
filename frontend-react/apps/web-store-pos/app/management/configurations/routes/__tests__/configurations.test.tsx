import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// ─── adminFeatureLoader mock ──────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  adminFeatureLoader: () => vi.fn().mockResolvedValue(null),
}));

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

describe('ConfigurationsPage — exports', () => {
  it('exports a named loader function', async () => {
    const mod = await import('../configurations');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports ConfigurationsPage as named export', async () => {
    const mod = await import('../configurations');
    expect(typeof mod.ConfigurationsPage).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARITY — renders placeholder paragraph (1:1 Angular stub)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — parity stub', () => {
  it('renders the placeholder text "configurations works!"', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>
    );
    expect(screen.getByText('configurations works!')).toBeInTheDocument();
  });

  it('renders a <p> element with the placeholder text', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>
    );
    const p = screen.getByText('configurations works!');
    expect(p.tagName.toLowerCase()).toBe('p');
  });
});
