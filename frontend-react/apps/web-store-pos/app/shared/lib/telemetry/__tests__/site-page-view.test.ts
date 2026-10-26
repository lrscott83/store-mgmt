import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackSitePageView } from '../site-page-view';

const fetchMock = vi.fn();

function firstUrl(): string {
  return fetchMock.mock.calls[0][0] as string;
}

function firstBody(): { events: Record<string, unknown>[] } {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body)) as { events: Record<string, unknown>[] };
}

describe('trackSitePageView — beacon del sitio público', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/login?utm_source=whatsapp&utm_medium=social');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://wa.me/5355555555',
    });
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: undefined });
    Object.defineProperty(window, 'doNotTrack', { configurable: true, value: undefined });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('manda un page_view anónimo con ruta, referrer y UTM', () => {
    trackSitePageView('/login');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstUrl()).toContain('/v1/public/site/events');
    expect(firstBody().events).toEqual([
      expect.objectContaining({
        name: 'page_view',
        path: '/login',
        referrer: 'https://wa.me/5355555555',
        utmSource: 'whatsapp',
        utmMedium: 'social',
      }),
    ]);
  });

  it('no manda nada para una página fuera de la lista', () => {
    trackSitePageView('/help/tutorial');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respeta DoNotTrack', () => {
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '1' });

    trackSitePageView('/');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nunca lanza si la red falla', () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    expect(() => trackSitePageView('/register')).not.toThrow();
  });
});
