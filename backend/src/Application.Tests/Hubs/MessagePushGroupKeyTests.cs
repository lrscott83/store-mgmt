using System.Security.Claims;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using SMCA.WebApi.Authentication;
using SMCA.WebApi.Hubs;
using Xunit;

namespace Application.Tests.Hubs;

/// <summary>
/// Pins the group-key contract that ties the SignalR hub's per-user group to
/// the key used by the server-side push service. A drift here is silent:
/// the push targets a group nobody ever joined and no message is delivered.
/// </summary>
public class MessagePushGroupKeyTests
{
    private static JwtOptions CreateJwtOptions() => new()
    {
        Issuer = "https://localhost:5001",
        Audience = "http://localhost:4200",
        SecretKey = "4750A660-27BF-454F-A174-9F9909745F80-TESTKEY",
        TokenLifetimeDays = 35,
    };

    private static JwtBearerOptions CreateBearerOptions(JwtOptions jwtOptions) => new()
    {
        TokenValidationParameters = new TokenValidationParameters
        {
            ClockSkew = TimeSpan.Zero,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SecretKey)),
        },
    };

    [Fact]
    public async Task Validated_principal_exposes_NameIdentifier_not_sub()
    {
        // Arrange — mint a token exactly like production (JwtProvider).
        var jwtOptions = CreateJwtOptions();
        var userId = Guid.NewGuid();
        var token = new JwtProvider(Options.Create(jwtOptions)).GenerateToken(userId, "owner@test.com");

        var bearerOptions = CreateBearerOptions(jwtOptions);

        // JwtBearerOptions.MapInboundClaims defaults to true; ASP.NET Core 8 validates
        // with JsonWebTokenHandler (UseSecurityTokenValidators is false by default).
        bearerOptions.UseSecurityTokenValidators.Should().BeFalse();
        var handler = new JsonWebTokenHandler { MapInboundClaims = bearerOptions.MapInboundClaims };

        // Act
        var result = await handler.ValidateTokenAsync(token, bearerOptions.TokenValidationParameters);

        // Assert
        result.IsValid.Should().BeTrue();

        // The hub must read NameIdentifier: the "sub" claim is never present,
        // neither on the wire nor in the validated principal.
        result.ClaimsIdentity.FindFirst("sub").Should().BeNull();
        var nameIdentifier = result.ClaimsIdentity.FindFirst(ClaimTypes.NameIdentifier);
        nameIdentifier.Should().NotBeNull();
        nameIdentifier!.Value.Should().Be(userId.ToString());
    }

    [Fact]
    public async Task Group_key_matches_the_authenticated_principal_claim_value()
    {
        // Arrange
        var jwtOptions = CreateJwtOptions();
        var userId = Guid.NewGuid();
        var token = new JwtProvider(Options.Create(jwtOptions)).GenerateToken(userId, "owner@test.com");

        var bearerOptions = CreateBearerOptions(jwtOptions);
        var handler = new JsonWebTokenHandler { MapInboundClaims = bearerOptions.MapInboundClaims };

        // Act
        var result = await handler.ValidateTokenAsync(token, bearerOptions.TokenValidationParameters);
        var groupKeyFromToken = result.ClaimsIdentity.FindFirst(ClaimTypes.NameIdentifier)!.Value;
        var groupKeyFromPushService = MessageGroupKey.ForUserId(userId);

        // Assert
        groupKeyFromPushService.Should().Be(groupKeyFromToken);
    }

    [Fact]
    public void Group_key_is_canonical_lowercase_hyphenated_guid()
    {
        var userId = Guid.Parse("6F9619FF-8B86-D011-B42D-00C04FC964FF");

        MessageGroupKey.ForUserId(userId).Should().Be("6f9619ff-8b86-d011-b42d-00c04fc964ff");
    }

    [Fact]
    public void Raw_jwt_payload_carries_NameIdentifier_not_sub()
    {
        // Documents WHY the hub must not look for "sub": JwtProvider writes the
        // ClaimTypes.NameIdentifier claim and JwtSecurityTokenHandler.WriteToken
        // serializes it verbatim under its long URI name. "sub" is never on the
        // wire, and the validated principal therefore exposes NameIdentifier.
        var jwtOptions = CreateJwtOptions();
        var userId = Guid.NewGuid();
        var token = new JwtProvider(Options.Create(jwtOptions)).GenerateToken(userId, "owner@test.com");

        var payloadSegment = token.Split('.')[1];
        var payloadJson = Encoding.UTF8.GetString(Base64UrlEncoder.DecodeBytes(payloadSegment));

        using var document = System.Text.Json.JsonDocument.Parse(payloadJson);
        document.RootElement.GetProperty(ClaimTypes.NameIdentifier).GetString().Should().Be(userId.ToString());
        document.RootElement.TryGetProperty("sub", out _).Should().BeFalse();
    }

    [Fact]
    public void Push_payload_uses_camelCase_property_names()
    {
        // Pins the wire contract the React client receives for "ReceiveMessage".
        // SignalR's default JSON protocol serializes with camelCase names.
        var options = new Microsoft.AspNetCore.SignalR.JsonHubProtocolOptions();
        var dto = new Application.Features.Messages.Queries.GetMessages.MessageDto
        {
            Id = Guid.NewGuid(),
            ConversationId = Guid.NewGuid(),
            SenderId = Guid.NewGuid(),
            RecipientId = Guid.NewGuid(),
            StoreId = Guid.NewGuid(),
            Content = "hello",
        };

        var json = System.Text.Json.JsonSerializer.Serialize(dto, options.PayloadSerializerOptions);

        json.Should().Contain("\"conversationId\"");
        json.Should().Contain("\"recipientId\"");
        json.Should().Contain("\"sentAt\"");
        json.Should().NotContain("\"ConversationId\"");
    }
}
