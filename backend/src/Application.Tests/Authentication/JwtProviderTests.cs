using FluentAssertions;
using Microsoft.Extensions.Options;
using SMCA.WebApi.Authentication;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
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

        #region GenerateRefreshToken Tests

        [Fact]
        public void GenerateRefreshToken_returns_nonEmpty_string()
        {
            // Arrange
            var sut = new JwtProvider(Options.Create(CreateOptions(tokenLifetimeDays: 35)));

            // Act
            var token = sut.GenerateRefreshToken();

            // Assert
            token.Should().NotBeNullOrEmpty();
        }

        [Fact]
        public void GenerateRefreshToken_returns_base64_encoded_32_bytes()
        {
            // Arrange
            var sut = new JwtProvider(Options.Create(CreateOptions(tokenLifetimeDays: 35)));

            // Act
            var token = sut.GenerateRefreshToken();

            // Assert
            // Base64 decode should yield exactly 32 bytes
            var bytes = Convert.FromBase64String(token);
            bytes.Should().HaveCount(32);
        }

        [Fact]
        public void GenerateRefreshToken_two_calls_return_different_tokens()
        {
            // Arrange
            var sut = new JwtProvider(Options.Create(CreateOptions(tokenLifetimeDays: 35)));

            // Act
            var token1 = sut.GenerateRefreshToken();
            var token2 = sut.GenerateRefreshToken();

            // Assert — cryptographic randomness guarantees different values
            token1.Should().NotBe(token2);
        }

        #endregion
    }
}
