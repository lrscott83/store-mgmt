using Application.Features.SaleManagement.Products.Commands.UpdateProduct;
using Application.UnitOfWorks;
using Domain.Common.Catalog;
using Domain.Common.Limits;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.SaleManagement.Products.CatalogFields;

/// <summary>
/// Campos del catálogo web en los comandos de producto (plan 2026-09-27):
/// rangos de descuento, longitud de la descripción y la regla D8 — el formulario de Productos no
/// envía los campos del catálogo y por tanto NO los debe borrar (null = no tocar).
/// </summary>
public class ProductCatalogFieldsTests
{
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IProductCategoryRepository> _categoryRepository = new();
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IStringLocalizer<I18n>> _localizer = new();

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _categoryId = Guid.NewGuid();
    private readonly Product _product;
    private readonly ProductCategory _category;

    public ProductCatalogFieldsTests()
    {
        _localizer
            .Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((name, args) =>
                new LocalizedString(name, args is { Length: > 0 } ? $"{name}:{string.Join(',', args)}" : name));

        _product = Product.Create("Camisa", _categoryId, 100m, 1, true, true, "B-1", _tenantId,
            "Descripción publicada", 1250, 500, true, "tenant/store/product/main.jpg");

        _category = ProductCategory.Create(_storeId, "Ropa", 1, _tenantId, "ropa");

        _productRepository.Setup(x => x.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync(_product);
        _productRepository.Setup(x => x.Where(It.IsAny<System.Linq.Expressions.Expression<Func<Product, bool>>>()))
            .Returns(new List<Product>().AsQueryable());
        _productRepository.Setup(x => x.UpdateAsync(It.IsAny<Product>())).ReturnsAsync(true);

        _categoryRepository.Setup(x => x.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync(_category);

        _unitOfWork.Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
    }

    private UpdateProductCommand ValidCommand() => new()
    {
        Id = _product.Id,
        CategoryId = _categoryId,
        Name = "Camisa",
        Price = 100m,
        AvailableToSale = true,
        DiscountFromInventory = true,
        BusinessId = "B-1",
        Order = 1,
        IsActive = true,
    };

    #region Validación

    [Fact]
    public async Task Validator_ShouldAcceptCommand_WhenCatalogFieldsAreOmitted()
    {
        var validator = new UpdateProductCommandValidator(_localizer.Object, _productRepository.Object, _categoryRepository.Object);

        var result = await validator.ValidateAsync(ValidCommand());

        result.IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(CatalogScales.MAX_PERCENT_SCALED + 1)]
    public async Task Validator_ShouldRejectPercentOutOfRange(int percent)
    {
        var validator = new UpdateProductCommandValidator(_localizer.Object, _productRepository.Object, _categoryRepository.Object);
        var command = ValidCommand();
        command.PercentDiscountPrice = percent;

        var result = await validator.ValidateAsync(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateProductCommand.PercentDiscountPrice));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(500)]
    [InlineData(CatalogScales.MAX_PERCENT_SCALED)]
    public async Task Validator_ShouldAcceptPercentInsideRange(int percent)
    {
        var validator = new UpdateProductCommandValidator(_localizer.Object, _productRepository.Object, _categoryRepository.Object);
        var command = ValidCommand();
        command.PercentDiscountPrice = percent;

        (await validator.ValidateAsync(command)).IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validator_ShouldRejectNegativeDiscountPrice()
    {
        var validator = new UpdateProductCommandValidator(_localizer.Object, _productRepository.Object, _categoryRepository.Object);
        var command = ValidCommand();
        command.DiscountPrice = -1;

        var result = await validator.ValidateAsync(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateProductCommand.DiscountPrice));
    }

    [Fact]
    public async Task Validator_ShouldRejectDescriptionLongerThanTheLimit()
    {
        var validator = new UpdateProductCommandValidator(_localizer.Object, _productRepository.Object, _categoryRepository.Object);
        var command = ValidCommand();
        command.Description = new string('a', ProductEntityLimits.DescriptionMaxLength + 1);

        var result = await validator.ValidateAsync(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateProductCommand.Description));
    }

    [Fact]
    public async Task Validator_ShouldAcceptDescriptionAtTheLimit()
    {
        var validator = new UpdateProductCommandValidator(_localizer.Object, _productRepository.Object, _categoryRepository.Object);
        var command = ValidCommand();
        command.Description = new string('a', ProductEntityLimits.DescriptionMaxLength);

        (await validator.ValidateAsync(command)).IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validator_ShouldRejectImagePathLongerThanTheLimit()
    {
        var validator = new UpdateProductCommandValidator(_localizer.Object, _productRepository.Object, _categoryRepository.Object);
        var command = ValidCommand();
        command.Image = new string('a', ProductEntityLimits.ImagePathMaxLength + 1);

        var result = await validator.ValidateAsync(command);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(UpdateProductCommand.Image));
    }

    #endregion

    #region Handler (decisión D8)

    [Fact]
    public async Task Handler_ShouldKeepCatalogValues_WhenTheProductFormDoesNotSendThem()
    {
        var handler = new UpdateProductCommandHandler(_unitOfWork.Object, _productRepository.Object, _localizer.Object);

        // El formulario de Productos solo envía sus propios campos.
        var result = await handler.Handle(ValidCommand(), CancellationToken.None);

        result.Data.Should().BeTrue();
        _product.Description.Should().Be("Descripción publicada");
        _product.PercentDiscountPrice.Should().Be(1250);
        _product.DiscountPrice.Should().Be(500);
        _product.IsNew.Should().BeTrue();
        _product.Image.Should().Be("tenant/store/product/main.jpg");
    }

    [Fact]
    public async Task Handler_ShouldApplyCatalogValues_WhenTheCatalogViewSendsThem()
    {
        var handler = new UpdateProductCommandHandler(_unitOfWork.Object, _productRepository.Object, _localizer.Object);
        var command = ValidCommand();
        command.Description = "Nueva descripción";
        command.PercentDiscountPrice = 0;
        command.DiscountPrice = 0;
        command.IsNew = false;
        command.Image = "tenant/store/product/other.png";

        await handler.Handle(command, CancellationToken.None);

        _product.Description.Should().Be("Nueva descripción");
        _product.PercentDiscountPrice.Should().Be(0);
        _product.DiscountPrice.Should().Be(0);
        _product.IsNew.Should().BeFalse();
        _product.Image.Should().Be("tenant/store/product/other.png");
    }

    [Fact]
    public async Task Handler_ShouldClearMainImage_OnlyWhenRemoveImageIsRequested()
    {
        var handler = new UpdateProductCommandHandler(_unitOfWork.Object, _productRepository.Object, _localizer.Object);

        await handler.Handle(ValidCommand(), CancellationToken.None);
        _product.Image.Should().Be("tenant/store/product/main.jpg");

        var command = ValidCommand();
        command.RemoveImage = true;
        await handler.Handle(command, CancellationToken.None);

        _product.Image.Should().BeNull();
    }

    [Fact]
    public async Task Handler_ShouldComputeFinalPrice_CombiningPercentAndAmount()
    {
        _product.Price.Should().Be(100m);
        _product.FinalPrice.Should().Be(82.5m);
        _product.HasDiscount.Should().BeTrue();
    }

    #endregion
}
