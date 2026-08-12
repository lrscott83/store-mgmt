import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { extractHydrationScriptHashes } from '../csp-hydration-hashes.mjs';

// 2026-08-12 finding: react-router's static SPA-mode build inlines its
// hydration bootstrap as bare `<script>` tags — confirmed present in a real
// `pnpm build` output, not just the dev server. This is the build-time half
// of allowlisting them by hash instead of relaxing script-src.

function sha256Source(content) {
  return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`;
}

describe('extractHydrationScriptHashes', () => {
  it('hashes an inline window.__reactRouterContext assignment', () => {
    const script = 'window.__reactRouterContext = {"basename":"/"};';
    const html = `<html><body><script>${script}</script></body></html>`;
    expect(extractHydrationScriptHashes(html)).toEqual([sha256Source(script)]);
  });

  it('hashes all three known hydration scripts, one entry each', () => {
    const s1 = 'window.__reactRouterContext = {"basename":"/"};';
    const s2 = 'window.__reactRouterContext.streamController.enqueue("[]");';
    const s3 = 'window.__reactRouterContext.streamController.close();';
    const html = `<script>${s1}</script><script>${s2}</script><script>${s3}</script>`;
    const result = extractHydrationScriptHashes(html);
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining([sha256Source(s1), sha256Source(s2), sha256Source(s3)]));
  });

  it('ignores an inline script that does not start with window.__reactRouterContext', () => {
    const html = '<script>console.log("hello");</script>';
    expect(extractHydrationScriptHashes(html)).toEqual([]);
  });

  it('ignores a <script src="..."> external script entirely (no crash, no false hash)', () => {
    const html = '<script src="/assets/entry.client.js" type="module"></script>';
    expect(extractHydrationScriptHashes(html)).toEqual([]);
  });

  it('returns an empty array for html with no inline scripts', () => {
    expect(extractHydrationScriptHashes('<html><body></body></html>')).toEqual([]);
  });

  it('is deterministic: two calls on the same html produce the same sorted list', () => {
    const html =
      '<script>window.__reactRouterContext.streamController.close();</script>' +
      '<script>window.__reactRouterContext = {"basename":"/"};</script>';
    expect(extractHydrationScriptHashes(html)).toEqual(extractHydrationScriptHashes(html));
  });

  it('hashes the exact bytes, including whitespace — two scripts differing only in whitespace hash differently', () => {
    const html =
      '<script>window.__reactRouterContext = {"a":1};</script>' +
      '<script>window.__reactRouterContext = {"a":1}; </script>';
    expect(extractHydrationScriptHashes(html)).toHaveLength(2);
  });
});
