import type { ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  /**
   * Optional right-aligned header content, mirroring Angular's `.card-toolbar`
   * (e.g. egress.component.html:6-17 renders the "Tipo" selector there). When set,
   * the header lays out as a space-between row with the title on the left.
   */
  headerAction?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * `'default'` (24px / p-6) matches Angular's form/detail card body padding —
   * used unless a route explicitly opts into `'tight'` (8px / p-2), which
   * mirrors Angular's list/table screens. Defaults to `'default'` so existing
   * form/detail/admin-grid cards stay unaffected.
   */
  padding?: 'tight' | 'default';
}

const BODY_PADDING: Record<'tight' | 'default', string> = {
  default: 'p-6',
  tight: 'p-2',
};

const HEADER_PADDING: Record<'tight' | 'default', string> = {
  default: 'px-6 py-4',
  tight: 'px-6 py-2',
};

/**
 * Base card container, matching Angular's `.card` (`themes/components/card.scss`):
 * rounded surface, subtle shadow, optional header/footer with border separators.
 */
export function Card({
  title,
  headerAction,
  footer,
  children,
  className = '',
  padding = 'default',
}: CardProps) {
  const bodyPadding = BODY_PADDING[padding];
  const headerPadding = HEADER_PADDING[padding];

  return (
    <div
      data-slot="card"
      className={`rounded-lg bg-surface shadow-card ${className}`.trim()}
    >
      {title !== undefined && (
        <div
          data-slot="card-header"
          className={
            headerAction !== undefined
              ? `flex items-center justify-between gap-2 border-b border-border ${headerPadding}`
              : `border-b border-border ${headerPadding}`
          }
        >
          {/* Angular's `.card-label` (h3) renders at ~1.275rem / 500 weight. */}
          <h3 className="text-xl font-medium text-text">{title}</h3>
          {headerAction !== undefined && (
            <div data-slot="card-toolbar">{headerAction}</div>
          )}
        </div>
      )}
      <div data-slot="card-body" className={bodyPadding}>
        {children}
      </div>
      {footer !== undefined && (
        <div data-slot="card-footer" className="border-t border-border px-6 py-4">
          {footer}
        </div>
      )}
    </div>
  );
}
