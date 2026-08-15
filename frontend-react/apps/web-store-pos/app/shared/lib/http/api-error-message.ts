import { isNetworkError } from './http-error';

/** The `code` of a backend validation error is the raw FluentValidation
 *  `PropertyName` (`ValidationException.cs:20`), and its casing varies by command:
 *  `"Cellphone"` on create, `"CellPhone"` on update. Normalized to lowercase before
 *  comparison — ADR-2 (design.md). */
export const API_ERROR_CODE_CELL_PHONE = 'cellphone';

export interface ApiErrorMessageOptions {
  /** Keys MUST be lowercase. Wins over `byStatus` — ADR-4 (design.md). */
  byCode?: Record<string, string>;
  byStatus?: Record<number, string>;
  /** Required and explicit: never returned blank — ADR-4 (design.md). */
  fallback: string;
}

interface BackendError {
  code?: unknown;
}

interface RejectionShape {
  response?: {
    status?: number;
    data?: {
      errors?: unknown;
    };
  };
}

interface EnvelopeShape {
  succeeded?: boolean;
  errors?: unknown;
  actionCode?: number | null;
}

function findByCodeMatch(errors: unknown, byCode: Record<string, string> | undefined): string | undefined {
  if (!byCode || !Array.isArray(errors)) return undefined;

  // ADR-3: scan the WHOLE array — a co-failure (e.g. FullName + CellPhone both
  // empty) puts FullName at errors[0] on every validator this change touches.
  for (const entry of errors) {
    const code = (entry as BackendError | null | undefined)?.code;
    if (typeof code !== 'string') continue;
    const mapped = byCode[code.toLowerCase()];
    if (mapped) return mapped;
  }
  return undefined;
}

export function apiErrorMessageId(error: unknown, options: ApiErrorMessageOptions): string {
  const { byCode, byStatus, fallback } = options;

  // A network-layer failure (offline / timeout, tagged by api-client.ts's response
  // interceptor with `isNetworkError`) has no response/status/errors to map — show the
  // connectivity message instead of the generic fallback.
  if (isNetworkError(error)) return 'GENERAL.OFFLINE';

  const rejection = error as RejectionShape | null | undefined;
  const envelope = error as EnvelopeShape | null | undefined;

  // D-1 (owner-error-message.ts): the rejection channel (response.status) wins over
  // the envelope probe, which reads `actionCode` off the TOP level only — never
  // `error.response.data.actionCode`. The two channels are structurally disjoint (a
  // rejection has no top-level actionCode; a resolved envelope has no response), so
  // precedence only matters for the synthetic case that pins it.
  const status =
    rejection?.response?.status ?? (envelope?.succeeded === false ? envelope?.actionCode ?? undefined : undefined);
  const errorsSource =
    rejection?.response?.data?.errors ?? (envelope?.succeeded === false ? envelope?.errors : undefined);

  const byCodeMatch = findByCodeMatch(errorsSource, byCode);
  if (byCodeMatch) return byCodeMatch;

  if (typeof status === 'number' && byStatus?.[status]) return byStatus[status];

  return fallback;
}
