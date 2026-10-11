using Application.Abstractions.HttpContext;
using Application.Features.StoreManagement.Stores.Commands.CreateStore;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.CreateStore;

/// <summary>
/// Unit tests for CreateStoreCommandValidator covering the OwnerAdmin branch: body OwnerId is
/// server-derived for owner admins (so it must NOT be validated), while the same rules still
/// apply to every other caller (SuperAdmin, StoreUser...).
/// <para>
/// REWRITTEN 2026-10-11 (store-birth-superior): the <c>ModuleIds</c> rules are gone — required,
/// "available to store", and the active-Pago-catalog filter that rejected 12..17. There is no
/// module list to validate, so <c>IModuleRepository</c> and <c>IPlanRepository</c> left this
/// validator's constructor with them.
/// </para>
/// </summary>
public class CreateStoreCommandValidatorOwnerTests
{
    private readonly Mock<IOwnerRepository> _mockOwnerRepository;
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly CreateStoreCommandValidator _validator;

    private readonly Guid _existingOwnerId = Guid.NewGuid();

    public CreateStoreCommandValidatorOwnerTests()
    {
        _mockOwnerRepository = new Mock<IOwnerRepository>();
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();

        _mockStoreRepository
            .Setup(x => x.IsUniqueNameAsync(It.IsAny<string>()))
            .ReturnsAsync(true);
        _mockOwnerRepository
            .Setup(x => x.GetByIdAsync(_existingOwnerId))
            .ReturnsAsync(Owner.Create(Guid.NewGuid(), false, Guid.NewGuid(), "Owner"));

        SetupLocalizer("IsRequired");
        SetupLocalizer("OwnerNotFound");
        SetupLocalizer("UserAlreadyExists");

        _validator = new CreateStoreCommandValidator(
            _mockLocalizer.Object,
            _mockOwnerRepository.Object,
            _mockStoreRepository.Object,
            _mockHttpContextService.Object);
    }

    private void SetupLocalizer(string key)
    {
        _mockLocalizer
            .Setup(x => x[key, It.IsAny<object[]>()])
            .Returns(new LocalizedString(key, $"'{key}' message."));
    }

    private void ArrangeRole(bool isOwnerAdmin)
        => _mockHttpContextService.Setup(x => x.IsOwnerAdmin).Returns(isOwnerAdmin);

    private CreateStoreCommand CreateCommand(Guid ownerId)
        => new(ownerId, "New Store", null, null, false);

    #region OwnerAdmin branch

    [Fact]
    public async Task Validate_owner_admin_zero_owner_is_valid()
    {
        ArrangeRole(isOwnerAdmin: true);

        var result = await _validator.ValidateAsync(CreateCommand(Guid.Empty));

        result.IsValid.Should().BeTrue();
        _mockOwnerRepository.Verify(x => x.GetByIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task Validate_owner_admin_still_validates_name()
    {
        ArrangeRole(isOwnerAdmin: true);

        var result = await _validator.ValidateAsync(CreateCommand(Guid.Empty) with { Name = string.Empty });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStoreCommand.Name));
    }

    #endregion

    #region Non-owner branch

    [Fact]
    public async Task Validate_non_owner_empty_owner_id_is_invalid()
    {
        ArrangeRole(isOwnerAdmin: false);

        var result = await _validator.ValidateAsync(CreateCommand(Guid.Empty));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStoreCommand.OwnerId));
    }

    [Fact]
    public async Task Validate_non_owner_unknown_owner_is_invalid()
    {
        ArrangeRole(isOwnerAdmin: false);
        var unknownOwnerId = Guid.NewGuid();
        _mockOwnerRepository.Setup(x => x.GetByIdAsync(unknownOwnerId)).ReturnsAsync((Owner)null!);

        var result = await _validator.ValidateAsync(CreateCommand(unknownOwnerId));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStoreCommand.OwnerId));
    }

    [Fact]
    public async Task Validate_non_owner_valid_request_is_valid()
    {
        ArrangeRole(isOwnerAdmin: false);

        var result = await _validator.ValidateAsync(CreateCommand(_existingOwnerId));

        result.IsValid.Should().BeTrue();
        result.Errors.Should().BeEmpty();
        _mockOwnerRepository.Verify(x => x.GetByIdAsync(_existingOwnerId), Times.Once);
    }

    [Fact]
    public async Task Validate_non_owner_still_validates_name()
    {
        ArrangeRole(isOwnerAdmin: false);

        var result = await _validator.ValidateAsync(CreateCommand(_existingOwnerId) with { Name = string.Empty });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStoreCommand.Name));
    }

    #endregion
}