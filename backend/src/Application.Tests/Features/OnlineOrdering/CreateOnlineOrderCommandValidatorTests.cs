using Application.Features.OnlineOrdering.Commands.CreateOnlineOrder;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El validador del pedido online cubre SOLO el formato (longitudes, campos obligatorios del
/// payload). Lo que depende de la tienda —si admite la modalidad— NO está aquí a propósito: son
/// reglas de `StoreCatalogSettings` y las comprueba el handler, porque esta tienda y la siguiente
/// no tienen las mismas.
///
/// Y hay algo que este validador NO puede validar: el precio. No existe en el payload. Lo pone el
/// catálogo, en servidor.
/// </summary>
public class CreateOnlineOrderCommandValidatorTests
{
    /// <summary>
    /// Opciones del binding REAL de `POST /api/v1/public/ordering/{slug}/orders`, que recibe
    /// `[FromBody] CreateOnlineOrderCommand`. `JsonSerializerDefaults.Web` es lo que usa ASP.NET
    /// Core: sin su `PropertyNameCaseInsensitive`, un `"total"` minúsculo en el cuerpo NO llenaría
    /// un `Total` del contrato, y el test de "no hay campo de precio" pasaría por un motivo falso.
    /// </summary>
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

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
        StoreSlug = "tienda-ana",
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

    /// <summary>
    /// El slug viene de la RUTA (`/public/ordering/{storeSlug}/orders`): sin él el handler no
    /// puede ni resolver la tienda ni su configuración, así que el payload vacío se rechaza en la
    /// puerta más barata, antes de tocar la base.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Validate_WithABlankStoreSlug_ShouldFail(string slug)
    {
        CreateOnlineOrderCommand command = ValidCommand();
        command.StoreSlug = slug;

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

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
    /// F2-R4 — no hay campo de precio en el payload, y la ausencia es la garantía de que el cliente
    /// no puede fijar el total. Antes se afirmaba por reflexión con una lista de nombres
    /// (`Total`, `Price`, `UnitPrice`, `Currency`, `Subtotal`, `Amount`), que es frágil por partida
    /// doble: fija la FORMA del tipo en vez de lo que el cliente puede hacer con él, y solo miraba
    /// ESOS nombres — un `Importe` colado en el contrato pasaba el test.
    ///
    /// Ahora se afirma por COMPORTAMIENTO sobre el cuerpo real del endpoint
    /// (`[FromBody] CreateOnlineOrderCommand`, binding de ASP.NET Core): dos cuerpos gemelos, uno
    /// con `total`/`subtotal`/`amount`/`currency`/`price`/`unitPrice` colados en el pedido y en la
    /// línea y otro sin ellos, tienen que producir EXACTAMENTE el mismo comando. Si alguien añadiera
    /// un campo de importe al contrato, el binding lo llenaría y los dos comandos dejarían de ser
    /// iguales — sin importar cómo se llamara ese campo.
    ///
    /// Y el validador, que es de lo que trata esta suite, no inventa ninguna regla de precio: un
    /// cuerpo con precios colados se valida igual que uno limpio.
    /// </summary>
    [Fact]
    public void Validate_WithAPayloadFullOfPrices_ShouldProduceTheSameCommandAsACleanOne()
    {
        var productId = Guid.NewGuid();

        string cleanBody = $$"""
            {
              "storeSlug": "tienda-ana",
              "deliveryType": 0,
              "customerName": "Ana",
              "customerPhone": "+5350000000",
              "items": [ { "productId": "{{productId}}", "quantity": 2 } ]
            }
            """;
        string tamperedBody = $$"""
            {
              "storeSlug": "tienda-ana",
              "deliveryType": 0,
              "customerName": "Ana",
              "customerPhone": "+5350000000",
              "total": 1, "subtotal": 1, "amount": 1, "currency": "USD", "price": 1, "unitPrice": 1,
              "items": [
                { "productId": "{{productId}}", "quantity": 2,
                  "price": 1, "unitPrice": 1, "total": 1, "currency": "USD" }
              ]
            }
            """;

        CreateOnlineOrderCommand tampered =
            JsonSerializer.Deserialize<CreateOnlineOrderCommand>(tamperedBody, WebJson)!;
        CreateOnlineOrderCommand clean =
            JsonSerializer.Deserialize<CreateOnlineOrderCommand>(cleanBody, WebJson)!;

        // El precio del cliente no llega ni al comando ni a la línea del carrito.
        JsonSerializer.Serialize(tampered).Should().Be(JsonSerializer.Serialize(clean));
        tampered.Items.Should().BeEquivalentTo(clean.Items);

        // Y el validador no se inventa una regla que no le corresponde: sigue siendo válido.
        Validator().Validate(tampered).IsValid.Should().BeTrue();
    }

    #endregion
}