# 09b — SMCA.WebApi Features dead-gate handler unit tests — Plan (Option B)

**Date:** 2026-07-24
**Scope:** the two **unreachable handler gates** flagged in `09` §6 — `ActivateFeaturesCommandHandler`
and `GetAvailableFeaturesToStoreQueryHandler`. These `throw ApiException(400)` branches are dead via HTTP
(the controller `[HasPermission]` filter is at least as strict as the check), so they cannot be reached
in the `09` e2e suite. This plan covers them with **handler unit tests** (Option B) in `Application.Tests`.
**Target project:** `backend/src/Application.Tests` (xUnit 2.4.2 + Moq 4.20.70 + FluentAssertions 6.12.0).

---

## 1. Why a separate plan

`09` is e2e (real HTTP + Postgres). By design it **cannot** exercise these branches: no actor passes the
filter yet fails the handler. Rather than build an artificial filter-bypass factory (Option A) or change
production code (Option C), we test the handler in isolation with a mocked `IHttpContextService`. This is
the cheapest correct coverage for the dead branch and keeps the e2e suite honest (it only asserts
reachable behavior).

## 2. Verified contract facts (code-cited)

- **`ActivateFeaturesCommandHandler`** (`ActivateFeaturesCommand.cs:28-45`) ctor:
  `(IApplicationUnitOfWork, IHttpContextService, IStringLocalizer<I18n>, IModuleRepository,
  IFeatureRepository)`. Gate at `:44-45`: `if (!_httpContextService.IsSuperAdmin) throw new
  ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);`.
- **`GetAvailableFeaturesToStoreQueryHandler`** (`GetAvailableFeaturesToStore Query.cs:25-32`) ctor:
  `(IHttpContextService, IFeatureRepository, IMapper, IStringLocalizer<I18n>)`. Gate at `:36-37`:
  `if (!_httpContextService.IsSuperAdminOrOwnerAdmin) throw new ApiException(_localizer["UserNotFound"],
  HttpStatusCode.BadRequest);`.
- `IHttpContextService` exposes `IsSuperAdmin`, `IsOwnerAdmin`, and `IsSuperAdminOrOwnerAdmin` as
  gettable properties (`IHttpContextService.cs`) — all mockable directly with Moq `.Setup`.
- `ApiException.StatusCode` is a `HttpStatusCode` property (`ApiException.cs`) → assert
  `HttpStatusCode.BadRequest`.
- `I18n` is the resource marker in `Resources` (same `IStringLocalizer<I18n>` used across handlers).

## 3. File structure

- Create: `Application.Tests/Administration/Features/Commands/ActivateFeatures/ActivateFeaturesCommandHandlerGateTests.cs`
- Create: `Application.Tests/Administration/Features/Queries/GetAvailableFeaturesToStore/GetAvailableFeaturesToStoreQueryHandlerGateTests.cs`

(Mirror the existing `Application.Tests` layout, e.g. `Authentication/Queries/GetMe/GetMeQueryHandlerTests.cs`.)

---

## Task 1: `ActivateFeaturesCommandHandlerGateTests`

```csharp
using System.Net;
using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.Administration.Features.Commands.ActivateFeatures;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using Xunit;

namespace Application.Tests.Administration.Features.Commands.ActivateFeatures;

/// <summary>
/// Covers the unreachable-via-HTTP hard gate in ActivateFeaturesCommandHandler:
/// a non-SuperAdmin caller must get ApiException(400). The controller filter blocks this path
/// in production, so it can only be reached by invoking the handler directly (09 §6).
/// </summary>
public class ActivateFeaturesCommandHandlerGateTests
{
    private static ActivateFeaturesCommandHandler CreateHandler(Mock<IHttpContextService> http)
    {
        var localizer = new Mock<IStringLocalizer<I18n>>();
        localizer.Setup(x => x[It.IsAny<string>()])
            .Returns((string k) => new LocalizedString(k, k));
        return new ActivateFeaturesCommandHandler(
            new Mock<IApplicationUnitOfWork>().Object,
            http.Object,
            localizer.Object,
            new Mock<IModuleRepository>().Object,
            new Mock<IFeatureRepository>().Object);
    }

    [Fact]
    public async Task Handle_ShouldThrowBadRequest_WhenCallerIsNotSuperAdmin()
    {
        // Arrange
        var http = new Mock<IHttpContextService>();
        http.Setup(x => x.IsSuperAdmin).Returns(false);
        var handler = CreateHandler(http);

        // Act
        var act = () => handler.Handle(new ActivateFeaturesCommand(), CancellationToken.None);

        // Assert
        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
```

