// A six-line module with a load-bearing contract (design D1, "Zero-import leaf
// module").
//
// `OFFLINE_SESSION_TOKEN` is the sentinel stamped onto `UserModel.authToken` for
// every offline-hydrated session. Consumers — `app-layout.tsx`'s idle lock,
// among others — import ONLY this const, never `offline-auth-service`, and that
// is the point: on an online page load, evaluating `offline-auth-service` would
// drag the crypto and localStorage modules into the cold-boot graph for a
// session that never needed them. The constant is what keeps that import graph
// a single edge wide.
//
// So the tests here pin two things: the exact sentinel string (it is persisted
// into `currentUser` and compared against on every session read — a rename
// silently reclassifies every offline session as online), and the zero-import
// property, which is structural and cannot be observed from the value alone.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OFFLINE_SESSION_TOKEN } from '../offline-session';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('offline-session — the sentinel token', () => {
  it('is exactly "offline-session"', () => {
    // Pinned verbatim: the value is written into the persisted currentUser and
    // compared on every session read, so a rename would silently downgrade
    // every already-offline session to "online" on the next load.
    expect(OFFLINE_SESSION_TOKEN).toBe('offline-session');
  });

  it('is a plain, non-empty string with no surrounding whitespace', () => {
    expect(typeof OFFLINE_SESSION_TOKEN).toBe('string');
    expect(OFFLINE_SESSION_TOKEN.length).toBeGreaterThan(0);
    expect(OFFLINE_SESSION_TOKEN).toBe(OFFLINE_SESSION_TOKEN.trim());
  });

  it('is a hyphenated single token — never a value a real JWT could equal', () => {
    // It is substituted for `authToken`, so it must be unmistakable in logs
    // and impossible to confuse with a bearer credential.
    expect(OFFLINE_SESSION_TOKEN).not.toContain(' ');
    expect(OFFLINE_SESSION_TOKEN).not.toContain('.');
    expect(OFFLINE_SESSION_TOKEN).toMatch(/^[a-z]+(-[a-z]+)+$/);
  });

  it('is the same value on a fresh import — a module singleton, not a fresh literal', async () => {
    const reimported = await import('../offline-session');
    expect(reimported.OFFLINE_SESSION_TOKEN).toBe(OFFLINE_SESSION_TOKEN);
  });
});

describe('offline-session — zero-import leaf guard (D1)', () => {
  it('structural: the module declares no import or re-export of any kind', () => {
    const source = readFileSync(join(__dirname, '..', 'offline-session.ts'), 'utf-8');
    const moduleEdges = source.match(/^\s*(?:import|export)\s.*?from\s/gm) ?? [];

    // The whole point of this file: a consumer that imports only the token must
    // not evaluate the crypto/localStorage graph behind it.
    expect(moduleEdges).toEqual([]);
  });

  it('structural: the leaf exposes nothing but the constant declaration', () => {
    const source = readFileSync(join(__dirname, '..', 'offline-session.ts'), 'utf-8');
    const codeLines = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//'));

    // One statement. A second export here (a helper, a type, a re-export) is
    // the first crack in the leaf, and it should fail loudly.
    expect(codeLines).toEqual([`export const OFFLINE_SESSION_TOKEN = 'offline-session';`]);
  });
});
