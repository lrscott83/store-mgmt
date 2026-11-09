using Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver;
using Application.Features.OnlineOrdering.Commands.UpdateDeliveryDriver;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// S11 — el teléfono del repartidor no se normaliza (D17: se marca en un móvil, la gente escribe
/// `+53 5 123 4567` o `5351234567`), pero SÍ tiene que ser un teléfono: solo caracteres de teléfono
/// (dígitos, espacio, `+`, `-`, `(`, `)`) y al menos 6 dígitos.
///
/// La regla se eligió midiendo contra lo que los tests existentes fijan como válido: los tres
/// formatos razonables del validador, el valor exacto del límite de columna (`+` y 31 unos) y los
/// teléfonos sembrados en los E2E (`555-0000`). Todos la cumplen, así que la regla los conserva.
///
/// Un teléfono sin ningún dígito no es un teléfono: hoy entra y produce un enlace `tel:` que no
/// marca a ningún sitio.
/// </summary>
public class DeliveryDriverPhoneFormatValidationTests
{
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public DeliveryDriverPhoneFormatValidationTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));
    }

    private CreateDeliveryDriverCommandValidator CreateValidator() => new(_localizer.Object);

    private UpdateDeliveryDriverCommandValidator UpdateValidator() => new(_localizer.Object);

    private static CreateDeliveryDriverCommand ValidCreate(string name = "Ana", string phone = "+5351111111")
        => new() { Name = name, Phone = phone };

    private static UpdateDeliveryDriverCommand ValidUpdate(string name = "Ana", string phone = "+5351111111")
        => new() { Id = Guid.NewGuid(), Name = name, Phone = phone, IsActive = true };

    #region Regla: solo caracteres de teléfono

    [Theory]
    [InlineData("+53 5 ABC 4567")]
    [InlineData("llamar a Ana")]
    [InlineData("+53 5 123 4567 #12")]
    [InlineData("+53 5 123 4567 / 12")]
    public void Create_WithNonPhoneCharacters_ShouldFail(string phone)
    {
        var result = CreateValidator().Validate(ValidCreate(phone: phone));

        result.IsValid.Should().BeFalse("un teléfono con letras no se puede marcar");
        result.Errors.Should().Contain(error => error.ErrorMessage.Contains("only contain"),
            "el fallo tiene que ser el de caracteres, no el de obligatoriedad");
    }

    /// <summary>
    /// R1-2: el validador de la edición ya NO rechaza el teléfono heredado, porque corre en cada
    /// petición y no ve la fila guardada. Su trabajo es que el cuerpo traiga un texto utilizable;
    /// las reglas estrictas las aplica el handler SOLO cuando el teléfono cambia (ver
    /// <c>DeliveryDriverLegacyPhoneUpdateTests</c>, que fija el 400 con este mismo mensaje).
    ///
    /// Este caso era `..._ShouldFail` cuando el validador llevaba el juego estricto. Invertirlo es
    /// la consecuencia directa del cambio, no un aflojamiento: el rechazo sigue existiendo, un paso
    /// más abajo y con la misma respuesta.
    /// </summary>
    [Theory]
    [InlineData("+53 5 ABC 4567")]
    [InlineData("llamar a Ana")]
    public void Update_WithNonPhoneCharacters_ShouldBeDeferredToTheHandler(string phone)
    {
        var result = UpdateValidator().Validate(ValidUpdate(phone: phone));

        result.IsValid.Should().BeTrue(
            "un teléfono heredado tiene que poder viajar de vuelta sin cambios");
    }

    #endregion

    #region Regla: al menos 6 dígitos

    [Theory]
    [InlineData("+---")]
    [InlineData("- ( )")]
    [InlineData("12345")]
    [InlineData("+53 12")]
    public void Create_WithFewerThanSixDigits_ShouldFail(string phone)
    {
        var result = CreateValidator().Validate(ValidCreate(phone: phone));

        result.IsValid.Should().BeFalse("seis dígitos es el mínimo de un número marcable");
        result.Errors.Should().Contain(error => error.ErrorMessage.Contains("at least 6 digits"));
    }

    [Theory]
    [InlineData("+1 (23) 456")]
    [InlineData("555-0000")]
    public void Create_WithAtLeastSixDigits_ShouldPass(string phone)
    {
        CreateValidator().Validate(ValidCreate(phone: phone)).IsValid.Should().BeTrue(
            "la regla es el mínimo de dígitos, no un formato concreto");
    }

    #endregion

    #region Preservación de los formatos que los tests existentes fijan

    /// <summary>
    /// Los tres formatos que el validador ya aceptaba, más el valor exacto del límite de la columna.
    /// Si la regla nueva los rechazara, habría roto entradas que hoy son válidas.
    /// </summary>
    [Theory]
    [InlineData("+53 5 123 4567")]
    [InlineData("5351234567")]
    [InlineData("+53-5-123-4567")]
    [InlineData("+5351111111")]
    public void Create_WithTheAlreadyPinnedFormats_ShouldStillPass(string phone)
    {
        CreateValidator().Validate(ValidCreate(phone: phone)).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Create_WithAPhoneAtTheColumnLimit_ShouldStillPass()
    {
        string phone = "+" + new string('1', CreateDeliveryDriverCommand.PhoneMaxLength - 1);

        CreateValidator().Validate(ValidCreate(phone: phone)).IsValid.Should().BeTrue(
            "el valor exacto del límite tiene que seguir entrando");
    }

    #endregion
}
