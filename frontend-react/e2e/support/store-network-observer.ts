import type { Page, Request as PlaywrightRequest } from '@playwright/test';
import { E2E_API_URL } from './backend-url';
import {
  createDeferred,
  createOutcomeQueue,
  matchesPathSuffix,
  resolveCapture,
  type Deferred,
  type Outcome,
} from './network-observer-core';

/**
 * S2-01's fourth observer (design.md D4). Watches `PUT /v1/stores/{storeId}`
 * (body + timestamps) and `GET /v1/auth/me` (timestamps only, for the causal
 * order REQ-5 needs), plus a document-navigation counter for REQ-5's
 * "no reload" claim.
 *
 * Installed INSIDE `store-plan-activation.spec.ts`, never as an `auto: true`
 * fixture in `support/test.ts` — same precedent as `any-request-observer.ts`
 * in `login-offline.spec.ts:14-19`. `support/test.ts` is out of this
 * change's authorization boundary.
 *
 * The `/me` matcher below is a deliberate 4-line duplicate of
 * `login-network-observer.ts`'s `isMeRequest`, not an import from it —
 * that file feeds 5 existing specs via `auto: true` (`test.ts:63,74`);
 * exporting timestamps from it would widen a shared surface for a single
 * new consumer. The `/me` REQUEST COUNT itself is still cross-checked with
 * the existing `loginNetwork.expectMeRequestCount(1)` in the spec — this
 * file only adds the causal-order piece that observer does not expose.
 */

const ME_PATH_SUFFIX = '/v1/auth/me';

export interface StorePutCapture {
  status: number;
  url: string;
  moduleIds: number[];
  rawBody: string;
}

export interface StoreNetworkObserver {
  /** Resolves once `PUT /v1/stores/{storeId}` has been observed (already-observed resolves immediately). */
  waitForPutRequest(): Promise<void>;
  /** Resolves with the PUT response's body, captured at response time (never re-read after navigation). */
  waitForPutResponse(): Promise<StorePutCapture>;
  /**
   * REQ-5. Asserts the causal claim: exactly one PUT request/response to
   * THIS store, at least one `/me` request, and the first `/me` request's
   * timestamp is >= the PUT response's timestamp — `edit-store.tsx:134-139`
   * only calls `getUserByToken()` (which fires `/me`) after `updateStore()`
   * has already resolved.
   */
  expectPutThenMe(): void;
  /**
   * D4: a PUT to a DIFFERENT store is detected, never silently folded into
   * this count — the suffix is parametrized by `storeId`, not a generic
   * `/v1/stores/*` regex.
   */
  expectPutCount(expected: number): void;
  /** D6: marks the current document-request count as the baseline for `expectNoDocumentSince()`. */
  markDocumentBaseline(): void;
  /**
   * REQ-5's "no reload" half, measured rather than assumed: throws if any
   * `resourceType() === 'document'` request was observed since
   * `markDocumentBaseline()` — a `location.reload()`/hard navigation would
   * produce one; a client-side `navigate()` never does.
   */
  expectNoDocumentSince(context?: string): void;
}

type EventKind = 'put' | 'me';
type EventPhase = 'request' | 'response';

interface ObservedEvent {
  kind: EventKind;
  phase: EventPhase;
  at: number;
}

function isMeRequest(method: string, url: string): boolean {
  if (method !== 'GET') return false;
  return matchesPathSuffix(url, ME_PATH_SUFFIX);
}

