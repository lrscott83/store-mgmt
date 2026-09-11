import type { Page, Request as PlaywrightRequest, Response as PlaywrightResponse } from '@playwright/test';
import { E2E_API_URL } from './backend-url';
import {
  createOutcomeQueue,
  matchesPathSuffix,
  resolveCapture,
  type Outcome,
} from './network-observer-core';

/**
 * owner-plan-change observer (NEW support file, never touching the existing
 * `store-network-observer.ts` — E2E support rule).
 *
 * Watches the owner plan-change contract:
 *   - `POST /v1/stores/{storeId}/change-plan` — body + status. This is THE
 *     activation request of owner-plan-change: it carries only
 *     `{ storePlanId }`, never a store payload (the billing anchor can never
 *     ride the activation).
 *   - `PUT /v1/stores/{storeId}` — recorded only so specs can assert it fires
 *     ZERO times during a plan change. The old activation PUT (moduleIds)
 *     must not return (design.md T7.1 regression note).
 *   - `GET /v1/stores/{storeId}/plan` — timestamps, to prove the page re-reads
 *     the plan after the POST (the reflection anchor).
 *
 * Same installation pattern as `store-network-observer.ts`: installed inside
 * the spec file, never as an `auto: true` fixture.
 */

export interface ChangePlanCapture {
  status: number;
  url: string;
  storePlanId: number | null;
  rawBody: string;
}

export interface PlanChangeObserver {
  /** Resolves once the POST change-plan response has been observed. */
  waitForChangePlanResponse(): Promise<ChangePlanCapture>;
  /** REQ: asserts exactly one POST change-plan fired for this store. */
  expectExactlyOneChangePlanPost(): void;
  /** Regression: asserts NO `PUT /v1/stores/{id}` fired since installation. */
  expectNoStorePut(): void;
  /** Count of `GET /v1/stores/{id}/plan` responses observed since installation. */
  planReadCount(): number;
  /** Marks the current document-request count as the baseline for `expectNoDocumentSince()`. */
  markDocumentBaseline(): void;
  /** Throws if any `resourceType() === 'document'` request fired since the baseline (a reload). */
  expectNoDocumentSince(context?: string): void;
}

type EventKind = 'post' | 'put' | 'plan-read';

interface ObservedEvent {
  kind: EventKind;
  phase: 'request' | 'response';
  at: number;
}

export function installPlanChangeObserver(page: Page, storeId: string): PlanChangeObserver {
  const changePlanSuffix = `/v1/stores/${storeId}/change-plan`;
  const putSuffix = `/v1/stores/${storeId}`;
  const planSuffix = `/v1/stores/${storeId}/plan`;
  const events: ObservedEvent[] = [];
  const postRequests: Array<{ url: string }> = [];
  const queue = createOutcomeQueue<ChangePlanCapture>();
  let documentCount = 0;
  let documentBaseline = 0;

  function classify(method: string, url: string): EventKind | null {
    // Exact-suffix matches only: a change-plan POST must never fold into the
    // plain-store PUT/plan matchers below, and a plain-store request must never
    // fold into the change-plan matcher (matchesPathSuffix does not anchor).
    if (method === 'POST' && matchesPathSuffix(url, changePlanSuffix)) return 'post';
    if (method === 'PUT' && matchesPathSuffix(url, putSuffix)) return 'put';
    if (method === 'GET' && matchesPathSuffix(url, planSuffix)) return 'plan-read';
    return null;
  }

  page.on('request', (request: PlaywrightRequest) => {
    if (request.resourceType() === 'document') {
      documentCount += 1;
    }

    const kind = classify(request.method(), request.url());
    if (!kind) return;
    events.push({ kind, phase: 'request', at: Date.now() });
    if (kind === 'post') postRequests.push({ url: request.url() });
  });

  page.on('response', (response: PlaywrightResponse) => {
    const kind = classify(response.request().method(), response.url());
    if (!kind) return;
    events.push({ kind, phase: 'response', at: Date.now() });

    if (kind === 'post') {
      const rawBody = response.request().postData() ?? '';
      let storePlanId: number | null = null;
      try {
        const parsed = JSON.parse(rawBody) as { storePlanId?: unknown };
        if (typeof parsed.storePlanId === 'number') storePlanId = parsed.storePlanId;
      } catch {
        storePlanId = null;
      }
      // Timestamp recorded synchronously before draining the body (same
      // reasoning as store-network-observer.ts:117-124).
      void response
        .text()
        .catch(() => '')
        .then(() => {
          queue.push({
            kind: 'response',
            capture: { status: response.status(), url: response.url(), storePlanId, rawBody },
          });
        });
    }
  });

  return {
    // The queue parks until the response capture arrives — same contract as
    // store-network-observer.ts's waitForPutResponse (the push happens in the
    // .then() of response.text()).
    waitForChangePlanResponse: async () => {
      const outcome: Outcome<ChangePlanCapture> = await queue.take();
      return resolveCapture(outcome, {
        subject: 'tienda',
        rateLimitError: () =>
          new Error(
            `Unexpected 429 on POST .../v1/stores/${storeId}/change-plan — this endpoint carries no ` +
              '[EnableRateLimiting] policy, so a 429 here points at something else.',
          ),
      });
    },

    expectExactlyOneChangePlanPost: () => {
      const reqs = events.filter((e) => e.kind === 'post' && e.phase === 'request');
      const resps = events.filter((e) => e.kind === 'post' && e.phase === 'response');
      if (reqs.length !== 1) {
        throw new Error(
          `Expected exactly one POST .../v1/stores/${storeId}/change-plan, observed ${reqs.length}.`,
        );
      }
      if (resps.length !== 1) {
        throw new Error(
          `Expected exactly one response for POST .../v1/stores/${storeId}/change-plan, observed ` +
            `${resps.length}.`,
        );
      }
    },

    expectNoStorePut: () => {
      const puts = events.filter((e) => e.kind === 'put' && e.phase === 'request');
      if (puts.length !== 0) {
        throw new Error(
          `Expected ZERO PUT .../v1/stores/${storeId} during the plan change, observed ${puts.length}. ` +
            'The old moduleIds activation PUT must not return (owner-plan-change T7.1 regression).',
        );
      }
    },

    planReadCount: () => events.filter((e) => e.kind === 'plan-read' && e.phase === 'response').length,

    markDocumentBaseline: () => {
      documentBaseline = documentCount;
    },

    expectNoDocumentSince: (context?: string) => {
      const delta = documentCount - documentBaseline;
      if (delta !== 0) {
        throw new Error(
          `Expected zero document-resourceType requests${context ? ` ${context}` : ''}, observed ` +
            `${delta}. A full-page reload (location.reload() or a hard navigation) fires one; a ` +
            'client-side state update never does — the plan change reflection is expected to be the ' +
            'latter (store-plan.tsx handleActivate / my-stores.tsx handlePlanActivate).',
        );
      }
    },
  };
}
