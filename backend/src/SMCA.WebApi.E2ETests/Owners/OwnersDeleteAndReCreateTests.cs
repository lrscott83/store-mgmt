using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Administration.Owners;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Owners;

/// <summary>
/// E2E lifecycle test: create → hard-delete → verify deleted → re-create → verify exists.
/// Proves that after a hard delete the owner is fully removed (all child rows) and the same
/// email/login can be reused for a brand-new owner.
/// </summary>
[Collection("e2e")]
public sealed class OwnersDeleteAndReCreateTests
{
    private readonly AppTestFactory _f;
    public OwnersDeleteAndReCreateTests(WebAppFixture fixture) => _f = fixture.Factory;

    [Fact]
    public async Task Create_hard_delete_then_recreate_owner_succeeds()
    {
        // ── arrange ────────────────────────────────────────────────────────
        var saLogin = $"sa-{Guid.NewGuid():N}@test.com";
        var saId = await DbTestHelpers.SeedSuperAdminAsync(_f, saLogin, "Password123");
        var client = DbTestHelpers.AuthedClient(_f, saId, saLogin);

        var ownerLogin1 = $"owner-{Guid.NewGuid():N}@test.com";

        try
        {
            // ── act 1: create the owner via API ────────────────────────────
            var createRes = await client.PostAsJsonAsync("/api/v1/Owners", new
            {
                Login = ownerLogin1,
                Password = "Password123",
                FullName = "Lifecycle Owner",
                Cellphone = "0000000000",
                ReSellerId = (Guid?)null,
                Email = (string?)null,
                Description = "e2e lifecycle"
            });
            createRes.StatusCode.Should().Be(HttpStatusCode.Created);

            var created = await createRes.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            created!.Succeeded.Should().BeTrue();
            var ownerId = created.Data!.Id;
            var userId = created.Data.UserId;
            ownerId.Should().NotBeEmpty();

            // ── act 2: hard-delete the owner via API ───────────────────────
            var deleteRes = await client.DeleteAsync($"/api/v1/Owners/{ownerId}");
            deleteRes.StatusCode.Should().Be(HttpStatusCode.OK);

            var deleteBody = await deleteRes.Content.ReadFromJsonAsync<ApiResponse<bool>>(ApiResponse.Json);
            deleteBody!.Succeeded.Should().BeTrue();

            // ── assert 2: owner no longer exists ────────────────────────────
            var getRes = await client.GetAsync($"/api/v1/Owners/{ownerId}");
            getRes.StatusCode.Should().Be(HttpStatusCode.OK);
            var getBody = await getRes.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            getBody!.Succeeded.Should().BeFalse();
            getBody.ActionCode.Should().Be(404);
            getBody.Errors.Should().Contain(e => e.Code == "Owner.NotFound");

            // ── act 3: re-create the owner with the SAME login and data ───
            var recreateRes = await client.PostAsJsonAsync("/api/v1/Owners", new
            {
                Login = ownerLogin1,
                Password = "Password123",
                FullName = "Lifecycle Owner",
                Cellphone = "0000000000",
                ReSellerId = (Guid?)null,
                Email = (string?)null,
                Description = "e2e lifecycle"
            });
            recreateRes.StatusCode.Should().Be(HttpStatusCode.Created);

            var recreated = await recreateRes.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            recreated!.Succeeded.Should().BeTrue();
            recreated.Data!.Id.Should().NotBeEmpty();
            recreated.Data.Id.Should().NotBe(ownerId, "a new GUID must be assigned");
            recreated.Data.Login.Should().Be(ownerLogin1);
            recreated.Data.FullName.Should().Be("Lifecycle Owner");

            // ── assert 3: the new owner is reachable via GET ───────────────
            var getRes2 = await client.GetAsync($"/api/v1/Owners/{recreated.Data.Id}");
            getRes2.StatusCode.Should().Be(HttpStatusCode.OK);
            var getBody2 = await getRes2.Content.ReadFromJsonAsync<ApiResponse<OwnerDto>>(ApiResponse.Json);
            getBody2!.Succeeded.Should().BeTrue();
            getBody2.Data!.Id.Should().Be(recreated.Data.Id);
        }
        finally
        {
            // Best-effort cleanup: reset accumulated test data, then remove the SA.
            using var scope = _f.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await DbTestHelpers.ResetDataAsync(db);
            await DbTestHelpers.CleanupUserAsync(_f, saId);
        }
    }
}
