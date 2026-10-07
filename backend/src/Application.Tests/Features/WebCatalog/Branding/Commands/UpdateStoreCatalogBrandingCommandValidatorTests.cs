using Application.Abstractions.Storage;
using Application.Features.WebCatalog.Branding.Commands.UpdateStoreCatalogBranding;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Branding.Commands;

/// <summary>
/// El validador de la MARCA (F8) decide si lo que llegó por multipart es una operación con sentido.
/// Tres reglas, todas sobre el CONTENIDO del comando —el formato y el tamaño del archivo los
/// comprueba el handler con <c>CatalogImageUploadRules</c>, igual que las imágenes de producto—
///
///   1. Algo que hacer: sin archivo y sin bandera de borrado el PUT no trae ninguna instrucción.
///      Aceptarlo escribiría una fila (o tocaría `UpdatedDate`) sin cambiar nada, y sobre todo
///      escondería un fallo del cliente: la vista que se olvidó de adjuntar el archivo.
///   2. No se puede subir Y quitar lo mismo a la vez: son dos instrucciones opuestas sobre la misma
///      columna, y cuál gana dependería del orden de ejecución del handler.
///   3. Logo y banner son independientes: los dos lados pueden venir, uno, o ninguno.
///
/// Lo que NO decide: el formato del archivo, la tienda, ni la paleta (cancelada).
/// </summary>
public class UpdateStoreCatalogBrandingCommandValidatorTests
{
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public UpdateStoreCatalogBrandingCommandValidatorTests()
    {
        // Sin este stub el indexador devuelve un `LocalizedString` vacío y `WithMessage(null)`
        // revienta al CONSTRUIR el validador: el mensaje es obligatorio para FluentValidation.
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));
    }

    private UpdateStoreCatalogBrandingCommandValidator Validator() => new(_localizer.Object);

    private static CatalogImageUpload File(string fileName = "logo.jpg")
        => new(new MemoryStream(new byte[64]), fileName, "image/jpeg", 64);

    #region Happy Path

    [Fact]
    public void Validate_WithOnlyALogo_ShouldPass()
    {
        Validator().Validate(new UpdateStoreCatalogBrandingCommand(File(), false, null, false))
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WithOnlyABanner_ShouldPass()
    {
        Validator().Validate(new UpdateStoreCatalogBrandingCommand(null, false, File("banner.png"), false))
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WithBothFiles_ShouldPass()
    {
        Validator().Validate(new UpdateStoreCatalogBrandingCommand(File(), false, File("banner.png"), false))
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WithOnlyRemoveLogo_ShouldPass()
    {
        Validator().Validate(new UpdateStoreCatalogBrandingCommand(null, true, null, false))
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WithOnlyRemoveBanner_ShouldPass()
    {
        Validator().Validate(new UpdateStoreCatalogBrandingCommand(null, false, null, true))
            .IsValid.Should().BeTrue();
    }

    /// <summary>Quitar los dos lados a la vez es una operación válida y completa.</summary>
    [Fact]
    public void Validate_WithRemoveBoth_ShouldPass()
    {
        Validator().Validate(new UpdateStoreCatalogBrandingCommand(null, true, null, true))
            .IsValid.Should().BeTrue();
    }

    /// <summary>Cada lado es independiente: subir el logo y quitar el banner, en la misma llamada.</summary>
    [Fact]
    public void Validate_WithALogoAndRemoveBanner_ShouldPass()
    {
        Validator().Validate(new UpdateStoreCatalogBrandingCommand(File(), false, null, true))
            .IsValid.Should().BeTrue();
    }

    #endregion

    #region Error Handling

    /// <summary>
    /// El PUT vacío no es una configuración: no trae ninguna instrucción. Se rechaza en vez de
    /// devolver 200 para que un cliente que se olvidó de adjuntar el archivo lo sepa.
    /// </summary>
    [Fact]
    public void Validate_WithNothingAtAll_ShouldFail()
    {
        var result = Validator().Validate(new UpdateStoreCatalogBrandingCommand(null, false, null, false));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.StartsWith("BrandingNothingToUpdate", StringComparison.Ordinal));
    }

    /// <summary>
    /// Subir y quitar el mismo lado son dos instrucciones opuestas sobre la misma columna. Sin esta
    /// regla, cuál de las dos se salvaría dependería del orden en que el handler las ejecutara.
    /// </summary>
    [Fact]
    public void Validate_WithALogoAndRemoveLogo_ShouldFail()
    {
        var result = Validator().Validate(new UpdateStoreCatalogBrandingCommand(File(), true, null, false));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.StartsWith("BrandingUploadAndRemoveConflict", StringComparison.Ordinal));
    }

    [Fact]
    public void Validate_WithABannerAndRemoveBanner_ShouldFail()
    {
        var result = Validator().Validate(new UpdateStoreCatalogBrandingCommand(null, false, File("banner.png"), true));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.ErrorMessage.StartsWith("BrandingUploadAndRemoveConflict", StringComparison.Ordinal));
    }

    /// <summary>
    /// Los dos conflictos juntos se reportan los dos: el dueño tiene que corregir los dos lados en
    /// una sola respuesta, no descubriéndolos de uno en uno.
    /// </summary>
    [Fact]
    public void Validate_WithBothConflicts_ShouldReportBoth()
    {
        var result = Validator().Validate(new UpdateStoreCatalogBrandingCommand(File(), true, File("banner.png"), true));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().HaveCount(2);
    }

    #endregion

    #region What this validator does NOT decide

    /// <summary>
    /// El formato y el tamaño los decide el handler con `CatalogImageUploadRules` (mismas reglas que
    /// las imágenes de producto, con su 400 localized). Este validador solo mira la FORMA del
    /// comando: un `.gif` bien formado lo pasa para que lo rechace el handler, no al revés.
    /// </summary>
    [Fact]
    public void Validate_WithAWrongFormatFile_ShouldPassSoTheHandlerRejectsIt()
    {
        var upload = new CatalogImageUpload(new MemoryStream(new byte[8]), "logo.gif", "image/gif", 8);

        Validator().Validate(new UpdateStoreCatalogBrandingCommand(upload, false, null, false))
            .IsValid.Should().BeTrue();
    }

    /// <summary>
    /// Las paletas se cancelaron (decisión del Owner, 2026-10-07): el command no lleva ninguna, así
    /// que el validador no tiene nada que decidir sobre ellas. Este test cae si alguien reintroduce
    /// un selector de paleta por la puerta de atrás.
    /// </summary>
    [Fact]
    public void UpdateStoreCatalogBrandingCommand_ShouldCarryNoPalette()
    {
        typeof(UpdateStoreCatalogBrandingCommand).GetProperties()
            .Select(p => p.Name)
            .Should().NotContain("PaletteId");
    }

    #endregion
}