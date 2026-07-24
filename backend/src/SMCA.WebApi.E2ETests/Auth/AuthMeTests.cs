using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Application.Abstractions.Authentication;
using Application.Dtos.Authentication;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.Auth;

[Collection("e2e")]
public sealed class AuthMeTests
{
    private readonly WebAppFixture _fixture;
    private readonly HttpClient _client;

    public AuthMeTests(WebAppFixture fixture)
    {
        _fixture = fixture;
        _client = fixture.Factory.CreateClient();
    }

    [Fact]
    public async Task Me_with_valid_minted_token_returns_current_user()
    {
        var login = $"me-{Guid.NewGuid():N}@test.com";
        var userId = await SeedActiveUserAsync(login);
        var token = MintToken(userId, login);

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<CurrentUserDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        body.Data!.Id.Should().Be(userId);
        body.Data.Login.Should().Be(login);
    }

    private async Task<Guid> SeedActiveUserAsync(string login)
    {
        using var scope = _fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // User.Create sets IsActive=true (AuditableEntity default). /me does not check the password,
        // so a placeholder password value is fine here.
        var user = User.Create(login, "seed-hash", "E2E User", "0000000000", login, Guid.NewGuid());
        db.Set<User>().Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    private string MintToken(Guid userId, string login)
    {
        using var scope = _fixture.Factory.Services.CreateScope();
        var jwt = scope.ServiceProvider.GetRequiredService<IJwtProvider>();
        return jwt.GenerateToken(userId, login);
    }
}
