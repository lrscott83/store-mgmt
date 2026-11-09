using Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver;
using Application.Features.OnlineOrdering.Commands.UpdateDeliveryDriver;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// S11 — ni el nombre ni el teléfono admiten caracteres de CONTROL (salto de línea, tabulador,
/// retorno de carro).
///
/// No es cosmética: el nombre se pinta en la lista y en el selector de reparto de F5, y el teléfono
/// se convierte en un enlace `tel:` que el dueño marca desde el móvil. Un salto de línea parte la
/// fila; un tabulador deja un hueco que no se ve. Los dos se pueden escribir por API, así que el
/// rechazo tiene que estar en el servidor.
///
/// `Trim()` NO los cubre: recorta los de los EXTREMOS, no los de dentro.
/// </summary>
public class DeliveryDriverControlCharacterValidationTests
{
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public DeliveryDriverControlCharacterValidationTests()
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

    [Theory]
    [InlineData("Ana\nMaría")]
    [InlineData("Ana\rMaría")]
    [InlineData("Ana\tMaría")]
    public void Create_WithAControlCharacterInTheName_ShouldFail(string name)
    {
        var result = CreateValidator().Validate(ValidCreate(name: name));

        result.IsValid.Should().BeFalse("un salto de línea o un tabulador parte la fila de la lista");
        result.Errors.Should().Contain(error => error.ErrorMessage.Contains("control characters"));
    }

    [Theory]
    [InlineData("Ana\nMaría")]
    [InlineData("Ana\tMaría")]
    public void Update_WithAControlCharacterInTheName_ShouldFail(string name)
    {
        var result = UpdateValidator().Validate(ValidUpdate(name: name));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage.Contains("control characters"));
    }

    [Theory]
    [InlineData("+5351111\n111")]
    [InlineData("+5351111\r111")]
    [InlineData("+5351111\t111")]
    public void Create_WithAControlCharacterInThePhone_ShouldFail(string phone)
    {
        var result = CreateValidator().Validate(ValidCreate(phone: phone));

        result.IsValid.Should().BeFalse("el teléfono se convierte en un enlace que el dueño marca");
        result.Errors.Should().Contain(error => error.ErrorMessage.Contains("control characters"));
    }

    [Theory]
    [InlineData("+5351111\n111")]
    [InlineData("+5351111\t111")]
    public void Update_WithAControlCharacterInThePhone_ShouldFail(string phone)
    {
        var result = UpdateValidator().Validate(ValidUpdate(phone: phone));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage.Contains("control characters"));
    }

    /// <summary>
    /// El control positivo: nada de esto convierte el validador en "rechaza cualquier cosa rara". Un
    /// nombre con acentos y un teléfono con separadores siguen entrando.
    /// </summary>
    [Fact]
    public void Create_WithAccentsAndPhoneSeparators_ShouldPass()
    {
        CreateValidator()
            .Validate(ValidCreate(name: "Ana María Núñez", phone: "+53 (5) 123-4567"))
            .IsValid.Should().BeTrue();
    }
}
