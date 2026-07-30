using System.Net;
using System.Net.Http.Json;
using Application.Dtos.Authentication;
using Domain.Entities.Owners;
using Domain.Entities.Stores;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthRegisterSuccessTests
{
    private readonly AppTestFactory _factory;
    private readonly HttpClient _client;

    public AuthRegisterSuccessTests(WebAppFixture fixture)
    {
        _factory = fixture.Factory;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Register_with_valid_payload_creates_owner_and_store()
    {
        var login = $"reg-{Guid.NewGuid():N}@test.com";
        var storeName = $"Store-{Guid.NewGuid():N}";
        Guid tenantId = Guid.Empty;
        try
        {
            var response = await _client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                Login = login,
                Password = "Password123",
                FullName = "E2E Owner",
                CellPhone = "0000000000",
                Email = (string?)null,
                StoreName = storeName,
                Code = (string?)null
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created);
            var body = await response.Content.ReadFromJsonAsync<ApiResponse<AuthDto>>(ApiResponse.Json);
            body!.Succeeded.Should().BeTrue();
            body.Data.Should().NotBeNull();
            body.Data!.Login.Should().Be(login);
            body.Data.AuthToken.Should().NotBeNullOrEmpty();
            body.Data.ExpiresIn.Should().BeAfter(DateTime.UtcNow);

            var user = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
            user.Should().NotBeNull();
            tenantId = user!.TenantId;

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            (await db.Set<Owner>().IgnoreQueryFilters().AnyAsync(o => o.UserId == user.Id)).Should().BeTrue();
            (await db.Set<Store>().IgnoreQueryFilters().AnyAsync(s => s.TenantId == tenantId)).Should().BeTrue();
        }
        finally
        {
            if (tenantId == Guid.Empty)
            {
                var created = await DbTestHelpers.GetUserByLoginAsync(_factory, login);
                if (created is not null) tenantId = created.TenantId;
            }
            if (tenantId != Guid.Empty)
                await DbTestHelpers.CleanupTenantCascadeAsync(_factory, tenantId);
        }
    }
}