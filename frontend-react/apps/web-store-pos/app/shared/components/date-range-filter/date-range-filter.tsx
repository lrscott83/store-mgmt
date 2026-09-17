import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { SearchIcon } from '~/shared/components/ui/icons';

export interface DateRangeFilterProps {
  /** Applied range — start/end as LOCAL calendar dates (midnight). null = no bound. */
  value: { start: Date | null; end: Date | null };
  /** Fired when the user clicks the magnifier button with the COMMITTED selection. */
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
 * Shared date-range filter: one readonly textbox showing the COMMITTED
 * selection (dd/mm/yyyy, no leading zeros) next to a magnifying-glass button
 * that applies the committed selection to the current view. The textbox opens
 * a small popover with two native date inputs — "Seleccionar" commits the
 * draft to the selection (the lupa then applies it), "Limpiar" resets both
 * selection and draft and immediately applies an empty range. Only the lupa
 * triggers `onApply`.
 */
export function DateRangeFilter({ value, onApply, className = '' }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<{ start: Date | null; end: Date | null }>(value);
  const [draft, setDraft] = useState<{ start: Date | null; end: Date | null }>(value);

  // Sync the selection from the parent whenever the APPLIED range changes.
  useEffect(() => {
    setSelection({ start: value.start, end: value.end });
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

  const invalid =
    draft.start !== null && draft.end !== null && draft.end.getTime() < draft.start.getTime();

  const display =
    selection.start || selection.end
      ? `${selection.start ? formatLocalDayNoPad(selection.start) : 'dd/mm/aaaa'} - ${
          selection.end ? formatLocalDayNoPad(selection.end) : 'dd/mm/aaaa'
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
        onClick={() => {
          setDraft({ start: selection.start, end: selection.end });
          setOpen(true);
        }}
        aria-label="Rango de fechas"
        className="flex-1 min-w-0 rounded border border-border bg-surface px-2 py-1 text-sm"
      />
      <button
        type="button"
        data-testid="date-range-filter-button"
        aria-label="Buscar"
        onClick={() => onApply({ start: selection.start, end: selection.end })}
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
                  min={draft.start ? toIsoLocal(draft.start) : undefined}
                  onChange={handleEndChange}
                  className="mt-0.5 w-full rounded border border-border bg-surface px-2 py-1 text-sm"
                />
              </label>
              {invalid && (
                <p data-testid="date-range-filter-invalid" className="text-xs text-danger">
                  El fin debe ser igual o posterior al inicio
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  data-testid="date-range-filter-clear"
                  onClick={() => {
                    setDraft({ start: null, end: null });
                    setSelection({ start: null, end: null });
                    setOpen(false);
                    onApply({ start: null, end: null });
                  }}
                  className="rounded border border-border px-2 py-1 text-sm text-text-muted hover:bg-gray-100"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  data-testid="date-range-filter-select"
                  disabled={invalid}
                  onClick={() => {
                    setSelection({ start: draft.start, end: draft.end });
                    setOpen(false);
                  }}
                  className="rounded bg-primary px-2 py-1 text-sm text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Seleccionar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}