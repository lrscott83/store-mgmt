import type { ReactNode } from 'react';

export type InfoBoxVariant = 'info' | 'primary' | 'danger';

const VARIANT_CLASSES: Record<InfoBoxVariant, string> = {
  // Default: blue "info" tone, matching Angular's <div class="alert alert-info">.
  info: 'bg-secondary/10 text-secondary border border-secondary/20',
  // Purple-tinted, matching Angular's `.alert-light-primary`.
  primary: 'bg-primary-light text-primary border border-primary/20',
  // Matching Angular's `.alert-light-danger` / `.alert-danger`.
  danger: 'bg-danger/10 text-danger border border-danger/20',
};

interface InfoBoxProps {
  variant?: InfoBoxVariant;
  children: ReactNode;
  className?: string;
}

/**
 * Informational banner, matching Angular's Bootstrap `.alert` variants
 * (`alert-light-primary`, `alert-light-danger`, `alert-info`).
 */
export function InfoBox({ variant = 'info', children, className = '' }: InfoBoxProps) {
  return (
    <div
      role="status"
      className={`rounded-md px-4 py-3 text-sm ${VARIANT_CLASSES[variant]} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
