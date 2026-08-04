// D2: one local helper, an explicit map per call site. Reads error.response.status
// structurally (D1) — no axios import — so network failures / timeouts (no
// `response`) and unmapped statuses both fall through to OWNER.ERROR.
export function ownerErrorMessageId(
  error: unknown,
  byStatus: Record<number, string>
): string {
  const status = (error as { response?: { status?: number } } | null | undefined)?.response
    ?.status;
  return (status !== undefined && byStatus[status]) || 'OWNER.ERROR';
}
