import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  STABLE_INLINE_PREFIX,
  externalizeInlineScripts,
  scanInlineScripts,
} from '../externalize-inline-scripts.mjs';

// Pure transform: given build/client/index.html, moves every inline script
// that is NOT a stable react-router hydration script into an
// assets/bootstrap-<n>-<hash>.js file. No filesystem here — the CLI wrapper
// (externalize-bootstrap.mjs) owns the I/O.

function sha256Hex8(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 8);
}

describe('externalizeInlineScripts', () => {
  it('externalizes a <script type="module"> with import content, preserving attribute order and type', () => {
    const content = 'import "/assets/manifest-abc.js";\nimport("/assets/entry.client-def.js");';
    const html = `<head><script type="module">${content}</script></head>`;

    const { html: out, assets } = externalizeInlineScripts(html);

    expect(assets).toHaveLength(1);
    expect(assets[0].content).toBe(content);
    expect(assets[0].fileName).toBe(`assets/bootstrap-0-${sha256Hex8(content)}.js`);
    expect(out).toBe(`<head><script type="module" src="${assets[0].fileName}"></script></head>`);
    expect(out).not.toContain('import ');
  });

  it('externalizes a bare <script> with non-matching content as a classic external script', () => {
    const html = '<script>console.log("boot");</script>';

    const { html: out, assets } = externalizeInlineScripts(html);

    expect(assets).toHaveLength(1);
    expect(out).toBe(`<script src="${assets[0].fileName}"></script>`);
  });

  it('leaves scripts matching ^window.__reactRouterContext byte-identical', () => {
    const stable = 'window.__reactRouterContext = {"basename":"/"};';
    const html = `<script>${stable}</script>`;

    const { html: out, assets } = externalizeInlineScripts(html);

    expect(assets).toEqual([]);
    expect(out).toBe(html);
  });

  it('preserves document order of all scripts', () => {
    const s1 = 'window.__reactRouterContext = {"basename":"/"};';
    const s2 = 'import "/assets/manifest-abc.js";';
    const s3 = 'window.__reactRouterContext.streamController.close();';
    const html = `<script>${s1}</script><script type="module">${s2}</script><script>${s3}</script>`;

    const { html: out } = externalizeInlineScripts(html);

    const i1 = out.indexOf('window.__reactRouterContext =');
    const i2 = out.indexOf('src="assets/bootstrap-0-');
    const i3 = out.indexOf('window.__reactRouterContext.streamController.close');
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });

  it('names assets under assets/ with the content hash; different content yields different names', () => {
    const html = '<script>aaa();</script><script>bbb();</script>';

    const { assets } = externalizeInlineScripts(html);

    expect(assets).toHaveLength(2);
    expect(assets[0].fileName).toMatch(/^assets\/bootstrap-0-[0-9a-f]{8}\.js$/);
    expect(assets[1].fileName).toMatch(/^assets\/bootstrap-1-[0-9a-f]{8}\.js$/);
    expect(assets[0].fileName).not.toBe(assets[1].fileName);
  });

  it('is a safe no-op when every inline script matches the stable prefix', () => {
    const html = '<script>window.__reactRouterContext = {"a":1};</script>';

    const { html: out, assets } = externalizeInlineScripts(html);

    expect(assets).toEqual([]);
    expect(out).toBe(html);
  });

  it('is a no-op on a document with no inline scripts', () => {
    const html = '<html><body><script src="/assets/entry.client.js" type="module"></script></body></html>';

    const { html: out, assets } = externalizeInlineScripts(html);

    expect(assets).toEqual([]);
    expect(out).toBe(html);
  });

  it('honors a custom prefix option', () => {
    const html = '<script>MY_BOOT();</script>';

    const { assets } = externalizeInlineScripts(html, { prefix: /^MY_BOOT/ });

    expect(assets).toEqual([]);
  });

  it('scanInlineScripts skips scripts that carry a src attribute', () => {
    const html = '<script src="/x.js"></script><script>inline();</script>';

    const scripts = scanInlineScripts(html);

    expect(scripts).toHaveLength(1);
    expect(scripts[0].content).toBe('inline();');
  });

  it('exports the stable prefix constant', () => {
    expect(STABLE_INLINE_PREFIX.test('window.__reactRouterContext = {};')).toBe(true);
  });
});