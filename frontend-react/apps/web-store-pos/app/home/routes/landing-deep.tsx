import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { CloseIcon } from '~/shared/components/ui/icons';
import './landing-deep.css';

// Mirrors Button's primary variant (ui/button.tsx VARIANT_CLASSES.primary) for
// anchor/Link CTAs: a real <button> can't be nested inside <a>/<Link>, so route
// and in-page-anchor CTAs apply the same token utilities inline instead.
const ctaPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 shadow-card ' +
  'bg-primary text-white text-sm font-medium transition-colors hover:bg-primary-hover';

// Mirrors Button's outline variant for anchor/Link CTAs on the app's light
// background: border and text use the standard tokens, matching the other views.
const ctaOutline =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 border ' +
  'border-border text-text text-sm font-medium transition-colors hover:border-primary hover:text-primary';

const FEATURES: Array<{ title: string; desc: string; icon: React.ReactNode }> = [
  {
    title: 'Seguridad total',
    desc: 'Tus datos se guardan en el teléfono. Nadie más accede a ellos, nunca.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M14 2L4 6v8c0 5.5 4.3 10.7 10 12 5.7-1.3 10-6.5 10-12V6L14 2z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <rect x="9" y="12" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 12v-2a2 2 0 0 1 4 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="14" cy="16" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'Funciona sin Internet',
    desc: 'Todas las funciones disponibles sin conexión. Solo la autenticación requiere Internet.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 20c4.4 0 8-2.7 8-6s-3.6-6-8-6-8 2.7-8 6 3.6 6 8 6z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 14c1.7-1 3.4-1.5 4-1.5s2.3.5 4 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4 20V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M24 20V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="6" y1="6" x2="22" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Registro instantáneo',
    desc: 'Anota cada venta en segundos. Sin papel, sin cálculos manuales.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M15.5 3L8 15h7l-1.5 10L22 13h-7l1-7L15.5 3z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx="15.5" cy="13" r="2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
  },
  {
    title: 'Cuadre de caja rápido',
    desc: 'Cierra tu día en minutos con totales y diferencias calculadas automáticamente.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="8" width="22" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.5" />
        <line x1="3" y1="14" x2="25" y2="14" stroke="currentColor" strokeWidth="1.5" />
        <rect x="7" y="17" width="4" height="3" rx="0.5" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="0.75" />
        <rect x="13" y="17" width="4" height="3" rx="0.5" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="0.75" />
        <path d="M19 17v3M22 18.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Inventario en tiempo real',
    desc: 'Consulta cuánto tienes y cuánto vale tu stock al instante.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 8l10-4 10 4v4l-10 4-10-4V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M4 12l10 4 10-4M14 16v8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M14 20l-10-4M14 20l10-4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    title: 'Reportes claros',
    desc: 'Ganancias del día, productos más vendidos y tendencias — con un clic.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="5" y1="22" x2="5" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="10" y1="22" x2="10" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="15" y1="22" x2="15" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="20" y1="22" x2="20" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="25" y1="22" x2="25" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="3" y1="22" x2="27" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M15 5l4-2M19 3l-4 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Facturación integrada',
    desc: 'Emite facturas PDF al registrar cada venta, sin pasos extra.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="3" width="18" height="22" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <line x1="9" y1="9" x2="19" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="9" y1="13" x2="19" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="9" y1="17" x2="15" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="20" cy="21" r="6" className="fill-[var(--color-surface)]" stroke="currentColor" strokeWidth="1.5" />
        <path d="M18 21l1.5 1.5L22 19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Panel de decisiones',
    desc: 'Visualiza datos clave para planificar mejor y vender más.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="22" height="22" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9h22" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 9V20a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9" stroke="currentColor" strokeWidth="1.25" />
        <path d="M14 9v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9" stroke="currentColor" strokeWidth="1.25" />
        <path d="M20 9v4a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9" stroke="currentColor" strokeWidth="1.25" />
        <line x1="6" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5" />
      </svg>
    ),
  },
  {
    title: 'Sincronización flexible',
    desc: 'Sube y descarga tus datos cuando lo necesites, sin perder información.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M5 12a3 3 0 0 1 3-3h4l3-3h5a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3h-1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M23 12v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 10v4a3 3 0 0 0 3 3h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="5" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
      </svg>
    ),
  },
];

const STEPS = [
  { number: '01', title: 'Regístrate', desc: 'Crea tu cuenta en segundos. Solo necesitas un teléfono y una contraseña.' },
  { number: '02', title: 'Configura tu punto', desc: 'Agrega productos al catálogo y registra tu inventario inicial.' },
  { number: '03', title: 'Empieza a vender', desc: 'Registra cada venta, consulta tu cuadre y reportes. Así de fácil.' },
];

