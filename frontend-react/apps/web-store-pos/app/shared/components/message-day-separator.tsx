/**
 * The centered day separator shared by BOTH chat surfaces (the OwnerAdmin
 * header panel and the SuperAdmin inbox), so the markup cannot drift between
 * them.
 *
 * It is a plain `<li>` sibling of the message rows — the list is a
 * `flex flex-col gap-2`, so being a sibling is what keeps the rhythm — and it is
 * visually secondary: a small muted chip, never a bubble. The label stays
 * lowercase (`hoy`, `ayer`, `sábado`, `dd/mm/yyyy`); nothing here uppercases it.
 *
 * It carries no message attributes (`data-mine` / `data-pending`) and is never
 * registered in the per-message `itemRefs` map, which is what keeps it out of
 * the read-receipt measurement entirely.
 */
export function MessageDaySeparator({
  label,
  testId = 'message-day-separator',
}: {
  label: string;
  testId?: string;
}) {
  return (
    <li data-testid={testId} className="flex items-center justify-center">
      <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] text-text-muted">
        {label}
      </span>
    </li>
  );
}
