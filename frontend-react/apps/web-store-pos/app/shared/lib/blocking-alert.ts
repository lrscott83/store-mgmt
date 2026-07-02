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
}

/**
 * Blocking, OK-only error alert with an EXPLICIT translated confirm button and Angular's
 * button colors. Mirrors `order-item-list.component.ts:124-135` (`showErrorMessage`) —
 * the one Angular call site that overrides `confirmButtonText` (`GENERAL.OK`) and sets both
 * button colors on an error-icon dialog, distinct from the simpler `showBlockingError` shape.
 */
export function showAcknowledgeError(options: AcknowledgeErrorOptions): void {
  void Swal.fire({
    title: options.title,
    text: options.message,
    icon: 'error',
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
