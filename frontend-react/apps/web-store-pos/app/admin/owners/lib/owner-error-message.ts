// D2: one local helper, an explicit map per call site. Reads error.response.status
// structurally (D1) — no axios import — so network failures / timeouts (no
// `response`) and unmapped statuses both fall through to OWNER.ERROR.
//
// D-1: the rejection channel (response.status) wins; the envelope probe reads
// the TOP level only — `actionCode` off the object itself, never
// `error.response.data.actionCode`. The two channels are structurally disjoint
// (an axios rejection has no top-level `actionCode`; a resolved envelope has no
// `response`), so precedence only matters for the synthetic case that pins it.
export function ownerErrorMessageId(
  error: unknown,
  byStatus: Record<number, string>
): string {
  const src = error as
    | { response?: { status?: number }; succeeded?: boolean; actionCode?: number | null }
    | null
    | undefined;
  const status = src?.response?.status ?? (src?.succeeded === false ? src?.actionCode : undefined);
  return (typeof status === 'number' && byStatus[status]) || 'OWNER.ERROR';
}
