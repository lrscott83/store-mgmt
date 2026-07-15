# Delta for Admin Owners & Resellers

## ADDED Requirements

### Requirement: ReSeller Model Has No login Field

The `ReSeller` TypeScript model (`packages/domain/src/models/store.ts`) MUST NOT declare a `login`
field, because Angular's `domain/resellers/reseller.model.ts` `ReSeller` interface has no `login`
field, and no React call-site reads `reSeller.login` (all `.login` matches in the codebase resolve
to `user.login`/auth contexts, not the reseller entity).

**Rules**: 3 (model shape parity), 12 (no invention — extra field with no Angular source and no
consumer).

#### Scenario: ReSeller model matches Angular's field set
- GIVEN the React `ReSeller` interface
- WHEN diffed against Angular's `reseller.model.ts` fields (`id, userId, fullName,
  percentDiscountPrice, discountPrice, cellPhone, email, description, guest` + audit fields)
- THEN no extra `login` field is present

#### Scenario: No production code reads ReSeller.login
- GIVEN the `login` field is removed from `ReSeller`
- WHEN grepping `apps/web-store-pos` and `packages/domain` for `reSeller.login` / `.login` on a
  `ReSeller`-typed value
- THEN zero matches are found, and the full test suite and typecheck still pass
