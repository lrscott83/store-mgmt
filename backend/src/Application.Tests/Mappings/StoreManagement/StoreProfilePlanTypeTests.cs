using Application.Dtos.StoreManagement;
using Application.Mappings.StoreManagement;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Entities.Stores;
using FluentAssertions;

namespace Application.Tests.Mappings.StoreManagement;

public class StoreProfilePlanTypeTests
{
    private static T MapStorePlanDto<T>(int storePlanId) where T : class
    {
        var config = new MapperConfiguration(cfg => cfg.AddProfile<StoreProfile>());
        var mapper = config.CreateMapper();
        var store = Store.Create(
            "Tienda de prueba", Guid.NewGuid(), true, Guid.NewGuid(), null, storePlanId: storePlanId);
        return mapper.Map<T>(store);
    }

    [Fact]
    public void Map_StorePlanDto_ExposesPlanTypePagoForPagoStore()
    {
        var dto = MapStorePlanDto<StorePlanDto>((int)StorePlanType.Pago);

        dto.PlanType.Should().Be("Pago");
    }

    [Fact]
    public void Map_OwnerStoreDto_ExposesPlanTypePagoForPagoStore()
    {
        var dto = MapStorePlanDto<OwnerStoreDto>((int)StorePlanType.Pago);

        dto.PlanType.Should().Be("Pago");
    }

    [Fact]
    public void Map_StorePlanDto_ExposesPlanTypeGratisForGratisStore()
    {
        var dto = MapStorePlanDto<StorePlanDto>((int)StorePlanType.Gratis);

        dto.PlanType.Should().Be("Gratis");
    }

    [Fact]
    public void Map_StorePlanDto_FallsBackToGratisForUnknownPlanId()
    {
        var dto = MapStorePlanDto<StorePlanDto>(999);

        dto.PlanType.Should().Be("Gratis");
    }
}