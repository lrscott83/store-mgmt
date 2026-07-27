using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using ModuleType = Domain.Common.Enums.ModuleType;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesAvailableGapTests
{
    private readonly AppTestFactory _f;
    public FeaturesAvailableGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Helper: call `available` as a fresh SuperAdmin and return the DTO list (cleans up its own actor).
    private async Task<List<FeatureDtoShape>> AvailableAsSuperAdminAsync()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/available");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            return b!.Data!;
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // Predicate: ModuleId != Administration. An active feature under Administration(1) is excluded.
    [Fact]
    public async Task Available_excludes_Administration_module_features()
    {
        var id = await FeatureSeed.InsertFeatureUnderModuleAsync(_f, (int)ModuleType.Administration, true, 9095);
        try { (await AvailableAsSuperAdminAsync()).Select(x => x.Id).Should().NotContain(9095); }
        finally { await FeatureSeed.DeleteFeatureAsync(_f, id); }
    }

    // Predicate: Module.IsActive. An active feature under an INACTIVE module is excluded.
    [Fact]
    public async Task Available_excludes_features_whose_module_is_inactive()
    {
        var (moduleId, featureId) = await FeatureSeed.InsertInactiveModuleWithActiveFeatureAsync(_f);
        try { (await AvailableAsSuperAdminAsync()).Select(x => x.Id).Should().NotContain(featureId); }
        finally { await FeatureSeed.DeleteFeatureAsync(_f, featureId); await FeatureSeed.DeleteModuleAsync(_f, moduleId); }
    }

    // Predicate: Feature.IsActive. An inactive feature under an active module is excluded.
    [Fact]
    public async Task Available_excludes_inactive_features()
    {
        var id = await FeatureSeed.InsertFeatureUnderModuleAsync(_f, (int)ModuleType.Inventory, false, 9096);
        try { (await AvailableAsSuperAdminAsync()).Select(x => x.Id).Should().NotContain(9096); }
        finally { await FeatureSeed.DeleteFeatureAsync(_f, id); }
    }

    // Sort: available applies OrderBy(f.Order) ascending.
    [Fact]
    public async Task Available_is_ordered_by_Order_ascending()
    {
        (await AvailableAsSuperAdminAsync()).Select(x => x.Order).Should().BeInAscendingOrder();
    }

    // DTO shape + module resolution.
    [Fact]
    public async Task Available_items_have_dto_shape_and_module()
    {
        (await AvailableAsSuperAdminAsync()).Should().OnlyContain(x => !string.IsNullOrWhiteSpace(x.Name) && x.ModuleId > 0);
    }

    // Verb mismatch: POST on the GET-only available route.
    [Fact]
    public async Task Available_with_POST_verb_returns_405()
    {
        var r = await _f.CreateClient().PostAsync("/api/v1/Features/available", null);
        r.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }
}
