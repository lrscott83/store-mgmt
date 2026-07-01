import { Link, useMatches } from 'react-router';

interface BreadcrumbHandle {
  breadcrumb?: string;
  /**
   * Opt-in flag. Angular's navigation.ts sets `breadcrumbs: false` on every
   * single leaf nav item, so the breadcrumb block never renders in the
   * running app (see breadcrumb.component.html: `@if (last && breadcrumb.breadcrumbs !== false)`).
   * React replicates that by defaulting to hidden; a route must explicitly
   * set `handle: { showBreadcrumbs: true, breadcrumb: '...' }` to render one.
   */
  showBreadcrumbs?: boolean;
}

interface BreadcrumbItem {
  label: string;
  path: string;
  isLast: boolean;
}

export function Breadcrumbs() {
  const matches = useMatches();

  const handleBreadcrumbs: BreadcrumbItem[] = matches
    .filter((m) => {
      const handle = m.handle as BreadcrumbHandle | undefined;
      return handle?.showBreadcrumbs === true && handle.breadcrumb;
    })
    .map((m, index, arr) => ({
      label: (m.handle as BreadcrumbHandle).breadcrumb!,
      path: m.pathname,
      isLast: index === arr.length - 1,
    }));

  if (handleBreadcrumbs.length === 0) {
    return null;
  }

  return <BreadcrumbNav items={handleBreadcrumbs} />;
}

function BreadcrumbNav({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-gray-500 px-4 py-2">
      <Link to="/sales/new" className="hover:text-primary transition-colors">
        Home
      </Link>
      {items.map((item) => (
        <span key={item.path} className="flex items-center gap-1">
          <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {item.isLast ? (
            <span className="font-medium text-gray-800">{item.label}</span>
          ) : (
            <Link to={item.path} className="hover:text-primary transition-colors">
              {item.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
