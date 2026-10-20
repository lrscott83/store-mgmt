import { describe, expect, it } from 'vitest';
import { splitPrerenderedLanding } from './split-prerendered-landing.mjs';

const PRERENDERED =
  '<!DOCTYPE html><html lang="es"><head><title></title></head>' +
  '<body><div id="app"><h1>Tu POS offline.</h1></div><script>window.__reactRouterContext={}</script></body></html>';

const FALLBACK =
  '<!DOCTYPE html><html lang="es"><head></head>' +
  '<body><section class="Toastify"></section><script>window.__reactRouterContext={}</script></body></html>';

describe('splitPrerenderedLanding', () => {
  it('returns the prerendered document as the landing and the fallback as the shell, byte for byte', () => {
    const result = splitPrerenderedLanding({ prerendered: PRERENDERED, fallback: FALLBACK });

    expect(result.landingHtml).toBe(PRERENDERED);
    expect(result.shellHtml).toBe(FALLBACK);
  });

  it('rejects an empty prerendered document', () => {
    expect(() => splitPrerenderedLanding({ prerendered: '  ', fallback: FALLBACK })).toThrow(
      /prerendered document is empty/,
    );
  });

  it('rejects an empty fallback document', () => {
    expect(() => splitPrerenderedLanding({ prerendered: PRERENDERED, fallback: '' })).toThrow(
      /SPA fallback document is empty/,
    );
  });

  it('rejects a prerendered document without a body', () => {
    expect(() =>
      splitPrerenderedLanding({
        prerendered: '<html><head></head></html>',
        fallback: FALLBACK,
      }),
    ).toThrow(/no <body>/);
  });

  it('rejects a fallback that already carries landing markup', () => {
    expect(() =>
      splitPrerenderedLanding({
        prerendered: PRERENDERED,
        fallback: '<html><body><h1>Tu POS offline.</h1></body></html>',
      }),
    ).toThrow(/carries landing markup/);
  });

  it('rejects a prerendered document with no content in the body', () => {
    expect(() =>
      splitPrerenderedLanding({
        prerendered: '<html><body><div></div></body></html>',
        fallback: FALLBACK,
      }),
    ).toThrow(/no <h1>/);
  });
});