- [ ] Run `--filter ~ActivateFeaturesCommandHandlerGateTests`. **Checkpoint** —
  `test(application): activate features handler gate unit test`.

---

## Task 2: `GetAvailableFeaturesToStoreQueryHandlerGateTests`

```csharp
using System.Net;
using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.Administration.Features.Queries.GetAvailableFeaturesToStore;
using AutoMapper;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using Xunit;

namespace Application.Tests.Administration.Features.Queries.GetAvailableFeaturesToStore;

/// <summary>
/// Covers the unreachable-via-HTTP hard gate in GetAvailableFeaturesToStoreQueryHandler:
/// a caller that is neither SuperAdmin nor OwnerAdmin must get ApiException(400). The controller
/// filter (SuperAdmin | StoresAdmin, and StoresAdmin implies OwnerAdmin) blocks this path in
/// production, so it can only be reached by invoking the handler directly (09 §6).
/// </summary>
public class GetAvailableFeaturesToStoreQueryHandlerGateTests
{
    private static GetAvailableFeaturesToStoreQueryHandler CreateHandler(Mock<IHttpContextService> http)
    {
        var localizer = new Mock<IStringLocalizer<I18n>>();
        localizer.Setup(x => x[It.IsAny<string>()])
            .Returns((string k) => new LocalizedString(k, k));
        return new GetAvailableFeaturesToStoreQueryHandler(
            http.Object,
            new Mock<IFeatureRepository>().Object,
            new Mock<IMapper>().Object,
            localizer.Object);
    }

    [Fact]
    public async Task Handle_ShouldThrowBadRequest_WhenCallerIsNeitherSuperAdminNorOwnerAdmin()
    {
        // Arrange
        var http = new Mock<IHttpContextService>();
        http.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(false);
        var handler = CreateHandler(http);

        // Act
        var act = () => handler.Handle(new GetAvailableFeaturesToStoreQuery(), CancellationToken.None);

        // Assert
        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
```

- [ ] Run `--filter ~GetAvailableFeaturesToStoreQueryHandlerGateTests`. **Checkpoint** —
  `test(application): available features handler gate unit test`.

---

## 4. Confirm at implementation

- Exact namespaces of `ActivateFeaturesCommandHandler` / `GetAvailableFeaturesToStoreQueryHandler` and
  the ctor parameter order (cross-check `ActivateFeaturesCommand.cs:28-40`,
  `GetAvailableFeaturesToStoreQuery.cs:25-32`) — Moq needs the exact ctor.
- `IApplicationUnitOfWork` namespace (`Application.UnitOfWorks`) and `I18n` marker namespace
  (`Resources`) — align the `using`s with the real files.
- `IHttpContextService.IsSuperAdminOrOwnerAdmin` is a plain gettable property (confirmed), so mocking it
  directly is valid; no need to set `IsSuperAdmin`/`IsOwnerAdmin` separately for Task 2.

## 5. Out of scope

- The happy paths of both handlers (the mutation side-effects of `activate`, the mapped list of
  `available`) — those are reachable and belong in `09` (e2e) or a broader `Application.Tests` handler
  suite, not this dead-gate plan.
- Option A (filter-bypass integration) and Option C (remove the redundant gate in production) — recorded
  in `09` §7; not pursued here.
