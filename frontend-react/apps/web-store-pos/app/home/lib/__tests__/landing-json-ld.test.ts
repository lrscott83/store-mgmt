import { describe, it, expect, afterEach } from 'vitest';
import type { PublicPlanPricing } from '../public-plan-pricing';
import { applyPlanOffersToDocument, buildPlanOffers } from '../landing-json-ld';

function plan(overrides: Partial<PublicPlanPricing>): PublicPlanPricing {
  return {
    planType: 'Pago',
    name: 'Pago',
    order: 2,
    basePrice: 0,
    currentPrice: 0,
    modules: [],
    ...overrides,
  };
}

const PLANS: PublicPlanPricing[] = [
  plan({ planType: 'Superior', name: 'Superior', order: 3, currentPrice: 10 }),
  plan({ planType: 'Gratis', name: 'Gratis', order: 1, currentPrice: 0 }),
  plan({ planType: 'Pago', name: 'Pago', order: 2, currentPrice: 5 }),
];

const BASE_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'VendeDTo',
      url: 'https://pos.test/',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'VendeDTo',
      url: 'https://pos.test/',
    },
  ],
};

function seedJsonLd(payload: unknown = BASE_JSON_LD): HTMLScriptElement {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload);
  document.head.appendChild(script);
  return script;
}

function readJsonLd(script: HTMLScriptElement) {
  return JSON.parse(script.textContent ?? '{}');
}

afterEach(() => {
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((node) => node.remove());
});

describe('buildPlanOffers', () => {
  it('maps every plan to an Offer ordered by the plan order, priced from currentPrice', () => {
    const offers = buildPlanOffers(PLANS);

    expect(offers).toEqual([
      { name: 'Gratis', price: '0.00', priceCurrency: 'USD' },
      { name: 'Pago', price: '5.00', priceCurrency: 'USD' },
      { name: 'Superior', price: '10.00', priceCurrency: 'USD' },
    ]);
  });

  it('drops plans whose price is not a usable number', () => {
    const offers = buildPlanOffers([
      plan({ name: 'Rota', currentPrice: Number.NaN }),
      plan({ name: 'Negativa', currentPrice: -1 }),
      plan({ name: 'Buena', currentPrice: 2.5 }),
    ]);

    expect(offers).toEqual([{ name: 'Buena', price: '2.50', priceCurrency: 'USD' }]);
  });

  it('returns an empty list for no plans', () => {
    expect(buildPlanOffers([])).toEqual([]);
  });
});

describe('applyPlanOffersToDocument', () => {
  it('adds offers to the SoftwareApplication node and keeps the rest of the graph intact', () => {
    const script = seedJsonLd();

    expect(applyPlanOffersToDocument(PLANS, document)).toBe(true);

    const payload = readJsonLd(script);
    const app = payload['@graph'].find(
      (node: { '@type': string }) => node['@type'] === 'SoftwareApplication',
    );
    const organization = payload['@graph'].find(
      (node: { '@type': string }) => node['@type'] === 'Organization',
    );

    expect(organization).toEqual(BASE_JSON_LD['@graph'][0]);
    expect(app.offers).toEqual([
      { '@type': 'Offer', name: 'Gratis', price: '0.00', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Pago', price: '5.00', priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Superior', price: '10.00', priceCurrency: 'USD' },
    ]);
  });

  it('replaces the offers on a second run instead of stacking them', () => {
    const script = seedJsonLd();

    applyPlanOffersToDocument(PLANS, document);
    applyPlanOffersToDocument([plan({ name: 'Pago', currentPrice: 7 })], document);

    const app = readJsonLd(script)['@graph'].find(
      (node: { '@type': string }) => node['@type'] === 'SoftwareApplication',
    );
    expect(app.offers).toEqual([
      { '@type': 'Offer', name: 'Pago', price: '7.00', priceCurrency: 'USD' },
    ]);
  });

  it('leaves the document untouched when there is no JSON-LD script (dev server)', () => {
    expect(applyPlanOffersToDocument(PLANS, document)).toBe(false);
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0);
  });

  it('does not throw on malformed JSON or a graph without SoftwareApplication', () => {
    const broken = seedJsonLd('{ not json');

    expect(applyPlanOffersToDocument(PLANS, document)).toBe(false);
    expect(broken.textContent).toBe('{ not json');

    broken.remove();
    seedJsonLd({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization' }] });

    expect(applyPlanOffersToDocument(PLANS, document)).toBe(false);
  });

  it('does nothing when the plan list is empty (endpoint down)', () => {
    const script = seedJsonLd();
    const before = script.textContent;

    expect(applyPlanOffersToDocument([], document)).toBe(false);
    expect(script.textContent).toBe(before);
  });
});
