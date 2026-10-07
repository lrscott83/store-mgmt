using Application.Features.OnlineOrdering.Commands.UpsertStoreCatalogSettings;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.OnlineOrdering;

/// <summary>
/// El validador de la CONFIGURACIÓN de pedidos (F1) decide si la tienda puede abrir el interruptor
/// con lo que el dueño acaba de escribir. Tres reglas con una razón de negocio detrás, y todas
/// importan:
///
///   * `Enabled` SIN número de WhatsApp → rechazado. No importa la modalidad: TODOS los pedidos
///     salen por `wa.me`, así que sin número no hay a dónde enviar ni uno solo.
///   * `Enabled` sin ninguna modalidad (ni recogida ni envío) → rechazado. Un pedido abierto que
///     no se puede recoger ni enviar es un pedido que nadie puede hacer.
///   * Importes negativos → rechazados siempre, habilitado o no: un costo de envío negativo
///     cobraría de más al cliente y ningún total cuadraría.
///
/// Y lo que NO decide: el formato del número (no es un teléfono validable, es texto para `wa.me`),
/// ni nada de la marca (F8), ni la existencia de la tienda.
/// </summary>
public class UpsertStoreCatalogSettingsCommandValidatorTests
{
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public UpsertStoreCatalogSettingsCommandValidatorTests()
    {
        // Sin este stub el indexador devuelve un `LocalizedString` vacío y `WithMessage(null)`
        // revienta al CONSTRUIR el validador: el mensaje es obligatorio para FluentValidation.
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));
    }

    private UpsertStoreCatalogSettingsCommandValidator Validator() => new(_localizer.Object);

    /// <summary>Config coherente y abierta: número + recogida. Lo que el dueño escribe de verdad.</summary>
    private static UpsertStoreCatalogSettingsCommand ValidCommand() => new()
    {
        Enabled = true,
        WhatsappNumber = "+5350000000",
        PickupEnabled = true,
        DeliveryEnabled = false,
        DeliveryFee = 0m,
        MinimumOrderAmount = 0m,
    };

    #region Happy Path

    [Fact]
    public void Validate_WithAnEnabledStoreAndAWhatsappNumber_ShouldPass()
    {
        Validator().Validate(ValidCommand()).IsValid.Should().BeTrue();
    }

    /// <summary>Recogida y envío a la vez también vale: cada modalidad se puede abrir por separado.</summary>
    [Fact]
    public void Validate_WithBothDeliveryTypesEnabled_ShouldPass()
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.DeliveryEnabled = true;
        command.DeliveryFee = 50m;

        Validator().Validate(command).IsValid.Should().BeTrue();
    }

    /// <summary>
    /// Apagado, la fila puede estar incompleta: es el estado en que nace una tienda y el que se
    /// guarda mientras el dueño decide. Sin número y sin modalidad NO es un error — todavía no
    /// accepta pedidos, y no los acepta justamente por estar apagada.
    /// </summary>
    [Fact]
    public void Validate_WithTheSwitchOffAndNothingConfigured_ShouldPass()
    {
        var command = new UpsertStoreCatalogSettingsCommand { Enabled = false };

        Validator().Validate(command).IsValid.Should().BeTrue();
    }

    /// <summary>
    /// Apagada pero con número y modalidad guardados: es lo que deja el dueño al desactivar. Los
    /// valores quedan para volver a encender sin reescribirlos.
    /// </summary>
    [Fact]
    public void Validate_WithTheSwitchOffButWithValues_ShouldPass()
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.Enabled = false;

        Validator().Validate(command).IsValid.Should().BeTrue();
    }

    /// <summary>Costos e importes en cero son válidos: 0 = sin envío de pago / sin mínimo.</summary>
    [Fact]
    public void Validate_WithZeroAmounts_ShouldPass()
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.DeliveryFee = 0m;
        command.MinimumOrderAmount = 0m;

        Validator().Validate(command).IsValid.Should().BeTrue();
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// El número es obligatorio con el interruptor encendido, sea cual sea la modalidad: todo
    /// pedido sale por `wa.me`. Sin número el dueño encendería un canal de entrada sin destino.
    /// </summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Validate_WithTheSwitchOnAndNoWhatsappNumber_ShouldFail(string? number)
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.WhatsappNumber = number;

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    /// <summary>
    /// Ni recogida ni envío con el interruptor encendido: abierto pero inejecutable. La regla se
    /// ancla en `PickupEnabled` porque es la primera de las dos; lo que importa es que falle.
    /// </summary>
    [Fact]
    public void Validate_WithTheSwitchOnAndNoDeliveryType_ShouldFail()
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.PickupEnabled = false;
        command.DeliveryEnabled = false;

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    /// <summary>
    /// Un importe negativo NO es un caso raro: es una tienda cobrando al revés. Se rechaza aunque
    /// el interruptor esté apagado, porque el valor se guarda igual y aparecería al reencender.
    /// </summary>
    [Theory]
    [InlineData(-0.01)]
    [InlineData(-100)]
    public void Validate_WithANegativeDeliveryFee_ShouldFail(decimal fee)
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.DeliveryFee = fee;

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(-100)]
    public void Validate_WithANegativeMinimumOrderAmount_ShouldFail(decimal amount)
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.MinimumOrderAmount = amount;

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    /// <summary>
    /// Sin modalidad y sin número: el validador reporta las DOS reglas. Comprueba que el segundo
    /// fallo no queda tapado por el primero.
    /// </summary>
    [Fact]
    public void Validate_WithTheSwitchOnAndNothingConfigured_ShouldReportBothRules()
    {
        var command = new UpsertStoreCatalogSettingsCommand { Enabled = true };

        var result = Validator().Validate(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().HaveCountGreaterThanOrEqualTo(2);
    }

    #endregion

    #region Edge Cases

    /// <summary>
    /// Los límites son los de la COLUMNA (`StoreCatalogSettingsEntityTypeConfiguration`): un valor
    /// más largo no lo recorta la base, lo revienta con un 500 en el INSERT. El validador lo
    /// convierte en un 400 con mensaje.
    /// </summary>
    [Fact]
    public void Validate_WithAnOverlongWhatsappNumber_ShouldFail()
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.WhatsappNumber = new string('9', UpsertStoreCatalogSettingsCommand.WhatsappNumberMaxLength + 1);

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WithAnOverlongBusinessHours_ShouldFail()
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.BusinessHours = new string('a', UpsertStoreCatalogSettingsCommand.BusinessHoursMaxLength + 1);

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WithAnOverlongDeliveryZones_ShouldFail()
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.DeliveryZones = new string('a', UpsertStoreCatalogSettingsCommand.DeliveryZonesMaxLength + 1);

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    /// <summary>El límite exacto entra: los topes son inclusivos.</summary>
    [Fact]
    public void Validate_WithTextExactlyAtTheLimits_ShouldPass()
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.WhatsappNumber = new string('9', UpsertStoreCatalogSettingsCommand.WhatsappNumberMaxLength);
        command.BusinessHours = new string('a', UpsertStoreCatalogSettingsCommand.BusinessHoursMaxLength);
        command.DeliveryZones = new string('a', UpsertStoreCatalogSettingsCommand.DeliveryZonesMaxLength);

        Validator().Validate(command).IsValid.Should().BeTrue();
    }

    /// <summary>
    /// Horarios y zonas son texto libre (D16): no hay formato que comprobar, solo que quepa. Un
    /// horario con comas, saltos de línea o acentos es válido.
    /// </summary>
    [Fact]
    public void Validate_WithFreeTextBusinessHoursAndZones_ShouldPass()
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.BusinessHours = "Lun-Vie 8:00-18:00\nSáb 8:00-13:00";
        command.DeliveryZones = "Centro, Vedado, Habana Vieja";

        Validator().Validate(command).IsValid.Should().BeTrue();
    }

    /// <summary>
    /// El número no se valida como teléfono: es texto para armar `wa.me` (D17). Un prefijo raro
    /// pero corto pasa — el link se arma con lo que el dueño escribió y es su teléfono.
    /// </summary>
    [Fact]
    public void Validate_WithANonStandardButShortNumber_ShouldPass()
    {
        UpsertStoreCatalogSettingsCommand command = ValidCommand();
        command.WhatsappNumber = "whatsapp:5350000000";

        Validator().Validate(command).IsValid.Should().BeTrue();
    }

    #endregion

    #region Integration / Contract

    /// <summary>
    /// A3 eliminó la moneda configurable de la tienda: los precios y la moneda vienen del
    /// catálogo. Este test falla si alguien vuelve a meter un `Currency` en el contrato.
    /// </summary>
    [Fact]
    public void UpsertStoreCatalogSettingsCommand_ShouldCarryNoCurrencyField()
    {
        typeof(UpsertStoreCatalogSettingsCommand).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("Currency");
    }

    /// <summary>
    /// La marca es de F8 (`LogoKey`/`BannerKey`/`PaletteId`): este comando no la escribe, ni
    /// siquiera la lee del payload. Si aparece aquí, las dos vistas empezarían a pisarse.
    /// </summary>
    [Fact]
    public void UpsertStoreCatalogSettingsCommand_ShouldCarryNoBrandField()
    {
        typeof(UpsertStoreCatalogSettingsCommand).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain(new[] { "LogoKey", "BannerKey", "PaletteId", "LogoUrl", "BannerUrl" });
    }

    /// <summary>
    /// `StoreId` NO viaja en el payload: la tienda es la del contexto. Aceptarlo dejaría que un
    /// dueño escribiera la configuración de la tienda de otro.
    /// </summary>
    [Fact]
    public void UpsertStoreCatalogSettingsCommand_ShouldCarryNoStoreIdField()
    {
        typeof(UpsertStoreCatalogSettingsCommand).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain(new[] { "StoreId", "TenantId", "Id" });
    }

    #endregion
}