import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
// presentation-parity-bucket-b WU1 — Tutorial reverts to a SINGLE grouped panel
// (Angular tutorial.component.html: ONE mat-expansion-panel titled literally
// "Pasos para realizar una venta" containing all 4 numbered steps). The prior
// 4-independent-collapsibles structure is removed.
// ═══════════════════════════════════════════════════════════════════════════════

describe('TutorialPage — bucket-b WU1: single grouped panel (no 4 independent panels)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders exactly ONE collapsible toggle, titled "Pasos para realizar una venta"', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Pasos para realizar una venta');
  });

  it('defaults to collapsed', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const [panelButton] = screen.getAllByRole('button');
    expect(panelButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByAltText('Menú principal')).not.toBeInTheDocument();
  });

  it('expanding the single panel reveals all 4 numbered steps', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const [panelButton] = screen.getAllByRole('button');
    fireEvent.click(panelButton);

    expect(panelButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/1\. Adicionar un producto al catálogo\./i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Adicionar una entrada al inventario\./i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Adicionar el producto a la venta actual\./i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Registrar la venta\./i)).toBeInTheDocument();
  });

  it('collapsing the panel again hides the steps', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const [panelButton] = screen.getAllByRole('button');
    fireEvent.click(panelButton);
    expect(screen.getByAltText('Menú principal')).toBeInTheDocument();

    fireEvent.click(panelButton);
    expect(panelButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByAltText('Menú principal')).not.toBeInTheDocument();
  });

  it('renders a chevron on the panel header that rotates when expanded', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const [panelButton] = screen.getAllByRole('button');
    const svgClass = () => panelButton.querySelector('svg')?.getAttribute('class') ?? '';

    expect(panelButton.querySelector('svg')).toBeInTheDocument();
    expect(svgClass()).not.toContain('rotate-180');

    fireEvent.click(panelButton);
    expect(svgClass()).toContain('rotate-180');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-HELP-CONTENT-3 — Exactly 6 images with /images/help/ src (once the panel is expanded)
// ═══════════════════════════════════════════════════════════════════════════════

describe('TutorialPage — S-HELP-CONTENT-3: 6 images with /images/help/ paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function expandPanel() {
    fireEvent.click(screen.getAllByRole('button')[0]);
  }

  it('renders exactly 6 <img> elements once the panel is expanded', async () => {
    const { TutorialPage } = await import('../tutorial');
    const { container } = render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    expandPanel();
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
    expandPanel();
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
    expandPanel();
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
