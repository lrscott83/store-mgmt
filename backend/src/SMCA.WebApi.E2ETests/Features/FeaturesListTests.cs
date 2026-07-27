using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesListTests
{
    private readonly AppTestFactory _f;
    public FeaturesListTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task List_features_as_super_admin_returns_200()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/true");
            r.StatusCode.Should().Be(HttpStatusCode.OK);
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            b!.Succeeded.Should().BeTrue();
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task List_includeInactive_true_includes_inactive_feature()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var featureId = await FeatureSeed.InsertInactiveFeatureAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            b!.Data.Should().Contain(x => x.Id == featureId);
        }
        finally { await FeatureSeed.DeleteFeatureAsync(_f, featureId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    [Fact]
    public async Task List_includeInactive_false_excludes_inactive_feature()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var featureId = await FeatureSeed.InsertInactiveFeatureAsync(_f);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/false");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            b!.Data.Should().NotContain(x => x.Id == featureId);
        }
        finally { await FeatureSeed.DeleteFeatureAsync(_f, featureId); await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }
}

// Local DTO shape for deserialization.
public sealed class FeatureDtoShape
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public int ModuleId { get; set; }
    public int Order { get; set; }
    public bool AvailableToStore { get; set; }
}
