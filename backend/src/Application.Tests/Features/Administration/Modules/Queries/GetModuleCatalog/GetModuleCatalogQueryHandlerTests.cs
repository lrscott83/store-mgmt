using Application.Abstractions.HttpContext;
using Application.Dtos.Administration.Modules;
using Application.Exceptions;
using Application.Modules.Administration.Modules.Queries.GetModuleCatalog;
using AutoMapper;
using Domain.Entities.Modules;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.Administration.Modules.Queries.GetModuleCatalog;

public class GetModuleCatalogQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService;
    private readonly Mock<IModuleRepository> _moduleRepository;
    private readonly Mock<IMapper> _mapper;
    private readonly Mock<IStringLocalizer<I18n>> _localizer;
    private readonly GetModuleCatalogQueryHandler _handler;

    public GetModuleCatalogQueryHandlerTests()
    {
        _httpContextService = new Mock<IHttpContextService>();
        _moduleRepository = new Mock<IModuleRepository>();
        _mapper = new Mock<IMapper>();
        _localizer = new Mock<IStringLocalizer<I18n>>();
        _localizer.Setup(x => x["Forbidden"]).Returns(new LocalizedString("Forbidden", "Forbidden"));
        _handler = new GetModuleCatalogQueryHandler(
            _httpContextService.Object,
            _moduleRepository.Object,
            _mapper.Object,
            _localizer.Object);
    }

    [Fact]
    public async Task Handle_NonSuperAdmin_ThrowsApiException_Forbidden()
    {
        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(false);

        var act = () => _handler.Handle(new GetModuleCatalogQuery(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.Forbidden);
        _moduleRepository.Verify(x => x.GetAllModulesAvailableToStore(), Times.Never);
    }

    [Fact]
    public async Task Handle_SuperAdmin_MapsEveryAvailableModuleIncludingInactiveOnes()
    {
        _httpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        var modules = new List<Module>
        {
            Module.Create(6, "Estadisticas", 1, false, 100f, 0f, 0f, true, true),
            // The point of this read: an INACTIVE but available module must still be listed,
            // so the catalog editor can switch it back on.
            Module.Create(7, "Gestion", 2, true, 50f, 0f, 0f, true, false),
        };
        _moduleRepository
            .Setup(x => x.GetAllModulesAvailableToStore())
            .ReturnsAsync(modules);
        _mapper
            .Setup(x => x.Map<IEnumerable<ModuleDto>>(modules))
            .Returns(new List<ModuleDto>
            {
                new() { Id = 6, Name = "Estadisticas", IsActive = true },
                new() { Id = 7, Name = "Gestion", IsActive = false },
            });

        var result = await _handler.Handle(new GetModuleCatalogQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(2);
        result.Data!.Single(m => m.Id == 7).IsActive.Should().BeFalse(
            "an inactive module must stay listed so the checkbox can reactivate it");
        _moduleRepository.Verify(x => x.GetAllModulesAvailableToStore(), Times.Once);
    }
}
