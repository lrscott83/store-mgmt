# superadmin-messages-owner-order-realtime

## Objective

Close the two behavior gaps left by the SuperAdmin header-messages feature:

1. **Freshness of the SuperAdmin header counter.** Today the SuperAdmin header
   unread badge only moves on the poll ladder (10s active → up to 5 min idle)
   because the SignalR connection in `message-shell.tsx` is gated on
   `isOwnerAdmin`. The hub already pushes each message to the **recipient's**
   per-user group (`SignalRMessagePushService` → `MessageGroupKey.ForUserId(recipientId)`),
   and owner→SuperAdmin messages are stamped with `recipientId = SuperAdmin`, so
   enabling the connection for the SuperAdmin makes the badge update instantly.
2. **Ordering by "the owner who wrote last".** The messages inbox currently
   orders owners by the conversation's `lastMessageAt`, which also moves when
   the SuperAdmin replies — so replying to an old owner yanks them to the top.
   The requirement is "owners who sent me the most recent messages first". The
   contract has no sender, so we expose it.

## Problem

- `Conversation` stores only `LastMessageAt` / `LastMessageContent`; it does not
  record who sent the last message. The React `ConversationDto` mirrors it. The
  ordering therefore cannot distinguish an incoming owner message from the
  SuperAdmin's own outgoing reply.
- The SuperAdmin has no realtime path; only OwnerAdmin opens the hub.

## Why

The user asked (2026-10-08) for the header counter and for owners who wrote most
recently to come first. Both are approximations today. The backend E2E only
cover the existing contract.

## Scope

In scope (React frontend + backend production support + new backend E2E):

- `frontend-react/apps/web-store-pos/app/shared/lib/messages/messages-types.ts`
- `frontend-react/apps/web-store-pos/app/admin/messages/routes/messages.tsx`
- `frontend-react/apps/web-store-pos/app/shared/components/message-shell.tsx`
- `frontend-react/apps/web-store-pos/app/admin/messages/routes/__tests__/messages.test.tsx`
- `backend/src/Domain/Interfaces/Repositories/IMessageRepository.cs`
- `backend/src/Infrastructure/Persistence/Repositories/MessageRepository.cs`
- `backend/src/Application/Features/Messages/Queries/GetConversations/GetConversationsQuery.cs`
- NEW: `backend/src/SMCA.WebApi.E2ETests/Messages/SuperAdminConversationLastOwnerMessageTests.cs`

Out of scope / forbidden:

- `frontend/` (Angular legacy) — never read or touch.
- Any existing E2E test or E2E support file (frontend `e2e/**` or backend
  `SMCA.WebApi.E2ETests/**/`). Only a NEW backend E2E file is added.
- Any other backend production source.

## Constraints

- Backend scope rule (verbatim, user-mandated 2026-08-08): in backend work the
  agent may only ADD new E2E tests; modifying backend production source requires
  explicit notification + approval. Approval for this feature was granted
  2026-10-09 (expose the last-message sender in `GET /v1/messages/conversations`).
- E2E untouchable rule (verbatim, user-mandated 2026-08-10): never modify,
  delete, rename, skip, weaken or "fix" an existing E2E test. Only new files.
- No EF migration and no schema change: the last owner-message timestamp is
  derived from the existing `Message` table.

## Tasks

- [ ] T1 (backend) Expose `LastOwnerMessageAt` on `ConversationDto` in
  `GET /v1/messages/conversations`. New repository method
  `GetLastOwnerMessageAtAsync(conversationId, ownerId)` returns the timestamp of
  the latest non-deleted message whose `SenderId == conversation.OwnerId`.
- [ ] T2 (frontend) `messages.tsx` sorts owners by `lastOwnerMessageAt`
  (descending); owners without an owner message keep the old fallback ordering
  (non-free store first, then name).
- [ ] T3 (frontend) `message-shell.tsx` opens the SignalR connection for the
  SuperAdmin too (gate on `seesHeaderMessages`), so the header badge updates
  instantly.
