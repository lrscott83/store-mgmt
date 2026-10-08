using Application.Features.WebCatalog.Showcase.Commands.AddStoreCatalogImage;
using Domain.Common.Enums;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.WebCatalog.Showcase.Commands;

/// <summary>
/// El validador del alta de una imagen de showcase decide sobre la FORMA del comando, no sobre el
/// archivo:
///
///   1. El conjunto tiene que existir. Un `Kind` inventado escribiría una fila que el catálogo público
///      nunca publica y que la vista no puede quitar: quedaría ahí para siempre.
///   2. Hay que traer un archivo. Un multipart sin archivo no es "subir una imagen vacía": es una
///      petición que no trae nada que hacer, y aceptarla devolvería un 200 con una clave que no
///      apunta a ningún archivo.
///   3. El pie de foto tiene un tope. Es texto libre del dueño, pero no ilimitado: va en una columna
///      y sale en el catálogo público.
///
/// Lo que NO decide aquí: el formato y el tamaño del archivo. Eso lo comprueba el handler con
/// `CatalogImageUploadRules`, las mismas reglas y el mismo 400 localizado que las imágenes de
/// producto y que la marca (F8).
/// </summary>
public class AddStoreCatalogImageCommandValidatorTests
{
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    public AddStoreCatalogImageCommandValidatorTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));
    }

    private AddStoreCatalogImageCommandValidator Validator() => new(_localizer.Object);

    private static AddStoreCatalogImageCommand Command(
        StoreCatalogImageKind kind = StoreCatalogImageKind.Carousel,
        long length = 1024,
        string? caption = null)
        => new(kind, new MemoryStream(new byte[1]), "carrusel.png", "image/png", length, caption);

    #region Happy Path

    [Fact]
    public void Validate_WithAValidCarouselImage_ShouldPass()
    {
        Validator().Validate(Command(StoreCatalogImageKind.Carousel)).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WithAValidDailyImage_ShouldPass()
    {
        Validator().Validate(Command(StoreCatalogImageKind.Daily)).IsValid.Should().BeTrue();
    }

    /// <summary>Sin pie de foto también vale: es opcional, no obligatorio.</summary>
    [Fact]
    public void Validate_WithoutACaption_ShouldPass()
    {
        Validator().Validate(Command(caption: null)).IsValid.Should().BeTrue();
    }

    /// <summary>Un pie de foto en el límite exacto sigue valiendo: el tope es inclusivo.</summary>
    [Fact]
    public void Validate_WithACaptionAtTheLimit_ShouldPass()
    {
        Validator()
            .Validate(Command(caption: new string('a', Domain.Entities.StoreCatalogImages.StoreCatalogImage.CaptionMaxLength)))
            .IsValid.Should().BeTrue();
    }

    #endregion

    #region Edge Cases

    /// <summary>
    /// Un conjunto que no existe en el enum no se acepta. Sin esta regla, el handler escribiría una
    /// fila que ninguna de las dos listas del catálogo público publica y que la vista no puede quitar.
    /// </summary>
    [Fact]
    public void Validate_WithAnUndefinedKind_ShouldFail()
    {
        var result = Validator().Validate(Command((StoreCatalogImageKind)99));

        result.IsValid.Should().BeFalse();
    }

    /// <summary>El enum tiene 0 y 1; un 2 es tan inventado como un 99.</summary>
    [Fact]
    public void Validate_WithANegativeKind_ShouldFail()
    {
        Validator().Validate(Command((StoreCatalogImageKind)(-1))).IsValid.Should().BeFalse();
    }

    /// <summary>
    /// Un multipart sin archivo no es "subir una imagen vacía": es una petición que no trae nada que
    /// hacer. Aceptarla devolvería un 200 con una clave que no apunta a ningún archivo.
    /// </summary>
    [Fact]
    public void Validate_WithoutAFile_ShouldFail()
    {
        var command = new AddStoreCatalogImageCommand(
            StoreCatalogImageKind.Carousel, null!, "carrusel.png", "image/png", 0, null);

        Validator().Validate(command).IsValid.Should().BeFalse();
    }

    /// <summary>Un pie de foto por encima del tope no entra: sale en el catálogo público.</summary>
    [Fact]
    public void Validate_WithACaptionOverTheLimit_ShouldFail()
    {
        var result = Validator()
            .Validate(Command(caption: new string('a', Domain.Entities.StoreCatalogImages.StoreCatalogImage.CaptionMaxLength + 1)));

        result.IsValid.Should().BeFalse();
    }

    #endregion
}