import { describe, expect, it } from 'vitest';
import { findLandingPrerenderViolations } from './landing-prerender-policy.mjs';

const GOOD_LANDING =
  '<html><head><title>VendeDTo</title>' +
  '<script type="application/ld+json">{"@type":"SoftwareApplication"}</script></head>' +
  '<body><h1>Tu POS offline.</h1><p>Vende más.</p>' +
  '<script src="/assets/bootstrap-0-abc.js"></script></body></html>';

const GOOD_SHELL =
  '<html><head></head><body><section class="Toastify"></section>' +
  '<script>window.__reactRouterContext = {}</script></body></html>';

describe('findLandingPrerenderViolations', () => {
  it('accepts a prerendered landing with an injectable head and a clean shell', () => {
    expect(findLandingPrerenderViolations({ landing: GOOD_LANDING, shell: GOOD_SHELL })).toEqual([]);
  });

  it('reports an empty landing', () => {
    expect(findLandingPrerenderViolations({ landing: ' ', shell: GOOD_SHELL })).toEqual([
      'landing.html is empty',
    ]);
  });

  it('reports a landing without an h1 (body not prerendered)', () => {
    const landing = GOOD_LANDING.replace('<h1>Tu POS offline.</h1>', '');

    expect(findLandingPrerenderViolations({ landing, shell: GOOD_SHELL })).toContain(
      'landing.html has no <h1>: the body was not prerendered',
    );
  });

  it('does not care about the hero copy: rewording it is not a prerender failure', () => {
    const landing = GOOD_LANDING.replace('Tu POS offline.', 'Vende desde el primer día.');

    expect(findLandingPrerenderViolations({ landing, shell: GOOD_SHELL })).toEqual([]);
  });

  it('reports duplicated or missing title and JSON-LD blocks', () => {
    const landing = GOOD_LANDING.replace(
      '</head>',
      '<title>otro</title></head>',
    ).replace('<script type="application/ld+json">{"@type":"SoftwareApplication"}</script>', '');

    const violations = findLandingPrerenderViolations({ landing, shell: GOOD_SHELL });

    expect(violations).toContain('landing.html carries 2 <title> tags, expected exactly 1');
    expect(violations).toContain('landing.html carries 0 JSON-LD blocks, expected exactly 1');
  });

  it('reports executable inline scripts the static CSP cannot hash', () => {
    const landing = GOOD_LANDING.replace('</body>', '<script>console.log(1)</script></body>');

    expect(findLandingPrerenderViolations({ landing, shell: GOOD_SHELL })).toContain(
      'landing.html keeps 1 executable inline script(s) that the static CSP cannot hash',
    );
  });

  it('reports landing markup or metadata that leaked into the shell', () => {
    const shell = '<html><head><title>x</title></head><body><h1>Tu POS</h1></body></html>';

    const violations = findLandingPrerenderViolations({ landing: GOOD_LANDING, shell });

    expect(violations).toContain('index.html (SPA shell) carries landing markup: the split did not run');
    expect(violations).toContain('index.html (SPA shell) carries a <title>: landing metadata leaked into every route');
  });
});
