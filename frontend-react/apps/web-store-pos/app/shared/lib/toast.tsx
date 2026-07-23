import type { ReactNode } from 'react';
import { toast } from 'react-toastify';

/**
 * Thin wrapper around react-toastify, mirroring Angular's `ngx-toastr` (`ToastrService`)
 * usage 1:1 (toast-notifications-parity). Kept as small named functions — not scattered raw
 * `toast()` calls at every call site — so tests mock this module directly instead of mocking
 * `react-toastify` in every consumer (modeled on `shared/lib/blocking-alert.ts`).
 */

/**
 * Renders ngx-toastr's (title, message) shape as a single react-toastify content node.
 * Title-less calls (Angular `success(msg)`) render the bare message string; titled calls
 * (Angular `success(msg, title)` / `error(msg, title)`) render a bold title above the message,
 * mirroring ngx-toastr's default markup.
 */
function toastContent(message: string, title?: string): ReactNode {
  if (!title) return message;
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <p>{message}</p>
    </div>
  );
}

/**
 * Non-blocking success toast. Mirrors Angular `toastrService.success(message[, title])`.
 * Dedupe (Angular `preventDuplicates: true`): `toastId` is keyed on the MESSAGE — not the
 * title — so distinct messages sharing the "Éxito"/"Error" title never collapse into one
 * another (ADR-3).
 */
export function showToastSuccess(message: string, title?: string): void {
  toast.success(toastContent(message, title), { toastId: message });
}

/**
 * Non-blocking error toast. Mirrors Angular `toastrService.error(message[, title])`.
 */
export function showToastError(message: string, title?: string): void {
  toast.error(toastContent(message, title), { toastId: message });
}