export default function LandingDeep() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [revealedFeatures, setRevealedFeatures] = useState<Set<number>>(new Set());
  const featureCardRefs = useRef<Array<HTMLDivElement | null>>([]);

  const showLoginButton = !canInstall;

  function closeMenu() {
    setTimeout(() => {
      setMenuOpen(false);
    }, 10);
  }

  // Scroll state for the fixed navbar background
  useEffect(() => {
    function onScroll() {
      setIsScrolled(window.scrollY > 40);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // PWA installability check
  useEffect(() => {
    function checkPWAInstallability() {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      const swSupported = 'serviceWorker' in navigator;

      if (swSupported && !isStandalone) {
        setCanInstall(true);
      } else {
        setCanInstall(false);
      }
    }

    checkPWAInstallability();

    function onBeforeInstallPrompt() {
      setCanInstall(true);
    }
    function onAppInstalled() {
      setCanInstall(false);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // Reveal feature cards on scroll into view. Refactored from
  // `entry.target.classList.add('visible')` to React state: the reveal CSS
  // transition rules were deleted with the bespoke stylesheet, and `Card`
  // doesn't forward a ref, so the outer wrapper `div` (which holds the ref)
  // now tracks revealed indices and applies conditional Tailwind classes.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = featureCardRefs.current.indexOf(entry.target as HTMLDivElement);
          if (index === -1) return;
          setRevealedFeatures((prev) => {
            if (prev.has(index)) return prev;
            const next = new Set(prev);
            next.add(index);
            return next;
          });
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );

    featureCardRefs.current.forEach((card) => {
      if (card) observer.observe(card);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-text">
      {/* NAVBAR */}
      <nav
        className={`fixed inset-x-0 top-0 z-50 py-5 transition-colors${
          isScrolled ? ' bg-surface/85 backdrop-blur border-b border-border' : ''
        }`}
      >
        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="flex items-center justify-between">
            <a className="text-2xl font-bold text-accent" href="#hero">
              VendeDTo
            </a>

            <div className="hidden items-center gap-6 lg:flex">
              <a className="text-sm font-medium uppercase tracking-wide text-text-muted hover:text-accent" href="#caracteristicas">
                Características
              </a>
              <a className="text-sm font-medium uppercase tracking-wide text-text-muted hover:text-accent" href="#como-funciona">
                Cómo funciona
              </a>
              {showLoginButton && (
                <Link className="text-sm font-medium uppercase tracking-wide text-text-muted hover:text-accent" to="/login">
                  Entrar
                </Link>
              )}
              <a className={ctaPrimary} href="#registro">
                Comenzar
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>

            <div className="relative lg:hidden">
              <Button variant="outline" className="px-2 py-2" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
                {menuOpen ? (
                  <CloseIcon className="h-5 w-5" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
              </Button>

              {menuOpen && (
                <div className="absolute right-0 top-full min-w-[200px] rounded-md border border-border border-t-2 border-t-accent bg-surface py-4 shadow-card">
                  <a className="block px-6 py-2 text-sm text-text hover:bg-accent/5 hover:text-accent" href="#hero" onClick={closeMenu}>
                    Inicio
                  </a>
                  <a
                    className="block px-6 py-2 text-sm text-text hover:bg-accent/5 hover:text-accent"
                    href="#caracteristicas"
                    onClick={closeMenu}
                  >
                    Características
                  </a>
                  <a
                    className="block px-6 py-2 text-sm text-text hover:bg-accent/5 hover:text-accent"
                    href="#como-funciona"
                    onClick={closeMenu}
                  >
                    Cómo funciona
                  </a>
                  <Link
                    className="block px-6 py-2 text-sm text-text hover:bg-accent/5 hover:text-accent"
                    to="/login"
                    onClick={closeMenu}
                  >
                    Iniciar sesión
                  </Link>
                  <a
                    className="block px-6 py-2 text-sm font-semibold text-accent hover:bg-accent/5"
                    href="#registro"
                    onClick={closeMenu}
                  >
                    Comenzar
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero" className="relative pt-32 pb-20">
        <div className="relative mx-auto w-full max-w-6xl px-4">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
            {/* Left: Copy */}
            <div>
              <p className="landing-animate-in mb-6 text-xs font-medium tracking-[0.2em] text-accent uppercase [animation-delay:100ms]">
                Punto de venta offline
              </p>
              <h1 className="landing-animate-in mb-6 text-5xl leading-[0.95] font-bold tracking-tight sm:text-6xl lg:text-7xl [animation-delay:250ms]">
                Vende más.
                <br />
                Controla <span className="text-accent italic">todo.</span>
              </h1>
              <p className="landing-animate-in mb-10 max-w-[500px] text-lg text-text-muted sm:text-xl [animation-delay:400ms]">
                Gestiona tu negocio sin depender de Internet. Ventas, inventario, cuadre de caja y reportes — siempre disponibles en tu
                dispositivo.
              </p>
              <div className="landing-animate-in flex flex-col gap-4 sm:flex-row [animation-delay:550ms]">
                <a href="#registro" className={ctaPrimary}>
                  Comenzar
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8h10M9 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
                <a href="#caracteristicas" className={ctaOutline}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor" />
                  </svg>
                  Ver características
                </a>
              </div>
            </div>

            {/* Right: Stats card */}
            <div>
              <div className="landing-animate-in rounded-lg border border-border bg-surface p-10 shadow-card [animation-delay:700ms]">
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="text-4xl leading-none font-bold text-accent">24</span>
                  <span className="text-xs font-medium tracking-wide text-text-muted uppercase">hrs, sin conexión</span>
                </div>
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="text-4xl leading-none font-bold text-accent">100%</span>
                  <span className="text-xs font-medium tracking-wide text-text-muted uppercase">seguridad de tus datos</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl leading-none font-bold text-accent">0</span>
                  <span className="text-xs font-medium tracking-wide text-text-muted uppercase">descontrol</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="caracteristicas" className="px-4 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-12 grid grid-cols-1 gap-6 pb-3 lg:grid-cols-2">
            <div>
              <p className="mb-4 flex items-center gap-3 text-xs font-medium tracking-[0.25em] text-accent uppercase">
                <span className="block h-px w-6 bg-accent" aria-hidden="true"></span>
                Lo que necesitas
              </p>
              <h2 className="text-3xl leading-tight font-bold tracking-tight text-text sm:text-4xl lg:text-5xl">
                Todo para gestionar
                <br />
                tu negocio
              </h2>
            </div>
            <div className="flex items-end">
              <p className="max-w-[500px] text-lg text-text-muted">
                Una herramienta completa que crece contigo. Sin suscripciones, sin complicaciones, sin internet.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <div
                key={feature.title}
                ref={(el) => {
                  featureCardRefs.current[index] = el;
                }}
                className={`transition-all duration-500 ${
                  revealedFeatures.has(index) ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'
                }`}
              >
                <Card>
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-sm border border-accent/15 bg-accent/10 text-accent">
                    {feature.icon}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-text">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-text-muted">{feature.desc}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="como-funciona" className="border-t border-border px-4 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-12 pb-3 text-center">
            <p className="mb-4 flex items-center justify-center gap-3 text-xs font-medium tracking-[0.25em] text-accent uppercase">
              <span className="block h-px w-6 bg-accent" aria-hidden="true"></span>
              En tres pasos
            </p>
            <h2 className="mx-auto text-3xl leading-tight font-bold tracking-tight text-text sm:text-4xl lg:text-5xl">
              Así de simple
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <Card key={step.number}>
                <span className="mb-6 block text-2xl leading-none font-bold text-accent">{step.number}</span>
                <h3 className="mb-2 text-lg font-semibold text-text">{step.title}</h3>
                <p className="text-sm leading-relaxed text-text-muted">{step.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="registro" className="px-4 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <div className="rounded-lg bg-surface p-16 text-center shadow-card">
            <p className="mb-6 flex items-center justify-center gap-3 text-xs font-medium tracking-[0.25em] text-accent uppercase">
              <span className="block h-px w-6 bg-accent" aria-hidden="true"></span>
              Empieza hoy
            </p>
            <h2 className="mb-4 text-3xl leading-tight font-bold text-text sm:text-4xl lg:text-[2.8rem]">
              Tu negocio merece
              <br />
              las mejores herramientas
            </h2>
            <p className="mb-10 text-lg text-text-muted">
              Únete a cientos de emprendedores que ya gestionan sus ventas con control y seguridad.
            </p>
            <Link to="/register" className={`${ctaPrimary} px-10 py-4 text-base`}>
              Crear cuenta gratis
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <p className="mt-5 text-sm tracking-wide text-text-muted/60">2 meses de prueba gratis · Pago mensual post-uso</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-8 text-center">
        <div className="mx-auto w-full max-w-6xl px-4">
          <p className="text-xs tracking-wide text-text-muted">&copy; 2026 VendeDTo · Desarrollado para emprendedores con éxito</p>
        </div>
      </footer>
    </div>
  );
}
