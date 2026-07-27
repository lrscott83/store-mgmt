using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;
using ModuleType = Domain.Common.Enums.ModuleType;

namespace SMCA.WebApi.E2ETests.Features;

[Collection("e2e")]
public sealed class FeaturesListGapTests
{
    private readonly AppTestFactory _f;
    public FeaturesListGapTests(WebAppFixture fixture) => _f = fixture.Factory;

    // Non-bool route segment fails bool model-binding. Pin whichever status the pipeline returns.
    [Fact]
    public async Task List_includeInactive_nonbool_route_returns_400_or_404()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/not-a-bool");
            r.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.NotFound);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // DTO shape: every item has a Name and a resolved ModuleId (Include(Module) + mapping).
    // DisplayName is NOT on the Feature entity, so it is not asserted.
    [Fact]
    public async Task List_returned_items_have_module_and_dto_shape()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/true");
            var b = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            b!.Data.Should().NotBeEmpty();
            b.Data.Should().OnlyContain(x => !string.IsNullOrWhiteSpace(x.Name) && x.ModuleId > 0);
        }
        finally { await DbTestHelpers.CleanupUserAsync(_f, admin); }
    }

    // PIN: `all` has NO OrderBy (unlike `available`). Assert membership only, never sequence.
    [Fact]
    public async Task List_result_is_not_guaranteed_ordered()
    {
        var login = $"sa-{Guid.NewGuid():N}@test.com";
        var admin = await DbTestHelpers.SeedSuperAdminAsync(_f, login, "Password123");
        var a = await FeatureSeed.InsertFeatureUnderModuleAsync(_f, (int)ModuleType.Inventory, true, 9093);
        var b = await FeatureSeed.InsertFeatureUnderModuleAsync(_f, (int)ModuleType.Inventory, true, 9094);
        try
        {
            var r = await DbTestHelpers.AuthedClient(_f, admin, login).GetAsync("/api/v1/Features/all/true");
            var body = await r.Content.ReadFromJsonAsync<ApiResponse<List<FeatureDtoShape>>>(ApiResponse.Json);
            body!.Data.Select(x => x.Id).Should().Contain(new[] { 9093, 9094 }); // present regardless of order
        }
        finally
        {
            await FeatureSeed.DeleteFeatureAsync(_f, a);
            await FeatureSeed.DeleteFeatureAsync(_f, b);
            await DbTestHelpers.CleanupUserAsync(_f, admin);
        }
    }

    // Malformed bearer is rejected by the auth middleware before the class filter.
    [Fact]
    public async Task List_malformed_token_returns_401()
    {
        var client = _f.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-real-jwt");
        var r = await client.GetAsync("/api/v1/Features/all/true");
        r.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
