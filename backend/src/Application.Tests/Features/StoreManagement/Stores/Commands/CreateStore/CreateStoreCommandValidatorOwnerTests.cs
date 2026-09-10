using Application.Abstractions.HttpContext;
using Application.Features.StoreManagement.Stores.Commands.CreateStore;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Features.StoreManagement.Stores.Commands.CreateStore;

/// <summary>
/// Unit tests for CreateStoreCommandValidator covering the OwnerAdmin branch: body
/// OwnerId/ModuleIds are server-derived for owner admins (so they must NOT be validated),
/// while the same rules still apply to every other caller (SuperAdmin, StoreUser...).
/// </summary>
public class CreateStoreCommandValidatorOwnerTests
{
    private readonly Mock<IOwnerRepository> _mockOwnerRepository;
    private readonly Mock<IStoreRepository> _mockStoreRepository;
    private readonly Mock<IModuleRepository> _mockModuleRepository;
    private readonly Mock<IHttpContextService> _mockHttpContextService;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly CreateStoreCommandValidator _validator;

    private readonly Guid _existingOwnerId = Guid.NewGuid();

    public CreateStoreCommandValidatorOwnerTests()
    {
        _mockOwnerRepository = new Mock<IOwnerRepository>();
        _mockStoreRepository = new Mock<IStoreRepository>();
        _mockModuleRepository = new Mock<IModuleRepository>();
        _mockHttpContextService = new Mock<IHttpContextService>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();

        _mockStoreRepository
            .Setup(x => x.IsUniqueNameAsync(It.IsAny<string>()))
            .ReturnsAsync(true);
        _mockOwnerRepository
            .Setup(x => x.GetByIdAsync(_existingOwnerId))
            .ReturnsAsync(Owner.Create(Guid.NewGuid(), false, Guid.NewGuid(), "Owner"));
        _mockModuleRepository
            .Setup(x => x.GetAvailableModulesToStore())
            .ReturnsAsync(new List<Module>
            {
                Module.Create(1, "Module 1", 1, true, 0, true, true),
                Module.Create(2, "Module 2", 2, true, 0, true, true),
            });

        SetupLocalizer("IsRequired");
        SetupLocalizer("OwnerNotFound");
        SetupLocalizer("ModuleNotAvailableToStore");
        SetupLocalizer("UserAlreadyExists");

        _validator = new CreateStoreCommandValidator(
            _mockLocalizer.Object,
            _mockOwnerRepository.Object,
            _mockStoreRepository.Object,
            _mockModuleRepository.Object,
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

    private CreateStoreCommand CreateCommand(Guid ownerId, List<int>? moduleIds)
        => new(ownerId, "New Store", null, null, false, moduleIds ?? new List<int>());

    #region OwnerAdmin branch

    [Fact]
    public async Task Validate_owner_admin_zero_owner_and_empty_modules_is_valid()
    {
        ArrangeRole(isOwnerAdmin: true);

        var result = await _validator.ValidateAsync(CreateCommand(Guid.Empty, new List<int>()));

        result.IsValid.Should().BeTrue();
        _mockOwnerRepository.Verify(x => x.GetByIdAsync(It.IsAny<Guid>()), Times.Never);
        _mockModuleRepository.Verify(x => x.GetAvailableModulesToStore(), Times.Never);
    }

    [Fact]
    public async Task Validate_owner_admin_still_validates_name()
    {
        ArrangeRole(isOwnerAdmin: true);

        var result = await _validator.ValidateAsync(CreateCommand(Guid.Empty, new List<int>()) with { Name = string.Empty });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStoreCommand.Name));
    }

    #endregion

    #region Non-owner branch

    [Fact]
    public async Task Validate_non_owner_empty_owner_id_is_invalid()
    {
        ArrangeRole(isOwnerAdmin: false);

        var result = await _validator.ValidateAsync(CreateCommand(Guid.Empty, new List<int> { 1, 2 }));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStoreCommand.OwnerId));
    }

    [Fact]
    public async Task Validate_non_owner_empty_modules_are_invalid()
    {
        ArrangeRole(isOwnerAdmin: false);

        var result = await _validator.ValidateAsync(CreateCommand(_existingOwnerId, new List<int>()));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStoreCommand.ModuleIds));
    }

    [Fact]
    public async Task Validate_non_owner_unknown_owner_is_invalid()
    {
        ArrangeRole(isOwnerAdmin: false);
        var unknownOwnerId = Guid.NewGuid();
        _mockOwnerRepository.Setup(x => x.GetByIdAsync(unknownOwnerId)).ReturnsAsync((Owner)null!);

        var result = await _validator.ValidateAsync(CreateCommand(unknownOwnerId, new List<int> { 1 }));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStoreCommand.OwnerId));
    }

    [Fact]
    public async Task Validate_non_owner_unavailable_module_is_invalid()
    {
        ArrangeRole(isOwnerAdmin: false);

        var result = await _validator.ValidateAsync(CreateCommand(_existingOwnerId, new List<int> { 999 }));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStoreCommand.ModuleIds));
    }

    [Fact]
    public async Task Validate_non_owner_valid_request_is_valid()
    {
        ArrangeRole(isOwnerAdmin: false);

        var result = await _validator.ValidateAsync(CreateCommand(_existingOwnerId, new List<int> { 1, 2 }));

        result.IsValid.Should().BeTrue();
        _mockOwnerRepository.Verify(x => x.GetByIdAsync(_existingOwnerId), Times.Once);
        _mockModuleRepository.Verify(x => x.GetAvailableModulesToStore(), Times.Once);
    }

    [Fact]
    public async Task Validate_non_owner_still_validates_name()
    {
        ArrangeRole(isOwnerAdmin: false);

        var result = await _validator.ValidateAsync(CreateCommand(_existingOwnerId, new List<int> { 1 }) with { Name = string.Empty });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == nameof(CreateStoreCommand.Name));
    }

    #endregion
}