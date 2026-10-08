using Application.Features.OnlineOrdering.Commands.CreateDeliveryDriver;
using Application.Features.OnlineOrdering.Commands.UpdateDeliveryDriver;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El validador del CATÁLOGO de repartidores (F7) decide solo el FORMATO de lo que escribe el
/// dueño: nombre y teléfono no pueden faltar ni desbordar la columna.
///
/// Lo que NO valida, y es deliberado:
///
///   * El FORMATO del teléfono. Es texto para marcar en un móvil (D17: prefijo internacional),
///     no un teléfono normalizable: un número con guiones sigue siendo un número válido.
///   * La EXISTENCIA del repartidor ni de la tienda. Eso lo decide el handler, contra la base de
///     datos; un validador no puede saberlo.
///   * La UNICIDAD del nombre. `DeliveryDriver` no lleva índice único por diseño: dos personas
///     pueden llamarse igual.
/// </summary>
public class DeliveryDriverCommandValidatorTests
{
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public DeliveryDriverCommandValidatorTests()
    {
        // Sin este stub el indexador devuelve un `LocalizedString` vacío y `WithMessage(null)`
        // revienta al CONSTRUIR el validador: el mensaje es obligatorio para FluentValidation.
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));
    }

    private CreateDeliveryDriverCommandValidator CreateValidator() => new(_localizer.Object);

    private UpdateDeliveryDriverCommandValidator UpdateValidator() => new(_localizer.Object);

    /// <summary>Alta válida: lo mínimo que el dueño escribe de verdad.</summary>
    private static CreateDeliveryDriverCommand ValidCreate(string name = "Ana", string phone = "+5351111111")
        => new() { Name = name, Phone = phone };

    private static UpdateDeliveryDriverCommand ValidUpdate(
        string name = "Ana", string phone = "+5351111111", bool isActive = true)
        => new() { Id = Guid.NewGuid(), Name = name, Phone = phone, IsActive = isActive };

    #region Happy Path

    [Fact]
    public void Create_WithNameAndPhone_ShouldPass()
    {
        CreateValidator().Validate(ValidCreate()).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Update_WithNameAndPhone_ShouldPass()
    {
        UpdateValidator().Validate(ValidUpdate()).IsValid.Should().BeTrue();
    }

    /// <summary>
    /// Desactivar es una operación legítima: el interruptor va en el mismo comando, así que un
    /// repartidor con nombre y teléfono válidos debe poder guardarse apagado.
    /// </summary>
    [Fact]
    public void Update_DeactivatingAnOtherwiseValidDriver_ShouldPass()
    {
        UpdateValidator().Validate(ValidUpdate(isActive: false)).IsValid.Should().BeTrue();
    }

    /// <summary>
    /// El teléfono es texto libre, no un teléfono validable: separadores y signo más son válidos.
    /// Normalizarlo aquí rechazaría números que la gente escribe todos los días.
    /// </summary>
    [Theory]
    [InlineData("+53 5 123 4567")]
    [InlineData("5351234567")]
    [InlineData("+53-5-123-4567")]
    public void Create_WithAnyReasonablePhoneFormat_ShouldPass(string phone)
    {
        CreateValidator().Validate(ValidCreate(phone: phone)).IsValid.Should().BeTrue();
    }

    #endregion

    #region Name

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithoutAName_ShouldFail(string name)
    {
        CreateValidator().Validate(ValidCreate(name: name)).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Create_WithANullName_ShouldFail()
    {
        CreateValidator().Validate(ValidCreate(name: null!)).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Create_WithANameOverTheColumnLength_ShouldFail()
    {
        string name = new('a', CreateDeliveryDriverCommand.NameMaxLength + 1);

        CreateValidator().Validate(ValidCreate(name: name)).IsValid.Should().BeFalse();
    }

    /// <summary>Exactamente en el límite de la columna entra: es el máximo que la base acepta.</summary>
    [Fact]
    public void Create_WithANameExactlyAtTheColumnLength_ShouldPass()
    {
        string name = new('a', CreateDeliveryDriverCommand.NameMaxLength);

        CreateValidator().Validate(ValidCreate(name: name)).IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Update_WithoutAName_ShouldFail(string name)
    {
        UpdateValidator().Validate(ValidUpdate(name: name)).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Update_WithANameOverTheColumnLength_ShouldFail()
    {
        string name = new('a', UpdateDeliveryDriverCommand.NameMaxLength + 1);

        UpdateValidator().Validate(ValidUpdate(name: name)).IsValid.Should().BeFalse();
    }

    #endregion

    #region Phone

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithoutAPhone_ShouldFail(string phone)
    {
        CreateValidator().Validate(ValidCreate(phone: phone)).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Create_WithAPhoneOverTheColumnLength_ShouldFail()
    {
        string phone = new('9', CreateDeliveryDriverCommand.PhoneMaxLength + 1);

        CreateValidator().Validate(ValidCreate(phone: phone)).IsValid.Should().BeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Update_WithoutAPhone_ShouldFail(string phone)
    {
        UpdateValidator().Validate(ValidUpdate(phone: phone)).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Update_WithAPhoneOverTheColumnLength_ShouldFail()
    {
        string phone = new('9', UpdateDeliveryDriverCommand.PhoneMaxLength + 1);

        UpdateValidator().Validate(ValidUpdate(phone: phone)).IsValid.Should().BeFalse();
    }

    #endregion

    #region Id (solo update)

    /// <summary>Sin id no hay fila que actualizar: la ruta siempre lo trae, pero el cuerpo no.</summary>
    [Fact]
    public void Update_WithoutAnId_ShouldFail()
    {
        UpdateDeliveryDriverCommand command = ValidUpdate();
        command.Id = Guid.Empty;

        UpdateValidator().Validate(command).IsValid.Should().BeFalse();
    }

    #endregion
}
