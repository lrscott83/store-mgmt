import { createContext, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';
import { BanIcon, CheckCircleIcon, EditIcon, PayIcon, PlusIcon, SettingsIcon, TrashIcon } from './icons';

export type ActionIntent =
  | 'edit'
  | 'create'
  | 'pay'
  | 'activate'
  | 'deactivate'
  | 'approve'
  | 'disapprove'
  | 'delete';

interface IntentStyle {
  fg: string;
  hover: string;
  icon: ReactNode;
}

// Single source of truth for the intent -> color/icon map (design ADR-2).
const INTENT_STYLES: Record<ActionIntent, IntentStyle> = {
  edit: { fg: 'text-primary', hover: 'hover:bg-primary/10', icon: <EditIcon /> },
  create: { fg: 'text-primary', hover: 'hover:bg-primary/10', icon: <PlusIcon /> },
  pay: { fg: 'text-success', hover: 'hover:bg-success/10', icon: <PayIcon /> },
  activate: { fg: 'text-success', hover: 'hover:bg-success/10', icon: <CheckCircleIcon /> },
  approve: { fg: 'text-success', hover: 'hover:bg-success/10', icon: <CheckCircleIcon /> },
  deactivate: { fg: 'text-warning', hover: 'hover:bg-warning/10', icon: <BanIcon /> },
  disapprove: { fg: 'text-warning', hover: 'hover:bg-warning/10', icon: <BanIcon /> },
  delete: { fg: 'text-danger', hover: 'hover:bg-danger/10', icon: <TrashIcon /> },
};

const NEUTRAL_STYLE: IntentStyle = { fg: 'text-text', hover: 'hover:bg-primary/10', icon: null };

interface ActionMenuContextValue {
  close: () => void;
}

const ActionMenuContext = createContext<ActionMenuContextValue | null>(null);

interface ActionMenuProps {
  /** Accessible name for the gear trigger. Default 'Acciones'. */
  label?: string;
  /** data-testid forwarded to the trigger button. */
  testId?: string;
  /** Tailwind width utility for the dropdown. Default 'w-44'. */
  widthClass?: string;
  /** ActionMenuItem children. */
  children: ReactNode;
}

/**
 * Shared gear/action dropdown primitive — single source of truth for the trigger chrome,
 * dropdown container, `useClickOutside` close behavior, and (via `ActionMenuItem`) the
 * `intent -> color` map. See openspec/changes/gear-menu-action-styling/design.md.
 */
export function ActionMenu({ label = 'Acciones', testId, widthClass = 'w-44', children }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setIsOpen(false));

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={label}
        aria-expanded={isOpen}
        data-testid={testId}
        className="rounded-full p-1.5 text-primary hover:bg-primary-light transition-colors"
      >
        <SettingsIcon />
      </button>
      {isOpen && (
        <div
          role="menu"
          className={`absolute right-0 top-full z-10 mt-1 ${widthClass} rounded-xl border border-border bg-surface shadow-lg py-1`}
        >
          <ActionMenuContext.Provider value={{ close: () => setIsOpen(false) }}>
            {children}
          </ActionMenuContext.Provider>
        </div>
      )}
    </div>
  );
}

interface ActionMenuItemProps {
  /** Drives foreground color + default icon. Omit for a neutral item (escape hatch). */
  intent?: ActionIntent;
  onClick: () => void;
  /** Label text (usually intl.formatMessage(...)). */
  children: ReactNode;
  /** Override/supply the leading icon. Pass `null` to render no icon. */
  icon?: ReactNode | null;
  /** Renders a thin divider line above this item (destructive grouping). */
  separatorBefore?: boolean;
  'data-testid'?: string;
}

export function ActionMenuItem({
  intent,
  onClick,
  children,
  icon,
  separatorBefore = false,
  'data-testid': dataTestId,
}: ActionMenuItemProps) {
  const ctx = useContext(ActionMenuContext);
  const s = intent ? INTENT_STYLES[intent] : NEUTRAL_STYLE;
  const resolvedIcon = icon !== undefined ? icon : s.icon;

  return (
    <>
      {separatorBefore && <div role="separator" className="my-1 border-t border-border" />}
      <button
        type="button"
        role="menuitem"
        data-testid={dataTestId}
        onClick={() => {
          ctx?.close();
          onClick();
        }}
        className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${s.fg} ${s.hover} transition-colors`}
      >
        {resolvedIcon}
        {children}
      </button>
    </>
  );
}
