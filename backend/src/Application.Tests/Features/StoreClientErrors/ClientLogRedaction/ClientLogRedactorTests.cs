using Application.Common.ClientLogRedaction;
using FluentAssertions;
using System.Text.Json;

namespace Application.Tests.Features.StoreClientErrors.ClientLogRedaction;

/// <summary>
/// El scrubbing del servidor es la ÚLTIMA línea: el POS ya redacta antes de guardar en su buffer,
/// pero el backend no puede confiar en que el cliente lo haya hecho (una versión vieja del POS, una
/// petición manual con token). Estas pruebas fijan las dos reglas que el servidor garantiza por su
/// cuenta — claves sensibles y `Bearer` en texto libre — y que la limpieza es determinista.
/// </summary>
public class ClientLogRedactorTests
{
    private const string Redacted = "[REDACTED]";

    #region Texto libre

    [Fact]
    public void RedactText_WithBearerToken_ReplacesTheToken()
    {
        // Act
        string? redacted = ClientLogRedactor.RedactText(
            "GET /v1/me falló con Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def");

        // Assert
        redacted.Should().Be("GET /v1/me falló con Authorization: Bearer [REDACTED]");
    }

    [Theory]
    [InlineData("bearer abc123")]
    [InlineData("BEARER abc123")]
    [InlineData("Bearer   abc123")]
    public void RedactText_WithBearerInAnyCasingOrSpacing_ReplacesTheToken(string text)
    {
        // Act
        string? redacted = ClientLogRedactor.RedactText(text);

        // Assert
        redacted.Should().Be("Bearer [REDACTED]");
    }

    [Fact]
    public void RedactText_WithSeveralBearerTokens_ReplacesEveryOne()
    {
        // Act
        string? redacted = ClientLogRedactor.RedactText("Bearer aaa and Bearer bbb");

        // Assert
        redacted.Should().Be("Bearer [REDACTED] and Bearer [REDACTED]");
    }

    [Fact]
    public void RedactText_WithNothingToRedact_ReturnsTheTextUnchanged()
    {
        // Act
        string? redacted = ClientLogRedactor.RedactText("TypeError: cannot read properties of undefined");

        // Assert
        redacted.Should().Be("TypeError: cannot read properties of undefined");
    }

    [Fact]
    public void RedactText_WithNull_ReturnsNull()
    {
        // Act / Assert
        ClientLogRedactor.RedactText(null).Should().BeNull();
    }

    [Fact]
    public void RedactText_IsIdempotent()
    {
        // Arrange
        const string once = "Authorization: Bearer [REDACTED]";

        // Act
        string? twice = ClientLogRedactor.RedactText(ClientLogRedactor.RedactText(once));

        // Assert
        twice.Should().Be(once);
    }

    #endregion

    #region Claves sensibles

    [Theory]
    [InlineData("token")]
    [InlineData("accessToken")]
    [InlineData("refresh_token")]
    [InlineData("password")]
    [InlineData("userPassword")]
    [InlineData("secret")]
    [InlineData("clientSecret")]
    [InlineData("authorization")]
    [InlineData("Authorization")]
    [InlineData("dek")]
    [InlineData("offlineAuthToken")]
    public void RedactContext_WithASensitiveKey_ReplacesItsValue(string key)
    {
        // Arrange
        var context = new Dictionary<string, object?> { [key] = "super-secret-value" };

        // Act
        Dictionary<string, object?>? redacted = ClientLogRedactor.RedactContext(context);

        // Assert
        redacted.Should().NotBeNull();
        redacted![key].Should().Be(Redacted);
    }

    [Fact]
    public void RedactContext_WithNonSensitiveKeys_KeepsTheirValues()
    {
        // Arrange
        var context = new Dictionary<string, object?>
        {
            ["productId"] = "abc",
            ["count"] = 3,
            ["online"] = true,
            ["note"] = null,
        };

        // Act
        Dictionary<string, object?>? redacted = ClientLogRedactor.RedactContext(context);

        // Assert
        redacted.Should().BeEquivalentTo(context);
    }

    [Fact]
    public void RedactContext_WithBearerInANonSensitiveStringValue_ScrubsTheToken()
    {
        // Arrange
        var context = new Dictionary<string, object?> { ["request"] = "Authorization: Bearer abc.def" };

        // Act
        Dictionary<string, object?>? redacted = ClientLogRedactor.RedactContext(context);

        // Assert
        redacted!["request"].Should().Be("Authorization: Bearer [REDACTED]");
    }

    [Fact]
    public void RedactContext_WithNestedObject_ScrubsTheNestedSensitiveKey()
    {
        // Arrange
        var nested = new Dictionary<string, object?> { ["password"] = "hunter2", ["keep"] = "value" };
        var context = new Dictionary<string, object?> { ["session"] = nested };

        // Act
        Dictionary<string, object?>? redacted = ClientLogRedactor.RedactContext(context);

        // Assert
        var cleaned = redacted!["session"].Should().BeOfType<Dictionary<string, object?>>().Subject;
        cleaned["password"].Should().Be(Redacted);
        cleaned["keep"].Should().Be("value");
    }

    [Fact]
    public void RedactContext_WithAJsonElementBody_ScrubsTheKeysItCarries()
    {
        // El binding real de `Dictionary<string, object?>` deja JsonElement, no strings: se prueba
        // con la forma que llega de verdad, no con la cómoda.
        Dictionary<string, object?> context = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """{"accessToken":"abc.def","route":"/sales/new","nested":{"dek":"k"}}""")!;

        // Act
        string json = JsonSerializer.Serialize(ClientLogRedactor.RedactContext(context));

        // Assert
        json.Should().Contain("[REDACTED]");
        json.Should().NotContain("abc.def");
        json.Should().Contain("/sales/new");
        json.Should().NotContain("\"k\"");
    }

    [Fact]
    public void RedactContext_WithNullOrEmpty_ReturnsTheSameEmptyShape()
    {
        // Act / Assert
        ClientLogRedactor.RedactContext(null).Should().BeNull();
        ClientLogRedactor.RedactContext(new Dictionary<string, object?>()).Should().BeEmpty();
    }

    #endregion
}
