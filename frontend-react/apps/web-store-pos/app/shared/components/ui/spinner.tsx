interface SpinnerProps {
  label: string;
  className?: string;
}

/**
 * Loading indicator, matching Angular's Bootstrap `.spinner-border.text-primary` +
 * "Cargando..." caption (e.g. inventory-today-quantities.component.html, inventory-today-
 * sales-profit.component.html — `isLoading` branch).
 */
export function Spinner({ label, className = '' }: SpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 ${className}`.trim()}>
      <div
        role="status"
        aria-label={label}
        className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
      />
      <p className="text-text-muted">{label}</p>
    </div>
  );
}
