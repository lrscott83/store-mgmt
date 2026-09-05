import Swal from 'sweetalert2';

/**
 * Thin wrapper around SweetAlert2's `Swal.fire`, matching Angular's usage 1:1. Angular
 * (`frontend/`) has NO global `Swal.mixin`/theme override anywhere (confirmed by a repo-wide
 * grep for `Swal.mixin`/`SweetAlert`) — every call site uses stock library defaults, so React
 * does too. Kept as a small named-function wrapper (not raw `Swal.fire` calls scattered across
 * components) so call sites stay declarative and tests can mock this module directly instead
 * of mocking `sweetalert2` in every consumer test.
 */

/**
 * Blocking, OK-only error alert. Mirrors Angular's most common error shape — e.g.
 * `sale-product-row.component.ts:68-74/:117-121`, `sale-credit-payment-modal.component.ts:71-75`,
 * `edit-sale-credit-modal.component.ts:66-70`, `edit-order-modal.component.ts:49-53` — all of
 * which call `Swal.fire({ icon: 'error', title, text })` with NO `showCancelButton` and NO
 * `confirmButtonText` override, so SweetAlert2's own default confirm button is shown
 * (Angular never translates it at these call sites — preserved verbatim, not "fixed").
 */
export function showBlockingError(title: string, message: string): void {
  void Swal.fire({ icon: 'error', title, text: message });
}

/**
 * Blocking success alert. React has no toast system, so Angular's `toastrService.success(...)`
 * notifications (e.g. `csv-product-importer-modal.component.ts:64` handleSuccess) are surfaced
 * through the app's standard Swal wrapper instead — same message, blocking instead of a
 * non-blocking toast. No title (Angular's toastr success shows the message only). Returns the
 * promise so sequential dialogs can be awaited.
 */
export function showBlockingSuccess(message: string): Promise<void> {
  return Swal.fire({ icon: 'success', text: message }).then(() => undefined);
}

/**
 * Blocking info alert. Mirrors Angular's `Swal.fire({ icon: 'info', title, text })` — e.g. the
 * conditional "some products already exist" dialog in `csv-product-importer-modal.component.ts:56-62`.
 * Returns the promise so it can be awaited after another dialog.
 */
export function showBlockingInfo(title: string, message: string): Promise<void> {
  return Swal.fire({ icon: 'info', title, text: message }).then(() => undefined);
}

/**
 * Blocking info alert with an HTML body (SweetAlert2 `html` option instead of `text`).
 * Used when the message needs light markup (e.g. the wholesale tiers popup). The HTML is
 * built by the caller from numeric/trusted data only — never from free-form user input.
 */
export function showBlockingInfoHtml(title: string, html: string): Promise<void> {
  return Swal.fire({ icon: 'info', title, html }).then(() => undefined);
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmButtonText: string;
  cancelButtonText: string;
}

/**
 * Blocking confirm/cancel dialog. Mirrors Angular's confirm shape — e.g.
 * `sale-credit-payment-modal.component.ts:52-60`, `order-item-list.component.ts:35-44` — both
 * `Swal.fire({ title, text, icon: 'question', showCancelButton: true,
 * confirmButtonColor: '#3456ff', cancelButtonColor: '#dc3545', confirmButtonText, cancelButtonText })`.
 * Resolves to `true` only when the user clicks the confirm button (`result.isConfirmed`);
 * cancel, backdrop click, or Escape all resolve to `false`, matching Angular's
 * `.then(result => { if (result.isConfirmed) ... })` guard.
 */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return Swal.fire({
    title: options.title,
    text: options.message,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#3456ff',
    cancelButtonColor: '#dc3545',
    confirmButtonText: options.confirmButtonText,
    cancelButtonText: options.cancelButtonText,
  }).then((result) => result.isConfirmed);
}

export interface AcknowledgeErrorOptions {
  title: string;
  message: string;
  confirmButtonText: string;
  /**
   * Defaults to 'error'. `nav-right.component.ts:164-206` (`createOrder` validation guards —
   * empty cart / payment < total / credit without client) uses this SAME OK-only shape
   * (showCancelButton false, #3456ff/#dc3545, translated confirmButtonText) but with
   * `icon: 'info'` instead of 'error' — reuse this wrapper rather than adding a near-duplicate.
   */
  icon?: 'error' | 'info';
}

/**
 * Blocking, OK-only alert with an EXPLICIT translated confirm button and Angular's button
 * colors. Mirrors `order-item-list.component.ts:124-135` (`showErrorMessage`, icon 'error') and
 * `nav-right.component.ts:164-206` (`createOrder` validation guards, icon 'info') — both
 * override `confirmButtonText` and set both button colors, distinct from the simpler
 * `showBlockingError`/`showBlockingInfo` shapes (which use SweetAlert2's default button).
 */
export function showAcknowledgeError(options: AcknowledgeErrorOptions): void {
  void Swal.fire({
    title: options.title,
    text: options.message,
    icon: options.icon ?? 'error',
    showCancelButton: false,
    confirmButtonColor: '#3456ff',
    cancelButtonColor: '#dc3545',
    confirmButtonText: options.confirmButtonText,
  });
}

/**
 * Blocking "new version available" dialog. Mirrors Angular's
 * `_services/update/update.service.ts` `showUpdateDialog()` VERBATIM (title, text, icon,
 * `allowOutsideClick`/`allowEscapeKey: false`, `confirmButtonText`, `customClass`) — this is
 * the ONE call site in Angular's Swal usage that hardcodes its Spanish text directly (no i18n
 * key), so React does the same rather than routing it through `es.ts`. No cancel button:
 * the user MUST confirm to update (or leave it running the stale version until next visit).
 */
export function showUpdateAvailable(onConfirm: () => void): Promise<void> {
  return Swal.fire({
    title: '¡Nueva versión disponible!',
    text: 'Se ha detectado una nueva versión de la aplicación.',
    icon: 'info',
    showConfirmButton: true,
    allowOutsideClick: false,
    allowEscapeKey: false,
    confirmButtonText: 'Actualizar ahora',
    customClass: {
      confirmButton: 'swal2-confirm swal2-styled',
    },
  }).then((result) => {
    if (result.isConfirmed) {
      onConfirm();
    }
  });
}
