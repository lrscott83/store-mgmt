import { test, expectTypeOf } from 'vitest';
import type { BaseResponseModel, Owner } from '@store-mgmt/domain';
import { ownerHttpService } from './owner-http-service';

// Type-level contract: `pnpm test` runs on esbuild-transpiled code, so it
// never checks generics — a mock shaped like an `Owner` would pass at
// runtime even if the declared return type lied (e.g.
// `BaseResponseModel<string>`). These assertions run through the real
// TypeScript compiler (Vitest typecheck mode) so a lying generic produces
// a real, in-loop type error instead of only being caught by a separate
// manual `tsc --noEmit` gate.

test('createOwner resolves to BaseResponseModel<Owner>, not a lying generic', () => {
  expectTypeOf(ownerHttpService.createOwner)
    .returns.resolves.toEqualTypeOf<BaseResponseModel<Owner>>();
});

test('updateOwner resolves to BaseResponseModel<Owner>, not a lying generic', () => {
  expectTypeOf(ownerHttpService.updateOwner)
    .returns.resolves.toEqualTypeOf<BaseResponseModel<Owner>>();
});
