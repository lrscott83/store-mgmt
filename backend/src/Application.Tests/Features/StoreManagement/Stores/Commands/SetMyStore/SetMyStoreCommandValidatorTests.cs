using Application.Features.StoreManagement.Stores.Commands.SetMyStore;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.SetMyStore;

/// <summary>
/// Tests for SetMyStoreCommandValidator covering the validation rules
/// and ensuring the correct repository method (ExistsAsync) is used.
/// </summary>
public class SetMyStoreCommandValidatorTests
{
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly SetMyStoreCommandValidator _validator;

    public SetMyStoreCommandValidatorTests()
    {
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();

        _mockLocalizer
            .Setup(x => x["IsRequired", It.IsAny<object[]>()])
            .Returns(new LocalizedString("IsRequired", "'{PropertyName}' is required."));

        _mockLocalizer
            .Setup(x => x["StoreNotFound", It.IsAny<object[]>()])
            .Returns(new LocalizedString("StoreNotFound", "'{PropertyName}' not found."));

        _validator = new SetMyStoreCommandValidator(
            _mockLocalizer.Object,
            _mockStoreRepository.Object);
    }

    #region Integration Tests

    [Fact]
    public async Task Validate_WithExistingStoreId_ShouldCallExistsAsync()
    {
        // Arrange
        var storeId = Guid.NewGuid();
        var command = new SetMyStoreCommand(storeId);

        _mockStoreRepository
            .Setup(x => x.ExistsAsync(It.IsAny<Guid>()))
            .ReturnsAsync(true);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue();
        _mockStoreRepository.Verify(
            x => x.ExistsAsync(storeId),
            Times.Once);
    }

    #endregion

    #region Edge Case Tests

    [Fact]
    public async Task Validate_WithEmptyGuid_ShouldFailWithNotEmptyError()
    {
        // Arrange
        var command = new SetMyStoreCommand(Guid.Empty);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(SetMyStoreCommand.StoreId));
        result.Errors.Should().NotContain(e => e.ErrorMessage.Contains("NotNull"));
    }

    #endregion
}
