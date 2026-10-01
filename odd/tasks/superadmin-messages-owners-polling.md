# SuperAdmin Messages — owners list + incremental polling

Repository-relative locator: `odd/tasks/superadmin-messages-owners-polling.md`

## Objective

In the SuperAdmin view `/admin/messages` (`admin/messages/routes/messages.tsx`):

1. Replace the fixed 15s reload with the SAME incremental background polling the Owner chat (`shared/components/message-shell.tsx`, T10) already uses: a `setTimeout` ladder (10s → 5min), `background` HTTP calls that skip the global loading overlay and never toast, paused while hidden or offline, reset on activity/focus/online.
2. Show, in the left panel, EVERY ACTIVE OWNER (not only owners that already have a conversation), with the owners that have at least one NON-FREE store shown first.
3. Allow the SuperAdmin to start a conversation with ANY owner directly from the list.

## Terminology

- A store is "free" when it is NOT approved OR its plan is `Gratis`. The backend already collapses both cases: `StoreProfile.ResolvePlanType` returns `"Gratis"` when `!store.Approved`. The client expression is `store.planType === 'Gratis' || !store.approved`.
- A NON-FREE store is therefore an approved store whose `planType !== 'Gratis'`.

## Data sources (no backend change)

- `ownerHttpService.listOwners()` → `GET /v1/owners/all/true` → `Owner[]` (active + inactive). Filter `owner.isActive === true`.
  - `owner.id` = Owner entity id; `owner.userId` = the owner's User id.
- `storeHttpService.listStores()` → `GET /v1/stores/by-current-user` (SuperAdmin sees ALL stores) → `Store[]`.
  - `store.ownerId` = Owner entity id (matches `owner.id`).
  - `store.planType` and `store.approved` drive the free/non-free heuristic.
- `messagesHttpService.getConversations()` → `ConversationDto[]`.
  - `conversation.ownerId` = the owner's USER id (matches `owner.userId`), NOT `owner.id`.
- `messagesHttpService.sendMessage({ conversationId, ownerId, storeId, content })`:
  - Starts a NEW conversation when `conversationId` is the zero GUID and `storeId` is set (backend `SendMessageCommand`).
  - For a new conversation the backend sets `Conversation.OwnerId = command.OwnerId`, so the client MUST send `owner.userId`.

## Design

### Selection model
- Selection is per OWNER: `selectedOwnerId` (Owner entity id) + `selectedOwnerRef` (the selected `Owner`).
- `selectedConversation` = `conversations.find(c => c.ownerId === selectedOwner.userId) ?? null`.
- Right pane shows the owner's `fullName` (primary) and the store name (from `storeLabels`).

### Left panel
One row per active owner:
- Primary line: `owner.fullName`.
- Secondary line: store name (conversation store when there is a conversation, else the preferred store), or `MESSAGES.NO_STORE`.
- Last message content + unread badge when a conversation exists.
- Ordering: owners with ≥1 non-free store first, then the rest; within each group sort by `fullName.localeCompare`.
- Owners with no store at all are still listed (they cannot start a conversation): the send control is disabled and explains why.

### Preferred store for a new conversation
`conversation?.storeId` when a conversation exists; otherwise the owner's first non-free ACTIVE store, else the first ACTIVE store, else the first store, else none.

### Sending
- `storeId = selectedConversation?.storeId ?? preferredStoreId(owner)`.
- `conversationId = selectedConversation?.id ?? NEW_CONVERSATION_ID` (`00000000-0000-0000-0000-000000000000`).
- `ownerId = owner.userId`.
- If no store is available the send is blocked (toast + disabled control).
- After a successful send, reload conversations so the freshly created conversation materializes; the existing "load messages when the resolved conversation changes" effect then fetches the thread.

### Incremental polling (ported from `message-shell.tsx`)
- `POLL_LADDER_MS = [10_000, 20_000, 50_000, 100_000, 180_000, 300_000]`; `setTimeout` loop; next delay depends on whether the last poll changed the conversation activity signature (`id:lastMessageAt`).
- Background polls use the `{ background: true }` option (skip loading overlay, no error toast). `getConversations` / `getMessages` / `markAsRead` already support it.
- Never poll while `document.visibilityState !== 'visible'` or offline; `visibilitychange` / `online` / `focus` re-arm at the fastest step.
- The owner/store directory is loaded on mount and on `focus`/`online` (it changes rarely and `listStores` is heavy), NOT on every poll.
- A send resets the ladder to the fastest step.

## Impact

- **UI**: `frontend-react/apps/web-store-pos/app/admin/messages/routes/messages.tsx`
- **i18n**: `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` (new keys)
- **Tests**: `frontend-react/apps/web-store-pos/app/admin/messages/routes/__tests__/messages.test.tsx`
- No backend change. No change to `owner-http-service.ts` / `store-http-service.ts` (existing methods are reused).

## Constraints

- Angular `frontend/` is legacy and MUST NOT be read or touched.
- E2E suites (`frontend-react/e2e/`, `backend/.../E2ETests/`) are untouchable; only the Vitest unit test for this page is updated.
- Backend source code MUST NOT be modified.

## Tasks

- [x] T1: Rebuild `AdminMessagesPage` selection model around active owners + conversations.
- [x] T2: Left panel lists all active owners, non-free-first, with unread/last-message and start-conversation affordance.
- [x] T3: Port the incremental background polling ladder (+ focus/online/visibility handling) from `message-shell.tsx`.
- [x] T4: i18n keys for the new labels.
- [x] T5: Update/extend the Vitest unit tests (owners list, ordering, inactive filtered, start conversation).
- [x] T6: Verify — `pnpm typecheck`, `pnpm lint`, targeted `vitest` run; report observed results.

## Progress

- [x] T1
- [x] T2
- [x] T3
- [x] T4
- [x] T5
- [x] T6

## Verification evidence (observed)

- `pnpm typecheck` (apps/web-store-pos): exit 0 — react-router typegen + tsc clean.
- `pnpm lint` (apps/web-store-pos): exit 0 — eslint --max-warnings=0 clean.
- `pnpm vitest run app/admin/messages/routes/__tests__/messages.test.tsx`: 7 passed / 7, Type Errors no errors (parent re-ran this one; act(...) warnings are non-fatal and pre-existing).
- Structural readback: only the three expected files changed; no `frontend/` (Angular), no `frontend-react/e2e/`, no backend source touched. No E2E references the changed test ids.

## Commits

- `4195ea4d` feat(messages): list all active owners and poll incrementally in superadmin messages (local, not pushed)

## Estado

✅ Completo — pendiente commit local (sin push).