- [ ] T4 (backend E2E, NEW file) Pin `lastOwnerMessageAt` and ordering: an
  owner's message sets it; the SuperAdmin's reply moves `lastMessageAt` but
  leaves `lastOwnerMessageAt` unchanged, so the owner that wrote later stays
  first.
- [ ] T5 (frontend unit tests) Update the ordering tests/fixtures to the new
  field and add the "admin reply does not reorder" case.
- [ ] T6 Checks: frontend `vitest` focused suite + typecheck; backend build;
  new E2E class run.

## Acceptance criteria

- `GET /v1/messages/conversations` returns `lastOwnerMessageAt` (nullable) for
  each conversation, equal to the latest owner-authored message time.
- The inbox lists owners by most recent **owner** message; a SuperAdmin reply
  does not move an owner.
- The SuperAdmin header badge updates via SignalR while online.
- Focused frontend unit tests and typecheck pass; the new backend E2E passes.

## Route

Delegated direct: one bounded writer (backend + frontend + tests), then the
delegated verification gate and a parent spot check.

## Progress / Evidence

- 2026-10-09: feature document created. Exploration complete (repository, query
  handler, `SendMessageCommand`, hub, api-client, E2E harness all read).
- 2026-10-09: T1–T6 done. Backend `dotnet build` succeeded; new backend E2E
  `SuperAdminConversationLastOwnerMessageTests` passed (1/1) against real
  PostgreSQL, plus the Messages namespace regression (14/14). Frontend focused
  vitest 40/40, typecheck clean, prettier clean.
- `ConversationDto.lastOwnerMessageAt` was made OPTIONAL (`?: string | null`) so
  cached/partial payloads and fixtures without it stay valid; the earlier
  one-line fixture additions to `message-shell.badge.test.tsx` and
  `message-shell.offline.test.tsx` were REVERTED, so those paths are no longer in
  the candidate.
- Native review (RDD on): first lineage `review-ea24f2354c30d787` was superseded
  (the candidate changed with the optional-field edit). Fresh lineage
  **`review-f7b4d2f3bcc9abdd`** (medium, one lens `review-reliability`) completed
  **APPROVED**; the exact acknowledgement burned authority
  (`gentle-ai.review-acknowledged/v1`, authority=burned). The relay's first
  attempt was refused (`opencode_review_transport_relay_refused / output_refused`)
  and admitted on the second — a known transient (load), not a capability issue.
- Advisory findings (non-blocking) from the first review: R3-COV-1 (nullable
  contract half-pinned), R3-PERF-1 (new per-conversation query worsened the
  handler's N+1), R3-COV-2 (realtime gate proven only up to "connection
  starts"), R3-EVID-1 (doc referenced already-reverted fixture edits).
- 2026-10-09 (2): committed `7bdbde78` (feature), then fixed the four findings:
  - R3-PERF-1: batched `GetUnreadCountsAsync` / `GetLastOwnerMessageAtAsync` — two
    queries for the whole list instead of 2N; the owner is resolved through the
    `m.SenderId == c.OwnerId` join instead of a parameter.
  - R3-COV-1: NEW backend E2E `SuperAdminConversationLastOwnerMessageEdgeTests`
    (silent owner = null; sender-deleted message excluded).
  - R3-COV-2: the message-shell test now fires the recorded `ReceiveMessage`
    handler and asserts the badge moves.
  - R3-EVID-1: this document corrected.
  Committed as `1fed7635`. Verified: new E2E 1/1 + Messages namespace 15/15;
  Application.Tests 1149/1149; focused vitest 29/29; typecheck clean.
- Second native review lineage **`review-540a021a37c6f49a`** (committed-only, base
  `7bdbde78`, medium) completed **APPROVED**; authority burned. Two new
  non-blocking advisories: R3-UNREAD-BATCH-UNASSERTED (WARNING — the batched
  unread path has no candidate-supplied observable assertion) and
  R3-PUSH-HANDLER-NO-PAYLOAD (SUGGESTION — the push test fires the handler with
  no payload).

## Next step

Feature (`7bdbde78`) and fixes (`1fed7635`) committed on `test`. The two new
advisories are separate later work. Await the user's decision on pushing/delivery
under ordinary repository policy.
