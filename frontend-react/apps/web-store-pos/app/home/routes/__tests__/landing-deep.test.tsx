import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LandingDeep from '../landing-deep';

/**
 * `IntersectionObserver` is not implemented in jsdom and is used only by this
 * route (feature-card scroll reveal). Stub it globally, capturing the
 * callback per instance so tests can fire it manually to simulate scroll.
 */
class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  callback: IntersectionObserverCallback;
  observedElements: Element[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(element: Element) {
    this.observedElements.push(element);
  }

  unobserve(element: Element) {
    this.observedElements = this.observedElements.filter((el) => el !== element);
  }

  disconnect() {
    this.observedElements = [];
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

let observerInstances: IntersectionObserverStub[] = [];

function setStandalone(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

function setServiceWorkerSupported(supported: boolean) {
  if (supported) {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
  } else if ('serviceWorker' in navigator) {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  }
}

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingDeep />
    </MemoryRouter>,
  );
}

describe('LandingDeep — public landing route', () => {
  beforeEach(() => {
    observerInstances = [];
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = vi
      .fn()
      .mockImplementation((callback: IntersectionObserverCallback) => {
        const instance = new IntersectionObserverStub(callback);
        observerInstances.push(instance);
        return instance;
      });
    setServiceWorkerSupported(true);
    setStandalone(false);
  });

  afterEach(() => {
    setServiceWorkerSupported(false);
    vi.restoreAllMocks();
  });

  describe('Hard constraint — public route, no auth guard', () => {
    it('exports a default function and no clientLoader', async () => {
      const mod = await import('../landing-deep');
      expect(typeof mod.default).toBe('function');
      expect((mod as Record<string, unknown>).clientLoader).toBeUndefined();
    });

    it('keeps the `/` index route pointing at landing-deep.tsx with no loader wrapper', async () => {
      const routes = (await import('../../../routes')).default;
      const indexRoute = routes.find((r) => 'index' in r && r.index === true) as
        | { file: string; index: true }
        | undefined;
      expect(indexRoute).toBeDefined();
      expect(indexRoute?.file).toBe('home/routes/landing-deep.tsx');
    });
  });

  describe('Nav section', () => {
    it('shows desktop nav links at baseline render', () => {
      renderLanding();
      expect(screen.getByRole('link', { name: /^características$/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /^cómo funciona$/i })).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /comenzar/i }).length).toBeGreaterThan(0);
    });

    it('toggles the mobile dropdown open and closed', () => {
      renderLanding();
      expect(screen.queryByText(/iniciar sesión/i)).not.toBeInTheDocument();

      const toggler = screen.getByRole('button', { name: /menu/i });
      fireEvent.click(toggler);
      expect(screen.getByText(/iniciar sesión/i)).toBeInTheDocument();

      fireEvent.click(toggler);
      expect(screen.queryByText(/iniciar sesión/i)).not.toBeInTheDocument();
    });

    it('hides the desktop "Entrar" link when the PWA is installable (showLoginButton=false)', () => {
      // Installable: swSupported && !isStandalone (default mocks already satisfy this).
      renderLanding();
      expect(screen.queryByRole('link', { name: /^entrar$/i })).not.toBeInTheDocument();
    });

    it('shows the desktop "Entrar" link when the PWA is NOT installable', () => {
      setServiceWorkerSupported(false);
      renderLanding();
      expect(screen.getByRole('link', { name: /^entrar$/i })).toBeInTheDocument();
    });
  });
});
