using Application.Abstractions.HttpContext;
using Application.Dtos.Administration.Plans;
using Application.Exceptions;
using Application.Features.Administration.Plans.Queries.GetPlans;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Entities.Plans;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;
using System.Net;

namespace Application.Tests.Features.Administration.Plans.Queries.GetPlans;

public class GetPlansQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _httpContextService;
    private readonly Mock<IPlanRepository> _planRepository;
    private readonly Mock<IMapper> _mapper;
    private readonly Mock<IStringLocalizer<I18n>> _localizer;
    private readonly GetPlansQueryHandler _handler;

    public GetPlansQueryHandlerTests()
    {
        _httpContextService = new Mock<IHttpContextService>();
        _planRepository = new Mock<IPlanRepository>();
        _mapper = new Mock<IMapper>();
        _localizer = new Mock<IStringLocalizer<I18n>>();
        _localizer.Setup(x => x["UserNotFound"]).Returns(new LocalizedString("UserNotFound", "User not found"));
        _handler = new GetPlansQueryHandler(
            _httpContextService.Object,
            _planRepository.Object,
            _mapper.Object,
            _localizer.Object);
    }

    [Fact]
    public async Task Handle_NonStoreAdmin_ThrowsApiException_BadRequest()
    {
        _httpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(false);

        var act = () => _handler.Handle(new GetPlansQuery(), CancellationToken.None);

        await act.Should().ThrowAsync<ApiException>()
            .Where(e => e.StatusCode == HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Handle_StoreAdmin_MapsCatalogFromRepository()
    {
        _httpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(true);
        var plans = new List<StorePlan>
        {
            StorePlan.Create((int)StorePlanType.Gratis, "Gratis", 1, true),
            StorePlan.Create((int)StorePlanType.Pago, "Pago", 2, true),
            StorePlan.Create((int)StorePlanType.Superior, "Superior", 3, true),
        };
        _planRepository
            .Setup(x => x.GetActivePlansIncludingModulesForCatalogAsync())
            .ReturnsAsync(plans);
        _mapper
            .Setup(x => x.Map<IEnumerable<PlanDto>>(plans))
            .Returns(new List<PlanDto>
            {
                new() { Id = 1, Name = "Gratis", Order = 1 },
                new() { Id = 2, Name = "Pago", Order = 2 },
                new() { Id = 3, Name = "Superior", Order = 3 },
            });

        var result = await _handler.Handle(new GetPlansQuery(), CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(3);
        result.Data!.Select(p => p.Name).Should().ContainInOrder("Gratis", "Pago", "Superior");
        _planRepository.Verify(x => x.GetActivePlansIncludingModulesForCatalogAsync(), Times.Once);
    }

    [Fact]
    public async Task Handle_Unauthorized_DoesNotTouchRepository()
    {
        _httpContextService.Setup(x => x.IsSuperAdminOrOwnerAdmin).Returns(false);

        await Assert.ThrowsAsync<ApiException>(
            () => _handler.Handle(new GetPlansQuery(), CancellationToken.None));

        _planRepository.Verify(x => x.GetActivePlansIncludingModulesForCatalogAsync(), Times.Never);
    }
}