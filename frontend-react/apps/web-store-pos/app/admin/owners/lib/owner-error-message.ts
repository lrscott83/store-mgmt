// D2: one local helper, an explicit map per call site. Reads error.response.status
// structurally (D1) — no axios import — so network failures / timeouts (no
// `response`) and unmapped statuses both fall through to OWNER.ERROR.
//
// D-1: the rejection channel (response.status) wins; the envelope probe reads
// the TOP level only — `actionCode` off the object itself, never
// `error.response.data.actionCode`. The two channels are structurally disjoint
// (an axios rejection has no top-level `actionCode`; a resolved envelope has no
// `response`), so precedence only matters for the synthetic case that pins it.
//
// ADR-1 (design.md): this function is now a thin wrapper over the shared
// `apiErrorMessageId` (`shared/lib/http/api-error-message.ts`). Signature and the 4
// existing call sites are unchanged; `byCode` is a new optional 3rd param used by
// FE-OC7's phone-required mapping.
import { apiErrorMessageId } from '~/shared/lib/http/api-error-message';

export function ownerErrorMessageId(
  error: unknown,
  byStatus: Record<number, string>,
  byCode?: Record<string, string>
): string {
  return apiErrorMessageId(error, { byStatus, byCode, fallback: 'OWNER.ERROR' });
}
