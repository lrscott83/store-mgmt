using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Domain.Common.Enums;
using Domain.Entities.Plans;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace Application.Tests.Features.Administration.Plans.Queries.GetPlans;

public class PlanRepositoryTests
{
    private static (ApplicationDbContext Context, PlanRepository Repository) CreateContextWithSeededPlans()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(true);
        httpContextMock.Setup(x => x.TenantId).Returns(Guid.NewGuid().ToString());
        httpContextMock.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        var tenantProvider = new TenantIdProvider(new HttpContextAccessor());
        var context = new ApplicationDbContext(options, tenantProvider, httpContextMock.Object);

        context.Set<StorePlan>().AddRange(
            StorePlan.Create((int)StorePlanType.Superior, "Superior", 3, true),
            StorePlan.Create((int)StorePlanType.VIP, "VIP", 4, true),
            StorePlan.Create((int)StorePlanType.Gratis, "Gratis", 1, true),
            StorePlan.Create(99, "Retired", 5, false),
            StorePlan.Create((int)StorePlanType.Pago, "Pago", 2, true));
        context.SaveChanges();

        var repository = new PlanRepository(context);
        return (context, repository);
    }

    [Fact]
    public async Task GetActivePlansIncludingModulesForCatalogAsync_ExcludesVip()
    {
        var (context, repository) = CreateContextWithSeededPlans();

        var plans = await repository.GetActivePlansIncludingModulesForCatalogAsync();

        plans.Select(p => p.Id).Should().NotContain((int)StorePlanType.VIP);
        context.Dispose();
    }

    [Fact]
    public async Task GetActivePlansIncludingModulesForCatalogAsync_ReturnsActivePlansOrdered()
    {
        var (context, repository) = CreateContextWithSeededPlans();

        var plans = await repository.GetActivePlansIncludingModulesForCatalogAsync();

        plans.Select(p => p.Id).Should().Equal(
            (int)StorePlanType.Gratis, (int)StorePlanType.Pago, (int)StorePlanType.Superior);
        context.Dispose();
    }

    [Fact]
    public async Task GetActivePlansIncludingModulesForCatalogAsync_ExcludesInactivePlan()
    {
        var (context, repository) = CreateContextWithSeededPlans();

        var plans = await repository.GetActivePlansIncludingModulesForCatalogAsync();

        plans.Select(p => p.Id).Should().NotContain(99);
        context.Dispose();
    }

    [Fact]
    public async Task GetActivePlansIncludingModulesForCatalogAsync_IncludesPlanModules()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var httpContextMock = new Mock<IHttpContextService>();
        httpContextMock.Setup(x => x.IsSuperAdmin).Returns(true);
        httpContextMock.Setup(x => x.TenantId).Returns(Guid.NewGuid().ToString());
        httpContextMock.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());
        var tenantProvider = new TenantIdProvider(new HttpContextAccessor());
        var context = new ApplicationDbContext(options, tenantProvider, httpContextMock.Object);

        var plan = StorePlan.Create((int)StorePlanType.Gratis, "Gratis", 1, true);
        var module = Domain.Entities.Modules.Module.Create(10, "Ventas", 1, true, 0, true, true);
        context.Set<StorePlan>().Add(plan);
        context.Set<Domain.Entities.Modules.Module>().Add(module);
        context.SaveChanges();
        context.Set<StorePlanModule>().Add(StorePlanModule.Create(plan.Id, module.Id));
        context.SaveChanges();

        var repository = new PlanRepository(context);
        var plans = await repository.GetActivePlansIncludingModulesForCatalogAsync();

        var cached = plans.Single();
        cached.StorePlanModules.Should().HaveCount(1);
        cached.StorePlanModules.Single().ModuleId.Should().Be(module.Id);
        cached.StorePlanModules.Single().Module.Should().NotBeNull();
        context.Dispose();
    }
}