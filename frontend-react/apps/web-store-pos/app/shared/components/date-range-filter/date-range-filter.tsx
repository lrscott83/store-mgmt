import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { SearchIcon } from '~/shared/components/ui/icons';

export interface DateRangeFilterProps {
  /** Applied range — start/end as LOCAL calendar dates (midnight). null = no bound. */
  value: { start: Date | null; end: Date | null };
  /** Fired when the user clicks the magnifier button with the current draft. */
  onApply: (range: { start: Date | null; end: Date | null }) => void;
  /** Extra classes (e.g. "flex-1 min-w-0") to help the filter stretch in a wrapping row. */
  className?: string;
}

const PLACEHOLDER = 'dd/mm/aaaa - dd/mm/aaaa';

/** Formats a LOCAL calendar date WITHOUT leading zeros: 3/2/2026. */
function formatLocalDayNoPad(date: Date): string {
  const d = new Date(date);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Local `YYYY-MM-DD` — the format the native date inputs read/write. */
function toIsoLocal(date: Date): string {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Parses a native date-input value (`YYYY-MM-DD`) into LOCAL midnight; '' → null. */
function fromIsoLocal(iso: string): Date | null {
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Shared date-range filter: one readonly textbox showing the DRAFT range
 * (dd/mm/yyyy, no leading zeros) next to a magnifying-glass button that
 * applies the draft to the current view. The textbox opens a small popover
 * with two native date inputs ("Aplicar" keeps the draft, "Limpiar" resets
 * it) — only the lupa triggers `onApply`.
 */
export function DateRangeFilter({ value, onApply, className = '' }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ start: Date | null; end: Date | null }>(value);

  // Sync the draft from the parent whenever the APPLIED range changes.
  useEffect(() => {
    setDraft({ start: value.start, end: value.end });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the applied range only
  }, [value.start?.getTime(), value.end?.getTime()]);

  // Escape closes the popover (outside-click close is the transparent overlay).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function handleStartChange(e: ChangeEvent<HTMLInputElement>) {
    setDraft((prev) => ({ ...prev, start: fromIsoLocal(e.target.value) }));
  }

  function handleEndChange(e: ChangeEvent<HTMLInputElement>) {
    setDraft((prev) => ({ ...prev, end: fromIsoLocal(e.target.value) }));
  }

  const display =
    draft.start || draft.end
      ? `${draft.start ? formatLocalDayNoPad(draft.start) : 'dd/mm/aaaa'} - ${
          draft.end ? formatLocalDayNoPad(draft.end) : 'dd/mm/aaaa'
        }`
      : '';

  return (
    <div className={`relative flex items-center gap-1 min-w-0 ${className}`.trim()}>
      <input
        data-testid="date-range-filter-input"
        type="text"
        readOnly
        value={display}
        placeholder={PLACEHOLDER}
        onClick={() => setOpen(true)}
        aria-label="Rango de fechas"
        className="flex-1 min-w-0 rounded border border-border bg-surface px-2 py-1 text-sm"
      />
      <button
        type="button"
        data-testid="date-range-filter-button"
        aria-label="Buscar"
        onClick={() => onApply({ start: draft.start, end: draft.end })}
        className="rounded border border-border bg-surface px-2 py-1 text-text hover:bg-gray-100"
      >
        <SearchIcon className="h-4 w-4" />
      </button>
      {open && (
        <>
          {/* Transparent overlay — closes the popover on outside click. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-surface p-2 shadow-lg">
            <div className="space-y-2">
              <label className="block">
                <span className="text-xs text-text-muted">Desde</span>
                <input
                  type="date"
                  data-testid="date-range-filter-start"
                  value={draft.start ? toIsoLocal(draft.start) : ''}
                  onChange={handleStartChange}
                  className="mt-0.5 w-full rounded border border-border bg-surface px-2 py-1 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-text-muted">Hasta</span>
                <input
                  type="date"
                  data-testid="date-range-filter-end"
                  value={draft.end ? toIsoLocal(draft.end) : ''}
                  onChange={handleEndChange}
                  className="mt-0.5 w-full rounded border border-border bg-surface px-2 py-1 text-sm"
                />
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  data-testid="date-range-filter-clear"
                  onClick={() => {
                    setDraft({ start: null, end: null });
                    setOpen(false);
                  }}
                  className="rounded border border-border px-2 py-1 text-sm text-text-muted hover:bg-gray-100"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  data-testid="date-range-filter-apply"
                  onClick={() => setOpen(false)}
                  className="rounded bg-primary px-2 py-1 text-sm text-white hover:bg-primary-hover"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}