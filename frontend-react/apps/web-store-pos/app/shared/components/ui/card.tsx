import type { ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Base card container, matching Angular's `.card` (`themes/components/card.scss`):
 * rounded surface, subtle shadow, optional header/footer with border separators.
 */
export function Card({ title, footer, children, className = '' }: CardProps) {
  return (
    <div
      data-slot="card"
      className={`rounded-lg bg-surface shadow-card ${className}`.trim()}
    >
      {title !== undefined && (
        <div data-slot="card-header" className="border-b border-border px-6 py-4">
          <h5 className="text-sm font-semibold text-text">{title}</h5>
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
