import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

vi.mock('~/shared/lib/diagnostics/client-log', () => ({
  logClientError: vi.fn(),
}));

import { ErrorBoundary } from '../app-layout';
import { logClientError } from '~/shared/lib/diagnostics/client-log';

const GENERIC_EXPLANATION =
  'Por favor, vuelva a intentarlo y si persiste el error contacte al equipo de soporte técnico.';

const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');

function renderBoundary(error: unknown = new Error('app-layout data strategy failure')) {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <MemoryRouter initialEntries={['/movements/new']}>
        <Routes>
          <Route path="/" element={<div>home-screen</div>} />
          <Route path="*" element={<ErrorBoundary error={error} />} />
        </Routes>
      </MemoryRouter>
    </IntlProvider>,
  );
}

function stubReload() {
  const reload = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, reload },
  });
  return reload;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  if (originalLocationDescriptor) {
    Object.defineProperty(window, 'location', originalLocationDescriptor);
  }
});

describe('AppLayout ErrorBoundary — recovery screen', () => {
  it('renders the generic application error heading and one explanation line', () => {
    renderBoundary();

    expect(screen.getByRole('heading', { name: 'Error' })).toBeInTheDocument();
    expect(screen.getByText(GENERIC_EXPLANATION)).toBeInTheDocument();
  });

  it('does not render the authenticated chrome (no sidebar/navbar/footer)', () => {
    const { container } = renderBoundary();

    expect(
      screen.queryByRole('navigation', { name: 'Navegación principal' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Alternar barra lateral' }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('footer')).toBeNull();
  });

  it('retry action reloads the page', () => {
    const reload = stubReload();
    renderBoundary();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('home action navigates to the app home route', () => {
    renderBoundary();

    fireEvent.click(screen.getByRole('button', { name: 'Ir al inicio' }));

    expect(screen.getByText('home-screen')).toBeInTheDocument();
  });

  it('reports the error through the diagnostics seam', () => {
    const error = new Error('No result returned from dataStrategy for route app-layout');
    renderBoundary(error);

    expect(logClientError).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: 'No result returned from dataStrategy for route app-layout',
        location: expect.stringContaining('No result returned from dataStrategy'),
      }),
    );
  });

  it('renders the raw error detail in DEV', () => {
    renderBoundary(new Error('data strategy exploded'));

    expect(screen.getByText(/data strategy exploded/)).toBeInTheDocument();
  });

  it('hides the raw error detail outside DEV', () => {
    vi.stubEnv('DEV', false);
    renderBoundary(new Error('data strategy exploded'));

    expect(screen.queryByText(/data strategy exploded/)).not.toBeInTheDocument();
    expect(screen.getByText(GENERIC_EXPLANATION)).toBeInTheDocument();
  });
});
