import { expect, test } from '@playwright/test';

// CÓMO CORRER (desde frontend-react/):
//   npx playwright test e2e/pwa-install-capture.spec.ts --project=chromium
//
// Covers `pwa-install-capture-script` — "Runs Before Hydration, Not Blocked
// by Policy" (openspec/changes/content-security-policy/specs/
// pwa-install-capture-script/spec.md). Design: design.md §4.1.
//
// WU1 externalises `root.tsx:39-44`'s inline `dangerouslySetInnerHTML`
// `beforeinstallprompt` capture into `public/pwa-install-capture.js`, served
// as `<script src="/pwa-install-capture.js">` — same-origin, so
// `script-src 'self'` covers it with no `'unsafe-inline'` needed. No CSP
// header exists yet at this point in the change; this spec only proves the
// externalised script preserves today's behaviour.

const PARSE_TIME_PROBE_GLOBAL = '__pwaCaptureParseTimeProbe';

interface ParseTimeProbe {
  /** `document.readyState` at the instant the `beforeinstallprompt` listener registered. */
  readyStateAtRegistration: string;
}

test.describe('pwa install capture script', () => {
  test('loads as an external classic <script> in the document head', async ({ page }) => {
    await page.goto('/');

    const el = page.locator('head script[src="/pwa-install-capture.js"]');
    await expect(el).toHaveCount(1);
    // Not a module, not deferred, not async — a classic script that runs
    // DURING parse, which is the entire point (design.md D5.3).
    expect(await el.getAttribute('type')).toBeNull();
    expect(await el.getAttribute('defer')).toBeNull();
    expect(await el.getAttribute('async')).toBeNull();
  });

  test('adopts a beforeinstallprompt fired after load — behaviour-neutral vs the inline script', async ({
    page,
  }) => {
    await page.goto('/');

    const installButton = page.getByRole('button', { name: 'Instalar app' });
    await expect(installButton).toBeVisible();
    await expect(installButton).toBeDisabled();

    await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    });

    await expect(installButton).toBeEnabled();
  });

  test('registers beforeinstallprompt during document parse, and the prompt survives to after hydration', async ({
    page,
  }) => {
    // Installed before ANY app script evaluates. Wraps `window.addEventListener`
    // so it observes the CAPTURE SCRIPT'S OWN call registering the
    // `beforeinstallprompt` listener, and snapshots `document.readyState` at
    // that exact instant. A classic (non-deferred, non-module) script runs
    // DURING parse — `readyState` is still `'loading'` — whereas a
    // `type="module"` script is implicitly deferred and would only register
    // once parsing has finished (`readyState` already `'interactive'`). This
    // is the parse-time discrimination design.md D5.3 calls for, verified
    // against listener-registration timing rather than DOM node order: this
    // repo's dev-mode head rendering does not preserve the Layout's JSX child
    // order (`<link rel="manifest">` lands in the DOM before our `<script
    // src>` even executes, confirmed by curling the raw dev HTML), so
    // asserting against a specific sibling node's arrival is not reliable —
    // asserting against the readyState at the actual registration call is.
    //
    // The instant registration is observed, the synthetic event is dispatched
    // right there — still mid-parse, before hydration has even started — and
    // after the app finishes loading/hydrating we assert the prompt is still
    // held on `window.__pwaInstallPrompt`. That is exactly the spec's
    // "Prompt captured ahead of hydration" scenario.
    await page.addInitScript((globalName) => {
      (window as unknown as Record<string, unknown>)[globalName] = null;
      const originalAddEventListener = window.addEventListener.bind(window);

      window.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ) => {
        const alreadyObserved = (window as unknown as Record<string, unknown>)[globalName] !== null;
        if (type !== 'beforeinstallprompt' || alreadyObserved) {
          originalAddEventListener(type, listener, options);
          return;
        }

        (window as unknown as Record<string, unknown>)[globalName] = {
          readyStateAtRegistration: document.readyState,
        };
        originalAddEventListener(type, listener, options);
        // Fired synchronously, right after the capture script's OWN listener
        // registration — mid-parse, well before hydration.
        window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
      }) as typeof window.addEventListener;
    }, PARSE_TIME_PROBE_GLOBAL);

    await page.goto('/');

    const probe = (await page.evaluate(
      (globalName) => (window as unknown as Record<string, unknown>)[globalName],
      PARSE_TIME_PROBE_GLOBAL
    )) as ParseTimeProbe | null;

    expect(probe, 'no beforeinstallprompt listener was ever registered').not.toBeNull();
    // Precondition first (CLAUDE.md: assert the state that triggers the
    // behaviour before trusting the effect) — registration must have
    // happened WHILE the document was still parsing, or the discrimination
    // is void.
    expect(probe?.readyStateAtRegistration).toBe('loading');

    const promptHeldAfterHydration = await page.evaluate(
      () => (window as unknown as { __pwaInstallPrompt?: unknown }).__pwaInstallPrompt != null
    );
    expect(promptHeldAfterHydration).toBe(true);

    // The app's own surface reflects it too, not just the window global.
    await expect(page.getByRole('button', { name: 'Instalar app' })).toBeEnabled();
  });
});
