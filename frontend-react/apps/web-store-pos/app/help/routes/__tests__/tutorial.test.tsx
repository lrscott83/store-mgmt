import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// ─── auth-store mock ──────────────────────────────────────────────────────────
// getState must be a vi.fn() so we can override it per test via mockReturnValue.

vi.mock('~/shared/lib/stores/auth-store', () => {
  const getState = vi.fn(() => ({ user: { id: 'u1' }, isAuthenticated: true, logout: vi.fn() }));
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1' }, isAuthenticated: true };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: typeof getState }).getState = getState;
  return { useAuthStore };
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// S-HELP-CONTENT-1 — Title renders from i18n key TUTORIAL.TITLE
// ═══════════════════════════════════════════════════════════════════════════════

describe('TutorialPage — S-HELP-CONTENT-1: title renders from TUTORIAL.TITLE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a heading with the TUTORIAL.TITLE value', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tutorial');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-HELP-CONTENT-2 — Accordion contains exactly 4 <details> steps
// ═══════════════════════════════════════════════════════════════════════════════

describe('TutorialPage — S-HELP-CONTENT-2: accordion has exactly 4 steps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders exactly 4 <details> elements', async () => {
    const { TutorialPage } = await import('../tutorial');
    const { container } = render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(4);
  });

  it('each <details> contains a <summary> with step label', async () => {
    const { TutorialPage } = await import('../tutorial');
    const { container } = render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const summaries = container.querySelectorAll('details > summary');
    expect(summaries).toHaveLength(4);
    expect(summaries[0]).toHaveTextContent(/adicionar un producto/i);
    expect(summaries[1]).toHaveTextContent(/adicionar una entrada/i);
    expect(summaries[2]).toHaveTextContent(/adicionar el producto a la venta/i);
    expect(summaries[3]).toHaveTextContent(/registrar la venta/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-HELP-CONTENT-3 — Exactly 6 images with /images/help/ src
// ═══════════════════════════════════════════════════════════════════════════════

describe('TutorialPage — S-HELP-CONTENT-3: 6 images with /images/help/ paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders exactly 6 <img> elements', async () => {
    const { TutorialPage } = await import('../tutorial');
    const { container } = render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(6);
  });

  it('every <img> src starts with /images/help/', async () => {
    const { TutorialPage } = await import('../tutorial');
    const { container } = render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const images = Array.from(container.querySelectorAll('img'));
    expect(images).toHaveLength(6);
    for (const img of images) {
      expect(img.getAttribute('src')).toMatch(/^\/images\/help\//);
    }
  });

  it('renders the exact 6 expected image filenames', async () => {
    const { TutorialPage } = await import('../tutorial');
    const { container } = render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const srcs = Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(srcs).toContain('/images/help/menu.png');
    expect(srcs).toContain('/images/help/add-cat-dialog.png');
    expect(srcs).toContain('/images/help/add-product-btn.png');
    expect(srcs).toContain('/images/help/add-product-dialog.png');
    expect(srcs).toContain('/images/help/add-entry-dialog.png');
    expect(srcs).toContain('/images/help/register.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-HELP-TEST-2 — help/tutorial is a PUBLIC route (route-guard-parity)
// Angular's app-routing.module.ts nests help/tutorial inside ClientLayoutComponent
// with NO canActivate guard — it is reachable without authentication. The route
// is moved out of the authLoader-gated app-layout branch (routes.ts) into a
// public no-auth chrome layout, so TutorialPage must render with NO session.
// ═══════════════════════════════════════════════════════════════════════════════

describe('TutorialPage — S-HELP-TEST-2: public access, no auth required', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders content with no user/session — no redirect, no thrown error', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    const getState = (useAuthStore as unknown as { getState: ReturnType<typeof vi.fn> }).getState;
    getState.mockReturnValueOnce({ user: null, isAuthenticated: false, logout: vi.fn() });

    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tutorial');
  });
});
