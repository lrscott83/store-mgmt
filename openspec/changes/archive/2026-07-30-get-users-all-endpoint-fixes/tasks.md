# Tasks: Get Users All Endpoint Fixes

## Phase 1: Controller — UsersController.cs

- [x] 1.1 **Add ProducesResponseType attributes** — Add `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]` above `GetAllUsersAsync` method (after line 29)
- [x] 1.2 **Add [FromRoute] on includeInactive** — Change `GetAllUsersAsync(bool includeInactive)` to `GetAllUsersAsync([FromRoute] bool includeInactive)`

## Phase 2: DTO — UserListDto.cs

- [x] 2.1 **Init RoleNames as empty** — Change `IEnumerable<string> RoleNames { get; set; }` to `IEnumerable<string> RoleNames { get; set; } = []`

## Phase 3: Validator — GetAllUsersQueryValidator.cs (NEW)

- [x] 3.1 **Create empty validator** — Create `GetAllUsersQueryValidator.cs` in the same folder as `GetAllUsersQuery.cs`, extending `AbstractValidator<GetAllUsersQuery>` with empty constructor body

## Phase 4: Interface — IUserRepository.cs

- [x] 4.1 **Add CancellationToken to IgnoreQueryFilters method** — `GetAllUsersIncludingStoreAndRolesAndIgnoreQueryFiltersAsync(bool, CancellationToken = default)`
- [x] 4.2 **Add CancellationToken to basic method** — `GetAllUsersIncludingStoreAndRolesAsync(bool, CancellationToken = default)`
- [x] 4.3 **Add CancellationToken to ByStoreId method** — `GetAllUsersByStoreIdIncludingStoreAndRolesAsync(Guid, bool, CancellationToken = default)`

## Phase 5: Repository — UserRepository.cs

- [x] 5.1 **Add .ThenInclude(o => o.User)** — Append `.ThenInclude(o => o.User)` after `.ThenInclude(s => s.Owner)` in all 3 Include chains (lines 29, 38, 49)
- [x] 5.2 **Add .Take(1000)** — Append `.Take(1000)` before `.ToListAsync()` in all 3 methods (after `.Where()`/`.Include()` chain)
- [x] 5.3 **Pass CancellationToken** — Add `CancellationToken cancellationToken = default` param and pass to `.ToListAsync(cancellationToken)` in all 3 methods
- [x] 5.4 **Extract IncludeStoreAndRoles() helper** — Create `private IQueryable<User> IncludeStoreAndRoles(IQueryable<User> query)` returning the configured chain; replace 3 inline duplicates with `query = IncludeStoreAndRoles(query)`

## Phase 6: Handler — GetAllUsersQuery.cs

- [x] 6.1 **Pass cancellationToken to repo calls** — Update `FindUsersIncludingRoles` to accept `CancellationToken`; forward `cancellationToken` param to all 3 `_userRepository` method calls (lines 40, 43, 44)
