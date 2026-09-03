import { useState } from 'react';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { seedDemoDataForStore } from '~/shared/lib/dev/demo-data-generator';

/**
 * DEMO-SEED — floating button that fills the current store's LOCAL storage with
 * ~90 days of demo data (orders cycling Efectivo/Tarjeta/Zelle without credits +
 * monthly expenses). Available in every build (DEV and production); it only
 * renders when a store is selected and only for the demo/dev login `lrscott`.
 */
export function DemoSeedButton() {
  const user = useAuthStore((state) => state.user);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Login gate: the generator is for the demo/dev user only, never for other
  // store users (logins are compared case-insensitively).
  const isAllowedDevUser = user?.login?.toLowerCase() === 'lrscott';
  const storeId = user?.selectedStoreId;
  if (!isAllowedDevUser || !storeId) return null;

  function handleClick() {
    const activeStoreId = useAuthStore.getState().user?.selectedStoreId;
    if (!activeStoreId) return;
    setBusy(true);
    const result = seedDemoDataForStore(activeStoreId);
    setFeedback(result.message);
    setBusy(false);
    if (result.ok) {
      window.setTimeout(() => window.location.reload(), 1200);
    }
  }

  return (
    <div className="fixed bottom-16 right-4 z-[60] flex flex-col items-end gap-2">
      {feedback && (
        <div className="max-w-xs rounded border border-border bg-white p-3 text-xs text-text shadow-lg">
          {feedback}
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-full bg-cyan-600 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-cyan-700 disabled:opacity-60"
      >
        {busy ? 'Generando…' : '⚡ Generar datos demo (90 días)'}
      </button>
    </div>
  );
}
