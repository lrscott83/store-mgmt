import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'fab';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'rounded-md px-4 py-2 shadow-card bg-primary text-white hover:bg-primary-hover',
  secondary: 'rounded-md px-4 py-2 shadow-card bg-secondary text-white hover:opacity-90',
  danger: 'rounded-md px-4 py-2 shadow-card bg-danger text-white hover:opacity-90',
  outline: 'rounded-md px-4 py-2 shadow-card border border-primary text-primary bg-transparent hover:bg-primary-light',
  // Extended FAB, matching Angular's `mat-fab extended` prominent actions (e.g. Products'
  // "+ Categoría" / "Importar Productos"): pill-shaped, filled purple, white text, elevated
  // shadow, comfortable padding.
  fab: 'rounded-full px-6 py-3 shadow-lg bg-primary text-white hover:bg-primary-hover',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

/**
 * Base button, styled to match Angular's Material `mat-raised-button`/`mat-flat-button`
 * look: rounded corners, purple primary, subtle shadow. See design tokens in
 * `@store-mgmt/web-common/styles.css`. Use `variant="fab"` for prominent actions that
 * match Angular's `mat-fab extended` pill-shaped buttons.
 */
export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  const variantClasses = VARIANT_CLASSES[variant];
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses} ${className}`.trim()}
      {...props}
    />
  );
}

interface FloatingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  'aria-label': string;
}

/**
 * Floating action button, matching Angular's `mat-fab` (circular, primary color,
 * elevated shadow, fixed-position container is left to the caller).
 */
export function FloatingButton({ className = '', type = 'button', ...props }: FloatingButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
      {...props}
    />
  );
}
