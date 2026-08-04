# Design: Owner load reads `actionCode` off the failure envelope

## Technical Approach

`ownerErrorMessageId` gains a **second probe**, not a second function. Its body derives one
`status` from whichever channel the input carries — an axios rejection's `response.status`, or a
top-level `actionCode` when `succeeded === false` — then indexes the caller's existing
`Record<number, string>` map. The signature is untouched (`unknown` already admits
`BaseResponseModel<Owner>`), so `owner-create.tsx` and the edit submit path recompile byte-identical.
`owner-edit.tsx`'s load effect stops hard-coding `OWNER.ERROR` and routes **both** arms — envelope
and `.catch` — through that one map.

## Architecture Decisions

### D-1: Rejection channel wins; the envelope probe reads the TOP level only

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `response.status` first, then top-level `actionCode` | Two channels stay structurally disjoint — an axios error has no top-level `actionCode`; an envelope has no `response` | **Chosen** |
| Envelope first | A 409 rejection whose body happened to carry `actionCode: 400` would silently degrade to `OWNER.ERROR` — regresses FE-OC2 | Rejected |
| Also probe `error.response.data.actionCode` | Fuses the channels and manufactures the precedence conflict this contract exists to avoid | Rejected |

**Rationale**: `response.status` is the transport's own verdict about the request; `actionCode` is
application payload. When both are present the transport already failed, so the body is at best a
restatement. Because the probe never digs into `response.data`, no real producer emits both — which
is exactly why precedence must be **pinned by a test**, not left as an evaluation-order accident.

### D-2: One widened function — no overload, no sibling

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Widen the single existing function | Both paths share one classification rule *by construction*; zero call-site churn | **Chosen** |
| Overload pair | The implementation body is shared anyway, and `unknown` already accepts both shapes — overloads add zero call-site safety, only ceremony | Rejected |
| Sibling + private core | Two exported entry points = the drift the constraint forbids; a future edit touches one probe | Rejected |

**Key finding**: the signature does **not** change. `(input: unknown, byStatus: Record<number,string>)`
already types the envelope call. There is therefore **no meaningful type-level RED** here — do not
add an `owner-error-message.test-d.ts`; it would be a tautology. This change is driven entirely by
runtime tests.

### D-3: Load path passes one hoisted map to both arms

Module-level in `owner-edit.tsx`:

```ts
const LOAD_ERROR_KEYS: Record<number, string> = { 404: 'OWNER.NOT_FOUND', 403: 'OWNER.FORBIDDEN' };
```

Both arms become `setLoadError(intl.formatMessage({ id: ownerErrorMessageId(x, LOAD_ERROR_KEYS) }))`
— `x = res` in the `!res.succeeded` arm, `x = error` in `.catch((error) => …)` (today it takes no
parameter). Hoisting deviates from D2's "inline map per call site" **deliberately**: the load effect
is one call site with two arms, and a shared const makes them provably identical — the point of the
change. The submit map at `:236-239` stays inline and untouched (out of scope).

### D-4: `null` and unmapped codes never reach the index

```ts
const status = src?.response?.status ?? (src?.succeeded === false ? src?.actionCode : undefined);
return (typeof status === 'number' && byStatus[status]) || 'OWNER.ERROR';
```

`typeof status === 'number'` replaces today's `!== undefined`: one guard covering `null`,
`undefined`, and a malformed non-numeric wire value. `null` is never used as a key (TS rejects it;
JS would coerce to `"null"`). Unmapped numbers index to `undefined` → `||` → `OWNER.ERROR`.
Rejected: a `-1`/`NaN` sentinel — a magic value a map author could accidentally bind.

## Data Flow

    getOwner(id) ─┬─ resolves succeeded:false ──→ actionCode ─┐
                  └─ rejects ──→ response.status ─────────────┤ (status wins)
                                                              ▼
                                        ownerErrorMessageId(x, LOAD_ERROR_KEYS)
                                                              │
                              404→NOT_FOUND · 403→FORBIDDEN · else→OWNER.ERROR
                                                              ▼
                                                    setLoadError(...)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `…/owners/lib/owner-error-message.ts` | Modify | Second probe + `typeof` guard. Signature unchanged |
| `…/owners/lib/__tests__/owner-error-message.test.ts` | Modify | +5 envelope/precedence cases |
| `…/owners/routes/owner-edit.tsx` | Modify | `LOAD_ERROR_KEYS` const; both load arms rewired |
| `…/owners/routes/__tests__/owner-edit.test.tsx` | Modify | +3 load-path cases |

Untouched: `owner-create.tsx`, `owner-http-service.ts`, `base.ts`, `es.ts`, `api-client`, `backend/`.

## Testing Strategy (STRICT TDD — each row RED first)

| # | Layer | Case | Guards |
|---|-------|------|--------|
| 1 | Unit | envelope `{succeeded:false, actionCode:404}` → `OWNER.NOT_FOUND` | D-4 happy path |
| 2 | Unit | `actionCode:null` → `OWNER.ERROR` | D-4 |
| 3 | Unit | `actionCode:400` (unmapped) → `OWNER.ERROR` | D-4 |
| 4 | Unit | `{succeeded:true, actionCode:404}` → `OWNER.ERROR` | the `succeeded===false` gate |
| 5 | Unit | `{response:{status:403}, succeeded:false, actionCode:404}` → `OWNER.FORBIDDEN` | **D-1 precedence** |
| 6 | Integration | load envelope 404 → `OWNER.NOT_FOUND`, no field setters fire | D-3 envelope arm |
| 7 | Integration | load envelope 403 → `OWNER.FORBIDDEN` | D-3 envelope arm |
| 8 | Integration | load **rejects** 404 → `OWNER.NOT_FOUND` | D-3 catch arm (new behaviour) |

Regression guards, must stay green untouched: the 5 existing helper tests (rejection channel),
`owner-edit.test.tsx:1070` (`actionCode:null` → `OWNER.ERROR`), and all FE-OC2 create tests.

Gates: `npx turbo run test --force` for any quoted evidence; typecheck separately via
`pnpm -C apps/web-store-pos exec tsc --noEmit`.

## Migration / Rollout

No migration. Two single-concern commits (helper, then load path) on
`feat/owners-getbyid-envelope-404`; either reverts independently.

## Open Questions

- [ ] Spec delta Scenario 4 says a load-path 404 **rejection** rendering `OWNER.NOT_FOUND` is
      "unchanged from today". It is not — today's load `.catch` sets `OWNER.ERROR` unconditionally
      (`owner-edit.tsx:166-168`). The behaviour is correct and in scope per the proposal; only the
      parenthetical is wrong. Test #8 treats it as new. Worth a one-line spec fix.
