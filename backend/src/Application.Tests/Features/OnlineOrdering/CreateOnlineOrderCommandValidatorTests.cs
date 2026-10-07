using Application.Features.OnlineOrdering.Commands.CreateOnlineOrder;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El validador del pedido online cubre SOLO el formato (longitudes, campos obligatorios del
/// payload). Lo que depende de la tienda —si admite la modalidad, el importe mínimo, el envío— NO
/// está aquí a propósito: son reglas de `StoreCatalogSettings` y las comprueba el handler, porque
/// esta tienda y la siguiente no tienen las mismas.
///
/// Y hay algo que este validador NO puede validar: el precio. No existe en el payload. Lo pone el
/// catálogo, en servidor.
/// </summary>
public class CreateOnlineOrderCommandValidatorTests
{
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public CreateOnlineOrderCommandValidatorTests()
    {
        // Sin este stub el indexador devuelve un `LocalizedString` vacío y `WithMessage(null)`
        // revienta al CONSTRUIR el validador: el mensaje es obligatorio para FluentValidation.
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));
    }

    private CreateOnlineOrderCommandValidator Validator() => new(_localizer.Object);

    private static CreateOnlineOrderCommand ValidCommand() => new()
    {
        DeliveryType = (int)Domain.Common.Enums.OrderDeliveryType.Pickup,
        CustomerName = "Ana",
        CustomerPhone = "+5350000000",
        Items = [new CreateOnlineOrderLineRequest { ProductId = Guid.NewGuid(), Quantity = 2 }],
    };

    #region Happy Path

    [Fact]
    public void Validate_WithAValidCommand_ShouldPass()
    {
        Validator().Validate(ValidCommand()).IsValid.Should().BeTrue();
    }

    /// <summary>Las notas y la dirección son opcionales: no hacen fallar el comando.</summary>
    [Fact]
    public void Validate_WithoutNotesOrAddress_ShouldPass()
    {
        CreateOnlineOrderCommand command = ValidCommand();

        Validator().Validate(command).IsValid.Should().BeTrue();
    }

    #endregion

    #region Edge Cases

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Validate_WithABlankCustomerName_ShouldFail(string name)
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.CustomerName = name;

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Validate_WithABlankCustomerPhone_ShouldFail(string phone)
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.CustomerPhone = phone;

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WithoutLines_ShouldFail()
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.Items = [];

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WithANullLinesList_ShouldFail()
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.Items = null!;

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Validate_WithANonPositiveQuantity_ShouldFail(int quantity)
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.Items = [new CreateOnlineOrderLineRequest { ProductId = Guid.NewGuid(), Quantity = quantity }];

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WithAnEmptyProductId_ShouldFail()
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.Items = [new CreateOnlineOrderLineRequest { ProductId = Guid.Empty, Quantity = 1 }];

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WithAnOverlongCustomerName_ShouldFail()
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.CustomerName = new string('a', CreateOnlineOrderCommand.CustomerNameMaxLength + 1);

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WithAnOverlongNotes_ShouldFail()
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.Notes = new string('a', CreateOnlineOrderCommand.NotesMaxLength + 1);

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    /// <summary>Una sola línea mala ya invalida el pedido: el carrito es entero o no es.</summary>
    [Fact]
    public void Validate_WithOneBadLineAmongGoodOnes_ShouldFail()
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.Items =
        [
            new CreateOnlineOrderLineRequest { ProductId = Guid.NewGuid(), Quantity = 1 },
            new CreateOnlineOrderLineRequest { ProductId = Guid.NewGuid(), Quantity = 0 },
        ];

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    #endregion

    #region Error Handling — lo que el validador NO decide

    /// <summary>
    /// La modalidad la valida el handler contra la configuración de la tienda. Aquí el validador
    /// deja pasar incluso un valor de enum que no existe, porque su regla es solo "es un entero":
    /// rechazarlo aquí mezclaría una regla de la tienda con una de formato.
    /// </summary>
    [Fact]
    public void Validate_ShouldNotJudgeTheDeliveryType_ThatIsTheHandlersJob()
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.DeliveryType = 999;

        Validator().Validate(command).IsValid.Should().BeTrue();
    }

    /// <summary>
    /// No hay campo de precio en el payload: la ausencia es la garantía de que el cliente no puede
    /// fijar el total. Este test falla si alguien añade un `UnitPrice` al contrato.
    /// </summary>
    [Fact]
    public void CreateOnlineOrderCommand_ShouldCarryNoPriceFieldAtAll()
    {
        typeof(CreateOnlineOrderCommand).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain(new[] { "Total", "Price", "UnitPrice", "Currency", "Subtotal", "Amount" });

        typeof(CreateOnlineOrderLineRequest).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain(new[] { "Price", "UnitPrice", "Total" });
    }

    #endregion
}