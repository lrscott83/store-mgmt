import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import { initPwaInstallCapture } from '~/shared/lib/pwa/pwa-install-prompt';

// Capture `beforeinstallprompt` as early as possible — module scope, before
// hydration starts. Chrome fires this event once, early in page load, and it
// cannot be re-dispatched; a listener wired from a `useEffect` only attaches
// AFTER hydration and misses it, leaving the "Instalar App" button stuck
// disabled even though the browser considers the app installable. See
// `~/shared/lib/pwa/pwa-install-prompt.ts` for the capture store that
// `usePwaInstall` reads from.
console.info('[PWA] entry.client executing — installing early capture BEFORE hydrate');
initPwaInstallCapture();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
