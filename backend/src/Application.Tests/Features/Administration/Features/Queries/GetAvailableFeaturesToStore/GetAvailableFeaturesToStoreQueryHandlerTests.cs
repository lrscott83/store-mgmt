using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.Administration.Features.Queries.GetAvailableFeaturesToStore;
using AutoMapper;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.Administration.Features.Queries.GetAvailableFeaturesToStore;

/// <summary>
/// Tests for the dead gate in GetAvailableFeaturesToStoreQueryHandler.
/// The handler checks IsSuperAdminOrOwnerAdmin at the start, but this branch is unreachable
/// via HTTP because FeaturesController has a class-level [HasPermission(SuperAdmin)] filter
/// that blocks all non-SuperAdmin users before the method-level [HasPermission(SuperAdmin, StoresAdmin)]
/// can widen access. StoresAdmin requires OwnerAdmin role, so IsSuperAdminOrOwnerAdmin is always true
/// for any actor reaching this handler.
/// These unit tests verify the gate behavior by mocking IHttpContextService directly.
/// </summary>
public class GetAvailableFeaturesToStoreQueryHandlerTests
{
    #region Dead Gate Tests

    /// <summary>
    /// Verifies that when IsSuperAdminOrOwnerAdmin is false, the handler throws ApiException with BadRequest.
    /// This covers the dead gate branch that can never be triggered via HTTP.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldThrowApiException_WhenIsSuperAdminOrOwnerAdminIsFalse()
    {
        // Arrange
        var mocks = CreateMocks();

        mocks.HttpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(false);

        var handler = new GetAvailableFeaturesToStoreQueryHandler(
            mocks.HttpContextService.Object,
            mocks.FeatureRepository.Object,
            mocks.Mapper.Object,
            mocks.Localizer.Object);

        var query = new GetAvailableFeaturesToStoreQuery();

        // Act
        var act = () => handler.Handle(query, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    #endregion

    #region Test Helpers

    private TestMocks CreateMocks()
    {
        var localizer = new Mock<IStringLocalizer<I18n>>();
        localizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "User not found"));

        return new TestMocks
        {
            HttpContextService = new Mock<IHttpContextService>(),
            FeatureRepository = new Mock<IFeatureRepository>(),
            Mapper = new Mock<IMapper>(),
            Localizer = localizer
        };
    }

    private sealed class TestMocks
    {
        public Mock<IHttpContextService> HttpContextService { get; set; } = null!;
        public Mock<IFeatureRepository> FeatureRepository { get; set; } = null!;
        public Mock<IMapper> Mapper { get; set; } = null!;
        public Mock<IStringLocalizer<I18n>> Localizer { get; set; } = null!;
    }

    #endregion
}

// ============================================================================
// DEAD GATE COVERAGE
// ============================================================================
//
// EDGE CASES (1 test):
// ✅ Handle_ShouldThrowApiException_WhenIsSuperAdminOrOwnerAdminIsFalse
//    - IsSuperAdminOrOwnerAdmin=false → ApiException(HttpStatusCode.BadRequest)
//
// NOTA: El happy path requiere mockear FeatureRepository.GetAvailableFeaturesToStore()
// y AutoMapper. Se cubre via E2E en el plan 09 (FeaturesAvailableGapTests).
//
// REFERENCIA: FeaturesController class-level [HasPermission(SuperAdmin)] + method-level
// [HasPermission(SuperAdmin, StoresAdmin)]. StoresAdmin requiere OwnerAdmin, por lo que
// IsSuperAdminOrOwnerAdmin siempre es true para cualquier request que llegue al handler.
// ============================================================================
