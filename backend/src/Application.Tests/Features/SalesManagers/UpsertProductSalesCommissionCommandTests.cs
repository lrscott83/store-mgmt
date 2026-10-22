using Application.Abstractions.HttpContext;
using Application.Exceptions;
using Application.Features.SalesManagers.Commands.UpsertProductSalesCommission;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.ProductSalesCommissions;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;
using System.Net;

namespace Application.Tests.Features.SalesManagers;

/// <summary>
/// T8: configuración de comisión por producto. Owner-only, producto de la tienda de la sesión,
/// tipo % o fijo con moneda, upsert sin duplicar y 404 para un producto de otra tienda.
/// </summary>
public class UpsertProductSalesCommissionCommandTests
{
    private readonly Mock<IApplicationUnitOfWork> _unitOfWork = new();
    private readonly Mock<IHttpContextService> _httpContextService = new();
    private readonly Mock<IProductRepository> _productRepository = new();
    private readonly Mock<IProductSalesCommissionRepository> _commissionRepository = new();

    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _productId = Guid.NewGuid();

    public UpsertProductSalesCommissionCommandTests()
    {
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(true);
        _httpContextService.Setup(x => x.StoreId).Returns(_storeId.ToString());
        _httpContextService.Setup(x => x.TenantId).Returns(_tenantId.ToString());
        _productRepository
            .Setup(x => x.BelongsToStoreAsync(_storeId, _productId))
            .ReturnsAsync(true);
        _unitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
    }

    private UpsertProductSalesCommissionCommandHandler Handler() => new(
        _unitOfWork.Object,
        _httpContextService.Object,
        _productRepository.Object,
        _commissionRepository.Object);

    [Fact]
    public async Task Creates_the_configuration_when_the_product_has_none()
    {
        _commissionRepository
            .Setup(x => x.GetByProductIdAsync(_productId))
            .ReturnsAsync((ProductSalesCommission?)null);

        var result = await Handler().Handle(
            new UpsertProductSalesCommissionCommand(
                _productId, SalesCommissionType.Percentage, 10m, Currency.CUP),
            CancellationToken.None);

        result.Succeeded.Should().BeTrue();
        _commissionRepository.Verify(
            x => x.AddAsync(It.Is<ProductSalesCommission>(c =>
                c.StoreId == _storeId
                && c.ProductId == _productId
                && c.Type == SalesCommissionType.Percentage
                && c.Value == 10m
                && c.Currency == Currency.CUP)),
            Times.Once);
    }

    [Fact]
    public async Task Updates_the_existing_configuration_instead_of_creating_a_second_row()
    {
        var existing = ProductSalesCommission.Create(
            _storeId, _productId, SalesCommissionType.Percentage, 5m, Currency.CUP, _tenantId);
        _commissionRepository
            .Setup(x => x.GetByProductIdAsync(_productId))
            .ReturnsAsync(existing);

        await Handler().Handle(
            new UpsertProductSalesCommissionCommand(
                _productId, SalesCommissionType.Fixed, 7m, Currency.USD),
            CancellationToken.None);

        existing.Type.Should().Be(SalesCommissionType.Fixed);
        existing.Value.Should().Be(7m);
        existing.Currency.Should().Be(Currency.USD);
        _commissionRepository.Verify(x => x.UpdateAsync(existing), Times.Once);
        _commissionRepository.Verify(x => x.AddAsync(It.IsAny<ProductSalesCommission>()), Times.Never);
    }

    [Fact]
    public async Task Rejects_a_product_from_another_store_with_404()
    {
        Guid foreign = Guid.NewGuid();
        _productRepository
            .Setup(x => x.BelongsToStoreAsync(_storeId, foreign))
            .ReturnsAsync(false);

        Func<Task> act = () => Handler().Handle(
            new UpsertProductSalesCommissionCommand(
                foreign, SalesCommissionType.Fixed, 5m, Currency.CUP),
            CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Rejects_a_percentage_above_100()
    {
        Func<Task> act = () => Handler().Handle(
            new UpsertProductSalesCommissionCommand(
                _productId, SalesCommissionType.Percentage, 100.01m, Currency.CUP),
            CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Non_owner_is_forbidden()
    {
        _httpContextService.Setup(x => x.IsOwnerAdmin).Returns(false);

        Func<Task> act = () => Handler().Handle(
            new UpsertProductSalesCommissionCommand(
                _productId, SalesCommissionType.Fixed, 5m, Currency.CUP),
            CancellationToken.None);

        (await act.Should().ThrowAsync<ApiException>())
            .Which.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
