// Captures `beforeinstallprompt` as an EXTERNAL CLASSIC script (not a
// module) referenced from `root.tsx` as `<script src="/pwa-install-capture.js">`.
// Runs DURING head parse — before the deferred `type=module` app bundle
// (entry.client.tsx) executes. Chrome fires this event once, does not
// re-dispatch it, and once the service worker + manifest are warm it fires
// before the bundle runs, so the module-scope listener in
// pwa-install-prompt.ts misses it and the "Instalar App" button stays
// disabled. Parking the event on `window.__pwaInstallPrompt` lets
// `initPwaInstallCapture()` adopt it once the bundle loads.
//
// Same-origin static asset in `public/` (Vite copies it verbatim, never
// transformed/hashed/module-wrapped), so `script-src 'self'` covers it with
// no nonce and no hash — see
// openspec/changes/content-security-policy/design.md §1 D5.
//
// Lives outside the TypeScript project (`public/**` is eslint-ignored,
// `allowJs` is off) — the Playwright spec in
// `e2e/pwa-install-capture.spec.ts` is the only check on this file.
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
});
window.addEventListener('appinstalled', function () {
  window.__pwaInstallPrompt = null;
});
