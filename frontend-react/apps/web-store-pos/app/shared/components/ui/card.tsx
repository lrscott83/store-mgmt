import type { ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  /** Right-aligned header slot, mirroring Angular's `.card-toolbar` (e.g. the egress
   * "Tipo" selector that sits beside the title in `egress.component.html`). */
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
      {(title !== undefined || headerAction !== undefined) && (
        <div
          data-slot="card-header"
          className="flex items-center justify-between gap-3 border-b border-border px-6 py-4"
        >
          {/* Angular's `.card-label` (h3) renders at ~1.275rem / 500 weight. */}
          {title !== undefined ? (
            <h3 className="text-xl font-semibold text-text">{title}</h3>
          ) : (
            <span />
          )}
          {headerAction}
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
