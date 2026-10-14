import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Hotspot loopback E2E — two REAL browser contexts, real WebRTC, no backend.
 *
 * The app's own UI cannot be used here: both modals read the peer's QR with the
 * camera, which does not exist in Playwright. So this spec bundles the actual
 * `peer-connection` + `transfer-protocol` modules (see
 * `apps/web-store-pos/scripts/build-hotspot-harness.mjs`) and exchanges the
 * offer/answer through the test itself, then runs a real transfer.
 *
 * Run with: pnpm --dir frontend-react exec playwright test --config playwright.hotspot.config.ts
 */
const APP_DIR = resolve(__dirname, '../apps/web-store-pos');
const HARNESS_PATH = join(tmpdir(), 'hotspot-harness.js');
const PAYLOAD_LENGTH = 40_000;

let server: Server;
let baseUrl = '';

test.beforeAll(async () => {
  execFileSync('node', ['scripts/build-hotspot-harness.mjs', HARNESS_PATH], {
    cwd: APP_DIR,
    stdio: 'inherit',
  });

  // A real http origin: `about:blank` is not a secure context, so
  // `crypto.subtle` (used by the transfer's digest) would be unavailable.
  server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><body></body></html>');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

async function openPeer(page: Page): Promise<void> {
  await page.goto(baseUrl);
  await page.addScriptTag({ content: readFileSync(HARNESS_PATH, 'utf8') });
}

test('transfers a payload between two real browsers over WebRTC', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await openPeer(pageA);
  await openPeer(pageB);

  // Emitter builds the offer and keeps the session on the page.
  const offerSdp = await pageA.evaluate(async () => {
    const hotspot = (window as any).__hotspot;
    const started = await hotspot.createOffer();
    (window as any).__offer = started;
    return started.sdp as string;
  });

  // Receiver answers it.
  const answerSdp = await pageB.evaluate(async (sdp: string) => {
    const hotspot = (window as any).__hotspot;
    const accepted = await hotspot.acceptOffer(sdp);
    (window as any).__accepted = accepted;
    return accepted.sdp as string;
  }, offerSdp);

  await pageA.evaluate(async (sdp: string) => {
    const hotspot = (window as any).__hotspot;
    await hotspot.completeConnection((window as any).__offer.connection, sdp);
  }, answerSdp);

  // Receiver waits for the payload BEFORE it is sent.
  const received = pageB.evaluate(async () => {
    const hotspot = (window as any).__hotspot;
    const channel = await (window as any).__accepted.channel;
    const result = await hotspot.receiveTransfer(channel, { timeoutMs: 60_000 });
    return { verified: result.verified as boolean, length: result.bytes.length as number };
  });

  await pageA.evaluate(async (length: number) => {
    const hotspot = (window as any).__hotspot;
    const session = (window as any).__offer;
    await hotspot.waitForChannelOpen(session.channel, 60_000);
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) bytes[i] = (i * 7 + 3) % 256;
    await hotspot.sendTransfer(session.channel, {
      name: 'payload.bin',
      kind: 'roster',
      bytes,
    });
  }, PAYLOAD_LENGTH);

  const result = await received;
  expect(result).toEqual({ verified: true, length: PAYLOAD_LENGTH });

  await contextA.close();
  await contextB.close();
});
