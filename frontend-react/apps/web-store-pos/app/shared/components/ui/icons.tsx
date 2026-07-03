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

/** Material `settings` (gear, per-card action-menu trigger, e.g. `users.component.html:26`). */
export function SettingsIcon({ className = '' }: IconProps) {
  return (
    <svg className={`${BASE} ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/** Material `close` (modal header/footer close button, e.g. edit-expense-modal.component.html:7,71). */
export function CloseIcon({ className = '' }: IconProps) {
  return (
    <svg className={`${BASE} ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/** Material `save` (modal footer save/insert-or-update button, edit-expense-modal.component.html:75). */
export function SaveIcon({ className = '' }: IconProps) {
  return (
    <svg className={`${BASE} ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 21h14a2 2 0 002-2V8l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2zM7 3v6h8V3M7 21v-8h10v8"
      />
    </svg>
  );
}

/** Material `delete` (row action, warn-colored — entry-list/expense-list "Eliminar"). */
export function TrashIcon({ className = '' }: IconProps) {
  return (
    <svg className={`${BASE} ${className}`.trim()} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9.5 4h5a1 1 0 011 1v2h-7V5a1 1 0 011-1zM4 7h16"
      />
    </svg>
  );
}

/**
 * Payment-method icon (Angular `bi-cash-stack`/`bi-credit-card`/`bi-phone`, always tinted
 * `text-success`). `kind` mirrors `getPaymentTypeIconKind` (`~/shared/lib/payment-type-icon`).
 * Same SVG paths as the local `PaymentTypeIcon` in `cart-shell.tsx`, extracted here so other
 * modules (Expenses) can reuse them without duplicating markup.
 */
export function PaymentMethodIcon({ kind, className = '' }: IconProps & { kind: 'cash' | 'card' | 'phone' | 'dollar' }) {
  const cls = `h-4 w-4 shrink-0 ${className}`.trim();
  if (kind === 'cash') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 6h18M3 6v12a1 1 0 001 1h16a1 1 0 001-1V6M3 6l2-3h14l2 3M12 10a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
      </svg>
    );
  }
  if (kind === 'card') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zM2 10h20M6 15h4" />
      </svg>
    );
  }
  if (kind === 'phone') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 3h10a1 1 0 011 1v16a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2" />
      </svg>
    );
  }
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2m0-8c1.11 0 2.08.402 2.599 1M9.401 15c.52.598 1.489 1 2.599 1" />
    </svg>
  );
}

/**
 * Empty-state "boxes" icon — Angular's byte-identical inline SVG path
 * (inventory-today-quantities.component.html empty-state, 64×64, stroke-width 1.5).
 */
export function EmptyBoxesIcon({ className = '' }: IconProps) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
      aria-hidden="true"
    >
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

/**
 * Empty-state "trending" icon — Angular's byte-identical inline SVG path
 * (inventory-today-sales-profit.component.html empty-state, 64×64, stroke-width 1.5).
 */
export function EmptyTrendingIcon({ className = '' }: IconProps) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
