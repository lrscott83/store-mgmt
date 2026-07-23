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
}

/**
 * Base card container, matching Angular's `.card` (`themes/components/card.scss`):
 * rounded surface, subtle shadow, optional header/footer with border separators.
 */
export function Card({ title, headerAction, footer, children, className = '' }: CardProps) {
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
              ? 'flex items-center justify-between gap-2 border-b border-border px-6 py-4'
              : 'border-b border-border px-6 py-4'
          }
        >
          {/* Angular's `.card-label` (h3) renders at ~1.275rem / 500 weight. */}
          <h3 className="text-xl font-semibold text-text">{title}</h3>
          {headerAction !== undefined && (
            <div data-slot="card-toolbar">{headerAction}</div>
          )}
        </div>
      )}
      <div data-slot="card-body" className="p-6">
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
