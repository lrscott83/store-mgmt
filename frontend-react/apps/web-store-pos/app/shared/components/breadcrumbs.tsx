import { Link, useLocation, useMatches } from 'react-router';

interface BreadcrumbHandle {
  breadcrumb?: string;
}

interface BreadcrumbItem {
  label: string;
  path: string;
  isLast: boolean;
}

function segmentToLabel(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function Breadcrumbs() {
  const location = useLocation();
  const matches = useMatches();

  // Attempt to derive breadcrumbs from route handles first
  const handleBreadcrumbs: BreadcrumbItem[] = matches
    .filter((m) => (m.handle as BreadcrumbHandle | undefined)?.breadcrumb)
    .map((m, index, arr) => ({
      label: (m.handle as BreadcrumbHandle).breadcrumb!,
      path: m.pathname,
      isLast: index === arr.length - 1,
    }));

  if (handleBreadcrumbs.length > 0) {
    return <BreadcrumbNav items={handleBreadcrumbs} />;
  }

  // Fallback: derive from path segments
  const segments = location.pathname.split('/').filter(Boolean);
  const pathBreadcrumbs: BreadcrumbItem[] = segments.map((segment, index) => ({
    label: segmentToLabel(segment),
    path: '/' + segments.slice(0, index + 1).join('/'),
    isLast: index === segments.length - 1,
  }));

  if (pathBreadcrumbs.length === 0) {
    return null;
  }

  return <BreadcrumbNav items={pathBreadcrumbs} />;
}

function BreadcrumbNav({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-gray-500 px-4 py-2">
      <Link to="/sales/new" className="hover:text-cyan-700 transition-colors">
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
            <Link to={item.path} className="hover:text-cyan-700 transition-colors">
              {item.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
