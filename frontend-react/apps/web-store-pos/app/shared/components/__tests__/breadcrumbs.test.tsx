import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Breadcrumbs } from '../breadcrumbs';

/**
 * Angular's navigation.ts sets `breadcrumbs: false` on EVERY leaf nav item, so
 * the breadcrumb block (`breadcrumb.component.html`) never renders in the
 * running app. React must replicate that: hidden by default everywhere,
 * opt-in only via route `handle.showBreadcrumbs`.
 */
describe('Breadcrumbs — parity: hidden everywhere by default (Angular breadcrumbs:false on all routes)', () => {
  it('renders nothing on a route with no handle', async () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <Breadcrumbs /> }],
      { initialEntries: ['/'] },
    );
    const { container } = render(<RouterProvider router={router} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on a nested route without opt-in', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/sales',
          children: [{ path: 'products', element: <Breadcrumbs /> }],
        },
      ],
      { initialEntries: ['/sales/products'] },
    );
    const { container } = render(<RouterProvider router={router} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders breadcrumb nav when a route opts in via handle.showBreadcrumbs', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/sales',
          children: [
            {
              path: 'products',
              element: <Breadcrumbs />,
              handle: { showBreadcrumbs: true, breadcrumb: 'Catálogo Productos' },
            },
          ],
        },
      ],
      { initialEntries: ['/sales/products'] },
    );
    const { getByLabelText, getByText } = render(<RouterProvider router={router} />);
    expect(getByLabelText('Breadcrumb')).toBeInTheDocument();
    expect(getByText('Catálogo Productos')).toBeInTheDocument();
  });
});
