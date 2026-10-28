import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { useSitePageView } from '../use-site-page-view';

const trackSitePageViewMock = vi.hoisted(() => vi.fn());

vi.mock('../site-page-view', () => ({
  trackSitePageView: trackSitePageViewMock,
}));

function wrapperFor(initialPath: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  );
}

describe('useSitePageView', () => {
  beforeEach(() => {
    trackSitePageViewMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(['/', '/login', '/register', '/private-police', '/terms-conditions'])(
    'dispara una vista en %s',
    (path) => {
      renderHook(() => useSitePageView(), { wrapper: wrapperFor(path) });

      expect(trackSitePageViewMock).toHaveBeenCalledTimes(1);
      expect(trackSitePageViewMock).toHaveBeenCalledWith(path);
    },
  );

  it.each(['/help/tutorial', '/diagnostics', '/sales/new', '/auth/provision'])(
    'no dispara nada en %s',
    (path) => {
      renderHook(() => useSitePageView(), { wrapper: wrapperFor(path) });

      expect(trackSitePageViewMock).not.toHaveBeenCalled();
    },
  );
});
