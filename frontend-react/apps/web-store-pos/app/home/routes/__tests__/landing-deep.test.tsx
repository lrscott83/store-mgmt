import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
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

  describe('Hero section', () => {
    it('renders the hero heading, brand and "Ver características" anchor', () => {
      renderLanding();
      expect(screen.getByRole('heading', { name: /vende más/i })).toBeInTheDocument();
      expect(screen.getByText('VendeDTo')).toBeInTheDocument();
      const seeFeatures = screen.getByRole('link', { name: /ver características/i });
      expect(seeFeatures).toHaveAttribute('href', '#caracteristicas');
    });

    it('renders the hero on the app background (no full-bleed gradient) and keeps the primary CTA', () => {
      renderLanding();
      const hero = document.querySelector('#hero');
      // Hero inherits the app's standard light background from the page root,
      // matching every other view — no bespoke brand-gradient background.
      expect(hero).not.toHaveClass('bg-gradient-to-br');
      expect(hero).not.toHaveClass('from-primary');

      const heroCta = within(hero as HTMLElement).getByRole('link', { name: /^comenzar$/i });
      expect(heroCta).toHaveClass('bg-primary');
    });
  });

  describe('Features grid + scroll-reveal', () => {
    it('renders all 9 FEATURES titles, each inside a shared Card', () => {
      renderLanding();
      const titles = [
        'Seguridad total',
        'Funciona sin Internet',
        'Registro instantáneo',
        'Cuadre de caja rápido',
        'Inventario en tiempo real',
        'Reportes claros',
        'Facturación integrada',
        'Panel de decisiones',
        'Sincronización flexible',
      ];
      for (const title of titles) {
        const heading = screen.getByText(title);
        expect(heading).toBeInTheDocument();
        expect(heading.closest('[data-slot="card"]')).not.toBeNull();
      }
    });

    it('renders the features grid with responsive grid classes', () => {
      renderLanding();
      const grids = Array.from(document.querySelectorAll('#caracteristicas .grid'));
      const featuresGrid = grids.find((el) => el.className.includes('lg:grid-cols-3'));
      expect(featuresGrid).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3');
    });

    it('reveals a feature wrapper (opacity-0 → opacity-100) when the observer fires isIntersecting', () => {
      renderLanding();
      const firstWrapper = screen.getByText('Seguridad total').closest('[data-slot="card"]')?.parentElement;
      expect(firstWrapper).toHaveClass('opacity-0');

      const observer = observerInstances[0];
      const target = observer.observedElements[0];
      const entry = { target, isIntersecting: true } as IntersectionObserverEntry;
      act(() => {
        observer.callback([entry], observer);
      });

      expect(firstWrapper).toHaveClass('opacity-100');
    });
  });

  describe('How-it-works + CTA', () => {
    it('renders all 3 STEPS titles inside a shared Card, laid out in a 3-col grid', () => {
      renderLanding();
      const titles = ['Regístrate', 'Configura tu punto', 'Empieza a vender'];
      for (const title of titles) {
        const heading = screen.getByText(title);
        expect(heading).toBeInTheDocument();
        expect(heading.closest('[data-slot="card"]')).not.toBeNull();
      }

      const grid = document.querySelector('#como-funciona .grid');
      expect(grid).toHaveClass('md:grid-cols-3');
    });

    it('renders the "Crear cuenta gratis" CTA as a Link to /register styled with ctaPrimary tokens', () => {
      renderLanding();
      const cta = screen.getByRole('link', { name: /crear cuenta gratis/i });
      expect(cta).toHaveAttribute('href', '/register');
      expect(cta).toHaveClass('bg-primary');
    });
  });

  describe('Footer + hex-color regression guard', () => {
    it('renders the footer copyright text', () => {
      renderLanding();
      expect(screen.getByText(/© 2026 vendedto/i)).toBeInTheDocument();
    });

    it('has no raw hex color in any inline `style` attribute, anywhere in the rendered tree', () => {
      const { container } = renderLanding();
      const hexPattern = /#[0-9a-f]{3,8}\b/i;
      const elementsWithStyle = container.querySelectorAll('[style]');
      for (const el of Array.from(elementsWithStyle)) {
        const styleAttr = el.getAttribute('style') ?? '';
        expect(hexPattern.test(styleAttr)).toBe(false);
      }
    });
  });

  describe('Full regression — all sections present', () => {
    it('renders the hero, features, how-it-works, CTA and footer sections', () => {
      const { container } = renderLanding();
      expect(container.querySelector('#hero')).toBeInTheDocument();
      expect(container.querySelector('#caracteristicas')).toBeInTheDocument();
      expect(container.querySelector('#como-funciona')).toBeInTheDocument();
      expect(container.querySelector('#registro')).toBeInTheDocument();
      expect(container.querySelector('footer')).toBeInTheDocument();
    });

    it('carries a token-derived accent class on at least one non-CTA element (guardrail)', () => {
      renderLanding();
      const brand = screen.getByText('VendeDTo');
      expect(brand).toHaveClass('text-accent');
    });
  });
});
