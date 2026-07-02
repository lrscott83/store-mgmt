/**
 * Small inline SVG icons matching the Material icons Angular renders inside
 * `mat-fab extended` buttons (add / attach_file / edit). Outline style, 24px
 * viewBox, `currentColor` stroke — consistent with the other inline SVGs in the
 * app (e.g. the product-row settings gear). Sized to sit inline in button text.
 */

type IconProps = { className?: string };

const BASE = 'h-5 w-5 shrink-0';

/** Material `add`. */
export function PlusIcon({ className = '' }: IconProps) {
  return (
    <svg className={`${BASE} ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

/** Material `attach_file`. */
export function PaperclipIcon({ className = '' }: IconProps) {
  return (
    <svg className={`${BASE} ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32a1.5 1.5 0 01-2.122-2.122l7.81-7.81"
      />
    </svg>
  );
}

/** Material `edit`. */
export function EditIcon({ className = '' }: IconProps) {
  return (
    <svg className={`${BASE} ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
      />
    </svg>
  );
}