export function installStoreNetworkObserver(page: Page, storeId: string): StoreNetworkObserver {
  const putPathSuffix = `/v1/stores/${storeId}`;
  const events: ObservedEvent[] = [];
  const putRequests: Array<{ url: string }> = [];
  const queue = createOutcomeQueue<StorePutCapture>();
  let putRequestDeferred: Deferred<void> | null = null;
  let putRequestSeen = false;
  let documentCount = 0;
  let documentBaseline = 0;

  function isPutRequest(method: string, url: string): boolean {
    if (method !== 'PUT') return false;
    return matchesPathSuffix(url, putPathSuffix);
  }

  page.on('request', (request: PlaywrightRequest) => {
    const method = request.method();
    const url = request.url();

    if (request.resourceType() === 'document') {
      documentCount += 1;
    }

    if (isPutRequest(method, url)) {
      events.push({ kind: 'put', phase: 'request', at: Date.now() });
      putRequests.push({ url });
      putRequestSeen = true;
      putRequestDeferred?.resolve();
      return;
    }

    if (isMeRequest(method, url)) {
      events.push({ kind: 'me', phase: 'request', at: Date.now() });
    }
  });

  page.on('response', (response) => {
    const method = response.request().method();
    const url = response.url();

    if (isPutRequest(method, url)) {
      // Timestamp recorded synchronously, before the body is drained — same
      // reasoning as login-network-observer.ts:183-190: the moment that
      // matters is when the response reached the browser, not when this
      // process finished reading it.
      events.push({ kind: 'put', phase: 'response', at: Date.now() });

      const rawBody = response.request().postData() ?? '';
      let moduleIds: number[] = [];
      try {
        const parsed = JSON.parse(rawBody) as { moduleIds?: unknown };
        if (Array.isArray(parsed.moduleIds)) {
          moduleIds = parsed.moduleIds.filter((id): id is number => typeof id === 'number');
        }
      } catch {
        moduleIds = [];
      }

      void response
        .text()
        .catch(() => '')
        .then(() => {
          queue.push({
            kind: 'response',
            capture: { status: response.status(), url, moduleIds, rawBody },
          });
        });
      return;
    }

    if (isMeRequest(method, url)) {
      events.push({ kind: 'me', phase: 'response', at: Date.now() });
    }
  });

  return {
    waitForPutRequest: async () => {
      if (putRequestSeen) return;
      putRequestDeferred ??= createDeferred<void>();
      await putRequestDeferred.promise;
    },

    waitForPutResponse: async () => {
      const outcome: Outcome<StorePutCapture> = await queue.take();
      return resolveCapture(outcome, {
        subject: 'tienda',
        rateLimitError: () =>
          new Error(
            `Unexpected 429 on PUT .../v1/stores/${storeId} — this endpoint carries no ` +
              '[EnableRateLimiting] policy (StoresController.cs), so a 429 here is not a known ' +
              'rate limit and points at something else.'
          ),
      });
    },

    expectPutThenMe: () => {
      const putRequests_ = events.filter((e) => e.kind === 'put' && e.phase === 'request');
      const putResponses = events.filter((e) => e.kind === 'put' && e.phase === 'response');
      const meRequests = events.filter((e) => e.kind === 'me' && e.phase === 'request');

      if (putRequests_.length !== 1) {
        throw new Error(
          `Expected exactly one PUT .../v1/stores/${storeId}, observed ${putRequests_.length}.`
        );
      }
      if (putResponses.length !== 1) {
        throw new Error(
          `Expected exactly one response for PUT .../v1/stores/${storeId}, observed ` +
            `${putResponses.length}.`
        );
      }
      if (meRequests.length === 0) {
        throw new Error('Expected at least one GET .../v1/auth/me, observed none.');
      }

      const putResponse = putResponses[0];
      const firstMeRequest = meRequests[0];
      if (firstMeRequest.at < putResponse.at) {
        throw new Error(
          `GET .../v1/auth/me started at ${firstMeRequest.at}, before the PUT response arrived at ` +
            `${putResponse.at}. Expected /me to start AFTER the PUT response, not merely at some ` +
            'point during the flow (edit-store.tsx:134-139).'
        );
      }
    },

    expectPutCount: (expected: number) => {
      if (putRequests.length !== expected) {
        const urls = putRequests.map((r) => r.url).join(', ');
        throw new Error(
          `Expected exactly ${expected} PUT(s) to .../v1/stores/${storeId}, observed ` +
            `${putRequests.length}${urls ? `: ${urls}` : ''}.`
        );
      }
    },

    markDocumentBaseline: () => {
      documentBaseline = documentCount;
    },

    expectNoDocumentSince: (context?: string) => {
      const delta = documentCount - documentBaseline;
      if (delta !== 0) {
        throw new Error(
          `Expected zero document-resourceType requests${context ? ` ${context}` : ''}, observed ` +
            `${delta}. A full-page reload (location.reload() or a hard navigation) fires one; a ` +
            "client-side navigate() never does — edit-store.tsx's save flow is expected to use the " +
            'latter (edit-store.tsx:139).'
        );
      }
    },
  };
}
