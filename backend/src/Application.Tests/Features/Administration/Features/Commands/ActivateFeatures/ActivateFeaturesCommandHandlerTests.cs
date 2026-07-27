using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.Administration.Features.Commands.ActivateFeatures;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.Administration.Features.Commands.ActivateFeatures;

/// <summary>
/// Tests for the dead gate in ActivateFeaturesCommandHandler.
/// The handler checks IsSuperAdmin at the start, but this branch is unreachable
/// via HTTP because FeaturesController has a class-level [HasPermission(SuperAdmin)] filter.
/// These unit tests verify the gate behavior by mocking IHttpContextService directly.
/// </summary>
public class ActivateFeaturesCommandHandlerTests
{
    #region Dead Gate Tests

    /// <summary>
    /// Verifies that when IsSuperAdmin is false, the handler throws ApiException with BadRequest.
    /// This covers the dead gate branch that can never be triggered via HTTP.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldThrowApiException_WhenIsSuperAdminIsFalse()
    {
        // Arrange
        var mocks = CreateMocks();

        mocks.HttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);

        var handler = new ActivateFeaturesCommandHandler(
            mocks.ApplicationUnitOfWork.Object,
            mocks.HttpContextService.Object,
            mocks.Localizer.Object,
            mocks.ModuleRepository.Object,
            mocks.FeatureRepository.Object);

        var command = new ActivateFeaturesCommand();

        // Act
        var act = () => handler.Handle(command, CancellationToken.None);

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
            ApplicationUnitOfWork = new Mock<IApplicationUnitOfWork>(),
            HttpContextService = new Mock<IHttpContextService>(),
            Localizer = localizer,
            ModuleRepository = new Mock<IModuleRepository>(),
            FeatureRepository = new Mock<IFeatureRepository>()
        };
    }

    private sealed class TestMocks
    {
        public Mock<IApplicationUnitOfWork> ApplicationUnitOfWork { get; set; } = null!;
        public Mock<IHttpContextService> HttpContextService { get; set; } = null!;
        public Mock<IStringLocalizer<I18n>> Localizer { get; set; } = null!;
        public Mock<IModuleRepository> ModuleRepository { get; set; } = null!;
        public Mock<IFeatureRepository> FeatureRepository { get; set; } = null!;
    }

    #endregion
}

// ============================================================================
// DEAD GATE COVERAGE
// ============================================================================
//
// EDGE CASES (1 test):
// ✅ Handle_ShouldThrowApiException_WhenIsSuperAdminIsFalse
//    - IsSuperAdmin=false → ApiException(HttpStatusCode.BadRequest)
//
// NOTA: El happy path (IsSuperAdmin=true) requiere mockear repositorios y
// unit of work para ejecutar toda la cadena de mutación. Se cubre via E2E.
//
// REFERENCIA: FeaturesController tiene class-level [HasPermission(SuperAdmin)],
// por lo que este gate nunca se dispara via HTTP — handler unit test only.
// ============================================================================
