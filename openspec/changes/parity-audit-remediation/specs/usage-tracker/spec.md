# Delta for Usage Tracker

## ADDED Requirements

### Requirement: registerStoreActivity Has No Caller Outside The Tracking Hook
Angular's `registerActivity()` (`store-usage-tracker.service.ts:55`) is `private` and called ONLY
from inside the class's own router-navigation subscription (`startTracking`) — never from any
external caller. React's `registerStoreActivity(userId, selectedStoreId)` is the hook-idiom
substitute for that internal call (rule 5 — the pathname-tracking `useEffect` inside
`useStoreUsageTracker()` plays the role Angular's in-class subscription played). This requirement
RE-OPENS the prior "confirmed clean" note in this capability's Out of Scope section pending a fresh
grep: `registerStoreActivity` MUST have exactly ONE production caller — the pathname-tracking
`useEffect` inside `useStoreUsageTracker()`. If apply-time grep finds any OTHER production
module calling `registerStoreActivity` directly, this requirement is VIOLATED and MUST be
downgraded to a fork requiring an explicit decision (not silently fixed).
(Previously: documented as "already 1:1 ... confirmed clean, not touched" without a dedicated
requirement or fresh grep in this change's context.)

#### Scenario: Single caller confirmed
- GIVEN a grep of `apps/web-store-pos` (excluding tests) for `registerStoreActivity(`
- WHEN counting production call sites
- THEN exactly one is found — inside `useStoreUsageTracker()`'s pathname-tracking effect

#### Scenario: A second caller reopens the decision
- GIVEN the same grep finds a second production caller of `registerStoreActivity`
- WHEN this is discovered during apply
- THEN the visibility-restoration item for this function is downgraded to a fork, and the
  encapsulation change MUST NOT be applied silently

### Requirement: UsageService BaseService Extension Is Deferred (No React Class Exists)
Angular's `UsageService` (`_services/usage/usage.service.ts:12`) extends `BaseService<Usage>`. React
has NO class-based `UsageService` — the usage-tracker module is function-based
(`store-usage-tracker.ts`/`use-store-usage-tracker.ts`), and this change does NOT introduce one.
Applying the `service-base` delta's `extends BaseService<T>` requirement to usage-tracker is
therefore OUT OF SCOPE for this change: it would require inventing a class structure the current
React module doesn't have, which is architecture work belonging to a future design decision, not a
mechanical parity revert.

#### Scenario: No new UsageService class is introduced by this change
- GIVEN the usage-tracker module after this change lands
- WHEN inspecting its exports
- THEN it remains function-based (`registerStoreActivity`, `cleanOldStoreUsage`,
  `isTrackingContextValid`, etc.) — no `UsageService` class is added
