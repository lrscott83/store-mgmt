using Application.Abstractions.Features;
using Application.Abstractions.HttpContext;
using Application.Services.Features;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using Xunit;

namespace Application.Tests.Services.Features;

public class AllowedFeaturesServiceTests
{
    private readonly Guid _userId = Guid.NewGuid();
    private readonly List<int> _storeModuleIds = [1, 2];

    [Fact]
    public async Task GetAllowedFeatureIdsForUserAsync_ReSeller_returns_feature_ids()
    {
        var repo = new Mock<IUserRoleRepository>();
        repo.Setup(r => r.IsReSeller(_userId)).ReturnsAsync(true);
        repo.Setup(r => r.IsStoreAdmin(_userId)).ReturnsAsync(false);

        var sut = CreateSut(userRoleRepository: repo.Object);

        var result = await sut.GetAllowedFeatureIdsForUserAsync(_userId, _storeModuleIds);

        // ReSeller path returns feature IDs from the enum (no DB call),
        // so the list should be non-empty.
        result.Should().NotBeNull();
        result.Count.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task GetAllowedFeatureIdsForUserAsync_OwnerAdmin_returns_feature_ids_for_modules()
    {
        var repo = new Mock<IUserRoleRepository>();
        repo.Setup(r => r.IsReSeller(_userId)).ReturnsAsync(false);
        repo.Setup(r => r.IsStoreAdmin(_userId)).ReturnsAsync(true);

        var featureRepo = new Mock<IFeatureRepository>();
        featureRepo.Setup(f => f.FilterAvailableToStoreByIds(It.IsAny<List<int>>()))
            .ReturnsAsync((List<int> ids) => ids);

        var sut = CreateSut(
            userRoleRepository: repo.Object,
            featureRepository: featureRepo.Object);

        var result = await sut.GetAllowedFeatureIdsForUserAsync(_userId, _storeModuleIds);

        result.Should().NotBeNull();
        // OwnerAdmin with matching modules should return some features
        result.Count.Should().BeGreaterThan(0);
        featureRepo.Verify(f => f.FilterAvailableToStoreByIds(It.IsAny<List<int>>()), Times.Once);
    }

    [Fact]
    public async Task GetAllowedFeatureIdsForUserAsync_plain_user_returns_empty()
    {
        var repo = new Mock<IUserRoleRepository>();
        repo.Setup(r => r.IsReSeller(_userId)).ReturnsAsync(false);
        repo.Setup(r => r.IsStoreAdmin(_userId)).ReturnsAsync(false);

        var sut = CreateSut(userRoleRepository: repo.Object);

        var result = await sut.GetAllowedFeatureIdsForUserAsync(_userId, _storeModuleIds);

        result.Should().NotBeNull();
        result.Should().BeEmpty();
    }

    private static AllowedFeaturesService CreateSut(
        IUserRoleRepository? userRoleRepository = null,
        IFeatureRepository? featureRepository = null)
    {
        var httpMock = new Mock<IHttpContextService>();
        var featureRepo = featureRepository ?? new Mock<IFeatureRepository>().Object;
        var userRoleRepo = userRoleRepository ?? new Mock<IUserRoleRepository>().Object;

        return new AllowedFeaturesService(httpMock.Object, featureRepo, userRoleRepo);
    }
}
