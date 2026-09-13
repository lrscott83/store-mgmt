using Application.Dtos.StoreManagement;
using Application.Mappings.StoreManagement;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Entities.Stores;
using FluentAssertions;

namespace Application.Tests.Mappings.StoreManagement;

public class StoreProfilePlanTypeTests
{
    private static T MapStorePlanDto<T>(int storePlanId, bool approved = true, DateOnly? paymentStartDate = null) where T : class
    {
        var config = new MapperConfiguration(cfg => cfg.AddProfile<StoreProfile>());
        var mapper = config.CreateMapper();
        var store = Store.Create(
            "Tienda de prueba", Guid.NewGuid(), approved, Guid.NewGuid(), paymentStartDate, storePlanId: storePlanId);
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

    // ─── REQ-1: Approved guard — a disapproved store reads "Gratis" on every DTO ───

    [Fact]
    public void Map_StoreDto_ExposesPlanTypeGratisForDisapprovedPagoStore()
    {
        var dto = MapStorePlanDto<StoreDto>((int)StorePlanType.Pago, approved: false,
            paymentStartDate: new DateOnly(2026, 1, 10));

        dto.PlanType.Should().Be("Gratis");
    }

    [Fact]
    public void Map_StoreDto_ExposesPlanTypePagoForApprovedPagoStore()
    {
        var dto = MapStorePlanDto<StoreDto>((int)StorePlanType.Pago, approved: true,
            paymentStartDate: new DateOnly(2026, 1, 10));

        dto.PlanType.Should().Be("Pago");
    }

    [Fact]
    public void Map_StorePlanDto_ExposesPlanTypeGratisForDisapprovedPagoStore()
    {
        var dto = MapStorePlanDto<StorePlanDto>((int)StorePlanType.Pago, approved: false,
            paymentStartDate: new DateOnly(2026, 1, 10));

        dto.PlanType.Should().Be("Gratis");
    }

    [Fact]
    public void Map_OwnerStoreDto_ExposesPlanTypeGratisForDisapprovedPagoStore()
    {
        var dto = MapStorePlanDto<OwnerStoreDto>((int)StorePlanType.Pago, approved: false,
            paymentStartDate: new DateOnly(2026, 1, 10));

        dto.PlanType.Should().Be("Gratis");
    }
}