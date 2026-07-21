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
// S-HELP-CONTENT-2 — Accordion contains exactly 4 steps
//
// Parity fix (collapsible-panel-chevron-parity): the accordion was restructured from
// uncontrolled native <details>/<summary> to a controlled div+button(aria-expanded)+
// conditional-body pattern (mirroring today-stats.tsx's ExpansionPanel) so it can host the
// shared rotating ChevronDownIcon. These assertions were updated to match the new markup —
// the underlying step count/labels are unchanged.
// ═══════════════════════════════════════════════════════════════════════════════

describe('TutorialPage — S-HELP-CONTENT-2: accordion has exactly 4 steps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders exactly 4 step toggle buttons', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('each step toggle button carries its step label', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveTextContent(/adicionar un producto/i);
    expect(buttons[1]).toHaveTextContent(/adicionar una entrada/i);
    expect(buttons[2]).toHaveTextContent(/adicionar el producto a la venta/i);
    expect(buttons[3]).toHaveTextContent(/registrar la venta/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S-HELP-CONTENT-3 — Exactly 6 images with /images/help/ src (once every step is expanded)
//
// Parity fix (collapsible-panel-chevron-parity): step bodies are now conditionally
// rendered (collapsed by default), so images only appear once their step is expanded —
// expand all 4 steps first, matching the new default-collapsed contract.
// ═══════════════════════════════════════════════════════════════════════════════

describe('TutorialPage — S-HELP-CONTENT-3: 6 images with /images/help/ paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function expandAllSteps() {
    screen.getAllByRole('button').forEach((button) => fireEvent.click(button));
  }

  it('renders exactly 6 <img> elements once every step is expanded', async () => {
    const { TutorialPage } = await import('../tutorial');
    const { container } = render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    expandAllSteps();
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
    expandAllSteps();
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
    expandAllSteps();
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
// Collapsible-panel-chevron-parity — controlled toggle + chevron (new coverage)
// ═══════════════════════════════════════════════════════════════════════════════

describe('TutorialPage — controlled step toggle + chevron (collapsible-panel-chevron-parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults every step to collapsed (body not rendered)', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    // Step 1's body content (a paragraph unique to it) must not be in the document yet.
    expect(screen.queryByAltText('Menú principal')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('clicking a step header opens only that step, leaving siblings collapsed', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);

    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByAltText('Menú principal')).toBeInTheDocument();
    // Step 2 (Adicionar una entrada) stays collapsed — its body must not appear.
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByAltText('Diálogo agregar entrada')).not.toBeInTheDocument();
  });

  it('clicking an open step header closes it again', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(screen.getByAltText('Menú principal')).toBeInTheDocument();

    fireEvent.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByAltText('Menú principal')).not.toBeInTheDocument();
  });

  it('renders a chevron on each step header that rotates iff that step is expanded', async () => {
    const { TutorialPage } = await import('../tutorial');
    render(
      <Wrapper>
        <TutorialPage />
      </Wrapper>,
    );
    const buttons = screen.getAllByRole('button');
    const svgClass = (btn: HTMLElement) => btn.querySelector('svg')?.getAttribute('class') ?? '';

    expect(buttons[0].querySelector('svg')).toBeInTheDocument();
    expect(svgClass(buttons[0])).not.toContain('rotate-180');

    fireEvent.click(buttons[0]);
    expect(svgClass(buttons[0])).toContain('rotate-180');
    // Sibling step's chevron is unaffected.
    expect(svgClass(buttons[1])).not.toContain('rotate-180');
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
