/**
 * Pre-flight guard: is the dev server Playwright is about to drive actually
 * pointing at the backend THIS run expects?
 *
 * ## The failure it prevents
 *
 * `playwright.config.ts` injects `API_URL` into `webServer.env` so the dev
 * server it spawns talks to `E2E_API_URL`. That injection only reaches a
 * process Playwright itself starts. With `reuseExistingServer: true`, a Vite
 * dev server already listening on :3333 — one a developer started by hand — is
 * adopted exactly as it is, and it resolved its own `API_URL` from the
 * gitignored `frontend-react/.env`. The suite then drives an app wired to a
 * different backend.
 *
 * The symptom is disproportionate to the cause. `register.spec.ts` catches it
 * through `network-observer.ts`'s wrong-backend guard and says so clearly, but
 * that guard only fires on a registration REQUEST. Every other spec that mints
 * an identity — `login.spec.ts`, and anything using `session.ts`'s
 * `mintOwnerAdmin` — simply submits the form, never navigates, and burns the
 * full 120 s test timeout on a `waitForURL` that reports nothing about the real
 * cause. One misconfigured dev server costs several minutes and reads like
 * three unrelated bugs.
 *
 * ## How it detects it
 *
 * `apps/web-store-pos/vite.config.ts` builds the dev CSP header from its own
 * resolved `API_URL` (`buildCspHeaderValue('dev', { apiUrl: env['API_URL'] })`)
 * and sets it on EVERY response through the `csp-report-only-dev-header`
 * middleware. `scripts/csp-policy.mjs` puts that URL's origin into
 * `connect-src`. So one plain GET to the dev server returns the server's own
 * account of which backend it was configured with — no new endpoint, nothing to
 * keep in sync, and it cannot drift from what the app actually uses because
 * both read the same `env['API_URL']`.
 *
 * ## Why it only blocks on positive evidence
 *
 * A missing header, an unreadable one, or an unreachable server all mean "could
 * not verify" — those warn and let the run continue, because failing the whole
 * suite over an unverifiable state would make this guard more dangerous than
 * the bug. Only a header that is readable AND names a different origin stops
 * the run.
 */
import { E2E_API_URL } from './backend-url';

/** Where the dev server listens (`apps/web-store-pos/vite.config.ts` DEV_SERVER_PORT). */
export const DEV_SERVER_URL = 'http://localhost:3333';

/** Lowercased: `Headers.get` is case-insensitive, but raw-object lookups are not. */
const CSP_HEADER_NAME = 'content-security-policy-report-only';

/**
 * Pulls the API origin out of a dev CSP header's `connect-src`.
 *
 * `csp-policy.mjs:87-92` builds that list as `['self', apiOrigin?, wsOrigin?]`,
 * so the API origin is the one token that is neither a quoted keyword nor the
 * HMR WebSocket origin. Returns `null` when the header carries no `connect-src`
 * or when that directive holds no such token — the latter is what a same-origin
 * or relative `API_URL` produces (`deriveApiOrigin` returns `null` for those,
 * and nothing is pushed).
 */
export function apiOriginFromCsp(cspHeader: string | null | undefined): string | null {
  if (!cspHeader) return null;
  for (const directive of cspHeader.split(';')) {
    const tokens = directive.trim().split(/\s+/).filter(Boolean);
    if (tokens[0] !== 'connect-src') continue;
    const origin = tokens
      .slice(1)
      .find((token) => !token.startsWith("'") && !token.startsWith('ws://') && !token.startsWith('wss://'));
    return origin ?? null;
  }
  return null;
}

/** The actionable failure. Names both origins and both ways out. */
export function wrongBackendMessage(observedOrigin: string, expectedApiUrl: string): string {
  return [
    `El dev server de ${DEV_SERVER_URL} está configurado contra ${observedOrigin}, pero esta corrida espera ${expectedApiUrl}.`,
    '',
    'Por qué pasa: `reuseExistingServer: true` (playwright.config.ts). Si ya había un dev server',
    'levantado a mano en :3333, Playwright lo reutiliza tal cual está y el `API_URL` que inyecta en',
    '`webServer.env` NUNCA llega a ese proceso — ese server resolvió su `API_URL` desde tu',
    '`frontend-react/.env`.',
    '',
    'Pará ese dev server (Ctrl+C en su terminal) y volvé a correr la suite: Playwright va a levantar',
    'el suyo, ya apuntando al backend correcto.',
    '',
    `Si en cambio querés correr la suite contra ${observedOrigin}, exportá E2E_API_URL con esa URL`,
    'antes de arrancar Playwright (ver e2e/support/backend-url.ts).',
  ].join('\n');
}

/**
 * Fetches the dev server's CSP header and compares its API origin against the
 * expected backend. Throws the actionable message on a confirmed mismatch;
 * warns and returns on anything it cannot verify.
 *
 * Runs from `global-setup.ts`, which Playwright executes AFTER the webServer
 * plugin has started or adopted the server (`runner/index.js:6003-6009`:
 * `createPluginSetupTasks` precedes `globalSetups`) — so this always inspects
 * the very server the tests will drive, not a guess about which one that is.
 */
export async function assertDevServerBackend(expectedApiUrl: string = E2E_API_URL): Promise<void> {
  let cspHeader: string | null;
  try {
    const response = await fetch(DEV_SERVER_URL);
    cspHeader = response.headers.get(CSP_HEADER_NAME);
  } catch (error) {
    console.warn(
      `[e2e] No se pudo consultar ${DEV_SERVER_URL} para verificar su backend (${String(error)}). ` +
        'Sigo adelante: la corrida puede fallar más tarde si el dev server apunta a otro backend.'
    );
    return;
  }

  const observedOrigin = apiOriginFromCsp(cspHeader);
  if (!observedOrigin) {
    console.warn(
      `[e2e] El dev server de ${DEV_SERVER_URL} no expuso un origen de API en su cabecera CSP, ` +
        'así que no puedo verificar contra qué backend está configurado. Sigo adelante.'
    );
    return;
  }

  const expectedOrigin = new URL(expectedApiUrl).origin;
  if (observedOrigin !== expectedOrigin) {
    throw new Error(wrongBackendMessage(observedOrigin, expectedApiUrl));
  }
}
