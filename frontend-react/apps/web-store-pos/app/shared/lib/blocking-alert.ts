/**
 * Thin wrapper around the browser's native window.alert — the established "blocking, native
 * browser dialog" pattern already used by this codebase (see
 * app/shared/lib/hooks/use-unsaved-changes-prompt.ts's window.confirm for the analogous
 * "blocking confirm" case). Mirrors Angular's Swal.fire({ icon: 'error', title, text })
 * semantics (sale-product-row.component.ts:68-74): halts execution until the user dismisses
 * it, single acknowledge action (Angular's showCancelButton is commented out there — plain
 * OK-only alert, not a confirm/cancel dialog).
 *
 * No new modal library introduced. Kept to a single function so callers/tests can mock
 * window.alert directly instead of a component-level modal API.
 */
export function showBlockingError(title: string, message: string): void {
  window.alert(`${title}\n\n${message}`);
}
