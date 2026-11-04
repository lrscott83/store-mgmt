using Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver;
using Application.Features.OnlineOrdering.Commands.UpdateDeliveryDriver;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// S11 — los límites de columna se miden sobre el valor RECORTADO, que es el que se persiste.
///
/// El handler recorta `Name`/`Phone` antes de guardar, así que un validador que mida la cadena
/// cruda rechaza entradas que SÍ caben en la columna: 200 caracteres con espacios alrededor son
/// 200 caracteres en la base. El caso contrario también importa — 201 caracteres recortados no
/// caben, y aceptarlos cambiaría el 400 por un 500 del INSERT.
/// </summary>
public class DeliveryDriverTrimmedValidationTests
{
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public DeliveryDriverTrimmedValidationTests()
    {
        // Sin el stub, el indexador devuelve un `LocalizedString` vacío y `WithMessage(null)` revienta
        // al construir el validador. El nombre clave viaja en el texto para poder afirmar QUÉ regla
        // falló, no solo que algo falló.
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

    #region Name

    /// <summary>
    /// El valor que cabe: 200 caracteres útiles rodeados de espacios. Rechazarlo obligaría al dueño a
    /// adivinar cuántos espacios puede escribir.
    /// </summary>
    [Fact]
    public void Create_WithAFullLengthNameSurroundedBySpaces_ShouldPass()
    {
        string name = $"  {new string('a', CreateDeliveryDriverCommand.NameMaxLength)}  ";

        CreateValidator().Validate(ValidCreate(name: name)).IsValid.Should().BeTrue(
            "el límite se mide sobre el valor recortado, que es el que se guarda");
    }

    /// <summary>
    /// 201 caracteres útiles: los espacios de alrededor no lo salvan, porque tampoco lo salvan en la
    /// columna. Aceptarlo sería un 500 del INSERT.
    /// </summary>
    [Fact]
    public void Create_WithOneCharacterOverTheLimitOnceTrimmed_ShouldFail()
    {
        string name = $"  {new string('a', CreateDeliveryDriverCommand.NameMaxLength + 1)}  ";

        var result = CreateValidator().Validate(ValidCreate(name: name));

        result.IsValid.Should().BeFalse("201 caracteres recortados no caben en la columna");
        result.Errors.Should().Contain(error => error.ErrorMessage.Contains("DeliveryDriverNameTooLong"),
            "el fallo tiene que ser el de longitud, no el de obligatoriedad");
    }

    [Fact]
    public void Update_WithAFullLengthNameSurroundedBySpaces_ShouldPass()
    {
        string name = $"  {new string('a', UpdateDeliveryDriverCommand.NameMaxLength)}  ";

        UpdateValidator().Validate(ValidUpdate(name: name)).IsValid.Should().BeTrue(
            "la edición se mide con la misma regla que el alta");
    }

    [Fact]
    public void Update_WithOneCharacterOverTheLimitOnceTrimmed_ShouldFail()
    {
        string name = $"  {new string('a', UpdateDeliveryDriverCommand.NameMaxLength + 1)}  ";

        var result = UpdateValidator().Validate(ValidUpdate(name: name));

        result.IsValid.Should().BeFalse("201 caracteres recortados no caben en la columna");
        result.Errors.Should().Contain(error => error.ErrorMessage.Contains("DeliveryDriverNameTooLong"));
    }

    #endregion

    #region Phone

    [Fact]
    public void Create_WithAPhoneExactlyAtTheColumnLimitSurroundedBySpaces_ShouldPass()
    {
        string phone = $"  +{new string('1', CreateDeliveryDriverCommand.PhoneMaxLength - 1)}  ";

        CreateValidator().Validate(ValidCreate(phone: phone)).IsValid.Should().BeTrue(
            "el teléfono persistido mide exactamente el límite de la columna");
    }

    [Fact]
    public void Create_WithAPhoneOverTheColumnLimitOnceTrimmed_ShouldFail()
    {
        string phone = $"  +{new string('1', CreateDeliveryDriverCommand.PhoneMaxLength)}  ";

        var result = CreateValidator().Validate(ValidCreate(phone: phone));

        result.IsValid.Should().BeFalse("el teléfono recortado desborda la columna");
        result.Errors.Should().Contain(error => error.ErrorMessage.Contains("DeliveryDriverPhoneTooLong"));
    }

    [Fact]
    public void Update_WithAPhoneExactlyAtTheColumnLimitSurroundedBySpaces_ShouldPass()
    {
        string phone = $"  +{new string('1', UpdateDeliveryDriverCommand.PhoneMaxLength - 1)}  ";

        UpdateValidator().Validate(ValidUpdate(phone: phone)).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Update_WithAPhoneOverTheColumnLimitOnceTrimmed_ShouldFail()
    {
        string phone = $"  +{new string('1', UpdateDeliveryDriverCommand.PhoneMaxLength)}  ";

        var result = UpdateValidator().Validate(ValidUpdate(phone: phone));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage.Contains("DeliveryDriverPhoneTooLong"));
    }

    #endregion
}
