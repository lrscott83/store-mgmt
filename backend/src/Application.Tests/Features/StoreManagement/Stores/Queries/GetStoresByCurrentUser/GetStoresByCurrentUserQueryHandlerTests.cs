using Application.Abstractions.HttpContext;
using Application.Dtos.StoreManagement;
using Application.Features.StoreManagement.Stores.Queries.GetStoresByCurrentUser;
using AutoMapper;
using Domain.Common.Constants;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Moq;

namespace Application.Tests.Features.StoreManagement.Stores.Queries.GetStoresByCurrentUser;

public class GetStoresByCurrentUserQueryHandlerTests
{
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IMapper> _mockMapper;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly GetStoresByCurrentUserQueryHandler _handler;
    private readonly Guid _userId;

    public GetStoresByCurrentUserQueryHandlerTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockMapper = new Mock<IMapper>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _userId = Guid.NewGuid();
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(_userId.ToString());
        _handler = new GetStoresByCurrentUserQueryHandler(
            _mockStoreRepository.Object,
            _mockMapper.Object,
            _mockHttpContextService.Object);
    }

    [Fact]
    public async Task Handle_asSuperAdmin_uses_GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: true, isReSeller: false);
        var stores = new List<Store> { CreateStore("Store 1") };
        _mockStoreRepository
            .Setup(x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()))
            .ReturnsAsync(stores);
        _mockMapper
            .Setup(x => x.Map<IEnumerable<StoreDto>>(stores))
            .Returns(new List<StoreDto> { new() { Id = Guid.NewGuid(), Name = "Store 1" } });

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(1);
        _mockStoreRepository.Verify(
            x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(DataUtils.DefaultStore.Id),
            Times.Once);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByReSellerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_asReSeller_uses_GetActiveStoresByReSellerUserIdAsync_with_currentUserId()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: false, isReSeller: true);
        var stores = new List<Store> { CreateStore("Store 1") };
        _mockStoreRepository
            .Setup(x => x.GetActiveStoresByReSellerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(stores);
        _mockMapper
            .Setup(x => x.Map<IEnumerable<StoreDto>>(stores))
            .Returns(new List<StoreDto> { new() { Id = Guid.NewGuid(), Name = "Store 1" } });

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(1);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByReSellerUserIdAsync(_userId, DataUtils.DefaultStore.Id),
            Times.Once);
        _mockStoreRepository.Verify(
            x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()),
            Times.Never);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_asRegularUser_uses_GetActiveStoresByUserIdAsync_with_currentUserId()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: false, isReSeller: false);
        var stores = new List<Store> { CreateStore("Store 1") };
        _mockStoreRepository
            .Setup(x => x.GetActiveStoresByUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(stores);
        _mockMapper
            .Setup(x => x.Map<IEnumerable<StoreDto>>(stores))
            .Returns(new List<StoreDto> { new() { Id = Guid.NewGuid(), Name = "Store 1" } });

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().HaveCount(1);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByUserIdAsync(_userId, DataUtils.DefaultStore.Id),
            Times.Once);
        _mockStoreRepository.Verify(
            x => x.GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync(It.IsAny<Guid?>()),
            Times.Never);
        _mockStoreRepository.Verify(
            x => x.GetActiveStoresByReSellerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_noStores_returns_empty_success()
    {
        // Arrange
        ArrangeRoles(isSuperAdmin: false, isReSeller: true);
        _mockStoreRepository
            .Setup(x => x.GetActiveStoresByReSellerUserIdAsync(It.IsAny<Guid>(), It.IsAny<Guid?>()))
            .ReturnsAsync(new List<Store>());
        _mockMapper
            .Setup(x => x.Map<IEnumerable<StoreDto>>(It.IsAny<IEnumerable<Store>>()))
            .Returns(new List<StoreDto>());

        // Act
        var result = await _handler.Handle(new GetStoresByCurrentUserQuery(), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().BeEmpty();
    }

    private void ArrangeRoles(bool isSuperAdmin, bool isReSeller)
    {
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(isSuperAdmin);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(isReSeller);
    }

    private static Store CreateStore(string name)
    {
        return Store.Create(name, Guid.NewGuid(), true, Guid.NewGuid());
    }
}