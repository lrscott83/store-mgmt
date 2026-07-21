using FluentAssertions;
using Microsoft.Extensions.Options;
using SMCA.WebApi.Authentication;
using System.IdentityModel.Tokens.Jwt;
using Xunit;

namespace Application.Tests.Authentication
{
    public class JwtProviderTests
    {
        private static JwtOptions CreateOptions(int tokenLifetimeDays) => new()
        {
            Issuer = "https://localhost:5001",
            Audience = "http://localhost:4200",
            SecretKey = "4750A660-27BF-454F-A174-9F9909745F80-TESTKEY",
            TokenLifetimeDays = tokenLifetimeDays,
        };

        [Fact]
        public void GenerateToken_WithConfiguredLifetime_ExpiresApproximatelyThatManyDaysOut()
        {
            // Arrange
            var options = CreateOptions(tokenLifetimeDays: 35);
            var sut = new JwtProvider(Options.Create(options));

            // Act
            var token = sut.GenerateToken(Guid.NewGuid(), "test-user");
            var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

            // Assert
            var expectedExpiry = DateTime.UtcNow.AddDays(35);
            jwt.ValidTo.Should().BeCloseTo(expectedExpiry, TimeSpan.FromMinutes(5));
        }

        [Fact]
        public void GenerateToken_WithSmallerConfiguredLifetime_ExpiresApproximatelyThatManyDaysOut()
        {
            // Arrange
            var options = CreateOptions(tokenLifetimeDays: 1);
            var sut = new JwtProvider(Options.Create(options));

            // Act
            var token = sut.GenerateToken(Guid.NewGuid(), "test-user");
            var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

            // Assert
            var expectedExpiry = DateTime.UtcNow.AddDays(1);
            jwt.ValidTo.Should().BeCloseTo(expectedExpiry, TimeSpan.FromMinutes(5));

            // proves it's configurable, not hardcoded: 1-day config must NOT look like 35 days out
            jwt.ValidTo.Should().BeBefore(DateTime.UtcNow.AddDays(5));
        }
    }
}
