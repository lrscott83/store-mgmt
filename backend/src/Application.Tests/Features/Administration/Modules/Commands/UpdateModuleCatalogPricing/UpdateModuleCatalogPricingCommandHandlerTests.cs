using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.Administration.Modules.Commands.UpdateModuleCatalogPricing;
using Application.UnitOfWorks;
using Domain.Entities.Modules;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.Administration.Modules.Commands.UpdateModuleCatalogPricing;

public class UpdateModuleCatalogPricingCommandHandlerTests
{
    private readonly Mock<IApplicationUnitOfWork> _applicationUnitOfWork;
    private readonly Mock<IModuleRepository> _moduleRepository;
    private readonly Mock<IHttpContextService> _httpContextService;
    private readonly Mock<IStringLocalizer<I18n>> _localizer;
    private readonly UpdateModuleCatalogPricingCommandHandler _handler;

    public UpdateModuleCatalogPricingCommandHandlerTests()
    {
        _applicationUnitOfWork = new Mock<IApplicationUnitOfWork>();
        _moduleRepository = new Mock<IModuleRepository>();
        _httpContextService = new Mock<IHttpContextService>();
        _localizer = new Mock<IStringLocalizer<I18n>>();
        _localizer.Setup(x => x["Forbidden"]).Returns(new LocalizedString("Forbidden", "Forbidden"));
        _localizer.Setup(x => x["ModuleNotFound"]).Returns(new LocalizedString("ModuleNotFound", "Module not found"));
        _handler = new UpdateModuleCatalogPricingCommandHandler(
            _applicationUnitOfWork.Object,
            _moduleRepository.Object,
            _httpContextService.Object,
            _localizer.Object);
    }

    [Fact]
    public async Task Handle_NonSuperAdmin_ThrowsApiException_Forbidden()
    {
        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(false);

        var act = () => _handler.Handle(
            new UpdateModuleCatalogPricingCommand(new List<ModuleCatalogPricingRequest>
            {
                new(6, 10f, 0f, 0f, true)
            }),
            CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.Forbidden);
        _moduleRepository.Verify(x => x.UpdateAsync(It.IsAny<Module>()), Times.Never);
    }

    [Fact]
    public async Task Handle_SuperAdmin_AppliesIsActiveAlongsideTheThreePrices()
    {
        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        var module = Module.Create(6, "Estadisticas", 1, false, 10f, 0f, 0f, true, true);
        _moduleRepository
            .Setup(x => x.GetModulesByIdsAsync(It.IsAny<IEnumerable<int>>()))
            .ReturnsAsync(new List<Module> { module });
        _moduleRepository.Setup(x => x.UpdateAsync(module)).ReturnsAsync(true);

        var result = await _handler.Handle(
            new UpdateModuleCatalogPricingCommand(new List<ModuleCatalogPricingRequest>
            {
                new(6, 42.5f, 7.25f, 12.5f, false)
            }),
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        // The whole point of the feature: the save now owns the activation flag.
        module.IsActive.Should().BeFalse("the pricing save applies IsActive");
        module.Price.Should().BeApproximately(42.5f, 0.001f);
        module.DiscountPrice.Should().BeApproximately(7.25f, 0.001f);
        module.PercentDiscountPrice.Should().BeApproximately(12.5f, 0.001f);
        result.Data!.Modules.Single().IsActive.Should().BeFalse();
        _applicationUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }
}
