import { afterEach, describe, expect, it, vi } from 'vitest';
import { showBlockingError } from '../blocking-alert';

// Native window.alert wrapper — the established "blocking, native browser dialog" pattern
// already used by this codebase for use-unsaved-changes-prompt.ts's window.confirm. Mirrors
// Angular's Swal.fire({ icon: 'error', title, text }) semantics (sale-product-row.component.ts
// :68-74): halts until dismissed, single acknowledge action (Angular's showCancelButton is
// commented out there — plain OK-only alert).
describe('showBlockingError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls window.alert with the title and message', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    showBlockingError('Error', 'El producto no existe.');
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [text] = alertSpy.mock.calls[0];
    expect(text).toContain('Error');
    expect(text).toContain('El producto no existe.');
  });
});
