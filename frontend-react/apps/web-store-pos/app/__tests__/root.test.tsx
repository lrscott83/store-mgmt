import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mockNavigate = vi.fn();
const mockRegisterAuthRedirect = vi.fn();

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('~/shared/lib/stores/auth-store', () => ({
  registerAuthRedirect: (fn: (path: string) => void) => mockRegisterAuthRedirect(fn),
}));

vi.mock('~/shared/lib/pwa/service-worker-registration', () => ({
  registerServiceWorker: vi.fn(),
}));

vi.mock('~/shared/lib/usage/use-store-usage-tracker', () => ({
  useStoreUsageTracker: vi.fn(),
}));

vi.mock('~/shared/lib/i18n/i18n-provider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import App from '../root';

describe('App (root) — registers the auth-store redirect handler on mount (Decision 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls registerAuthRedirect with the router navigate function on mount', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(mockRegisterAuthRedirect).toHaveBeenCalledWith(mockNavigate);
  });
});
