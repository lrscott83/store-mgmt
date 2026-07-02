import { usePwaInstall } from '~/shared/lib/hooks/use-pwa-install';

/**
 * Floating "Instalar App" button, mirroring Angular's global `pwa-install-btn`
 * (`app.component.html` / `.scss`): fixed bottom-right amber gradient pill, shown
 * only when the app is installable and disabled until a native install prompt is
 * captured. Clicking fires the captured `beforeinstallprompt`.
 */
export function InstallAppButton() {
  const { canInstall, canPrompt, promptInstall } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      disabled={!canPrompt}
      title="Instalar app"
      aria-label="Instalar app"
      className="fixed bottom-6 right-6 z-[9999] inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#f5b026] to-[#e09a1a] px-7 py-3.5 text-sm font-semibold uppercase tracking-wide text-[#0a0a0a] shadow-lg transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {/* Angular's inline download glyph (app.component.html). */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Instalar App
    </button>
  );
}
