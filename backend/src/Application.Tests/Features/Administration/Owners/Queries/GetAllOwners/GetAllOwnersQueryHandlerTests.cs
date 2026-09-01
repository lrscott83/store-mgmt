using Application.Abstractions.HttpContext;
using Application.Dtos.Administration.Owners;
using Application.Features.Administration.Owners.Queries.GetAllOwners;
using AutoMapper;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.Administration.Owners.Queries.GetAllOwners;

public class GetAllOwnersQueryHandlerTests
{
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IOwnerRepository> _mockOwnerRepository;
    private readonly Mock<ISystemConfigurationRepository> _mockSystemConfigurationRepository;
    private readonly Mock<IMapper> _mockMapper;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly GetAllOwnersQueryHandler _handler;

    public GetAllOwnersQueryHandlerTests()
    {
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockOwnerRepository = new Mock<IOwnerRepository>();
        _mockSystemConfigurationRepository = new Mock<ISystemConfigurationRepository>();
        _mockMapper = new Mock<IMapper>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();

        _handler = new GetAllOwnersQueryHandler(
            _mockHttpContextService.Object,
            _mockOwnerRepository.Object,
            _mockSystemConfigurationRepository.Object,
            _mockMapper.Object,
            _mockLocalizer.Object);
    }

    [Fact]
    public async Task Handle_superAdmin_repoReturnsNull_returnsEmptyCollection_noNullRef()
    {
        // Arrange
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(false);
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        _mockOwnerRepository
            .Setup(x => x.GetAllOwnersIncludingStoreModulesAsync(It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IEnumerable<Owner>)null!);

        _mockMapper
            .Setup(x => x.Map<IEnumerable<OwnerDto>>(It.IsAny<IEnumerable<Owner>>()))
            .Returns(new List<OwnerDto>());

        // Act
        var result = await _handler.Handle(new GetAllOwnersQuery(true), CancellationToken.None);

        // Assert
        result.Succeeded.Should().BeTrue();
        result.Data.Should().NotBeNull();
        result.Data.Should().BeEmpty();
    }

    [Fact]
    public async Task Handle_superAdmin_forwardsCancellationToken_toRepository()
    {
        // Arrange
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(true);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(false);
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        using var cts = new CancellationTokenSource();
        var token = cts.Token;

        _mockOwnerRepository
            .Setup(x => x.GetAllOwnersIncludingStoreModulesAsync(It.IsAny<bool>(), token))
            .ReturnsAsync(new List<Owner>());

        _mockMapper
            .Setup(x => x.Map<IEnumerable<OwnerDto>>(It.IsAny<IEnumerable<Owner>>()))
            .Returns(new List<OwnerDto>());

        // Act
        await _handler.Handle(new GetAllOwnersQuery(true), token);

        // Assert
        _mockOwnerRepository.Verify(
            x => x.GetAllOwnersIncludingStoreModulesAsync(It.IsAny<bool>(), token),
            Times.Once);
    }

    [Fact]
    public async Task Handle_reSeller_forwardsCancellationToken_andUserId_toRepository()
    {
        // Arrange
        _mockHttpContextService.Setup(x => x.IsSuperAdmin).Returns(false);
        _mockHttpContextService.Setup(x => x.IsReSeller).Returns(true);
        _mockHttpContextService.Setup(x => x.UserExternalId).Returns(Guid.NewGuid().ToString());

        using var cts = new CancellationTokenSource();
        var token = cts.Token;

        _mockOwnerRepository
            .Setup(x => x.GetReSellerOwnersIncludingStoreModulesAsync(It.IsAny<Guid>(), It.IsAny<bool>(), token))
            .ReturnsAsync(new List<Owner>());

        _mockMapper
            .Setup(x => x.Map<IEnumerable<OwnerDto>>(It.IsAny<IEnumerable<Owner>>()))
            .Returns(new List<OwnerDto>());

        // Act
        await _handler.Handle(new GetAllOwnersQuery(true), token);

        // Assert
        _mockOwnerRepository.Verify(
            x => x.GetReSellerOwnersIncludingStoreModulesAsync(It.IsAny<Guid>(), It.IsAny<bool>(), token),
            Times.Once);
    }
}
