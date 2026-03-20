using Application.Features.Authentication.Commands.Register;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Tests for RegisterCommandValidator covering all fields except password.
/// Password validation is covered by RegisterCommandValidatorPasswordTests.
/// </summary>
public class RegisterCommandValidatorOtherFieldsTests
{
    private readonly Mock<IUserRepository> _mockUserRepository;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly RegisterCommandValidator _validator;

    public RegisterCommandValidatorOtherFieldsTests()
    {
        _mockUserRepository = new Mock<IUserRepository>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();
        
        // Setup default localizer behavior
        _mockLocalizer.Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns<string, object[]>((key, args) => key switch
            {
                "UserAlreadyExists" => new LocalizedString(key, "El nombre de usuario ya existe."),
                "IsRequired" => new LocalizedString(key, "'{0}' is required."),
                "EmailFormatInvalid" => new LocalizedString(key, "'{0}' must be a valid email address."),
                "PasswordMinLength" => new LocalizedString(key, "'{0}' must be at least {1} characters."),
                "PasswordRequiresUppercase" => new LocalizedString(key, "'{0}' must contain at least one uppercase letter."),
                _ => new LocalizedString(key, $"Validation error for {key}")
            });

        // Default: login is unique
        _mockUserRepository.Setup(x => x.IsUniqueLoginAsync(It.IsAny<string>()))
            .ReturnsAsync(true);

        _validator = new RegisterCommandValidator(_mockLocalizer.Object, _mockUserRepository.Object);
    }

    #region Login Validation Tests

    [Fact]
    public async Task Validate_ValidLogin_ShouldPass()
    {
        // Arrange
        var command = CreateCommandWithLogin("validuser123");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_NullLogin_ShouldFail()
    {
        // Arrange
        var command = CreateCommandWithLogin(null!);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Login");
    }

    [Fact]
    public async Task Validate_EmptyLogin_ShouldFail()
    {
        // Arrange
        var command = CreateCommandWithLogin("");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Login");
    }

    [Fact]
    public async Task Validate_LoginAlreadyExists_ShouldFail()
    {
        // Arrange
        var existingLogin = "existinguser";
        _mockUserRepository.Setup(x => x.IsUniqueLoginAsync(existingLogin))
            .ReturnsAsync(false);

        var command = CreateCommandWithLogin(existingLogin);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Login" && 
            e.ErrorMessage.Contains("ya"));
    }

    [Theory]
    [InlineData("user123")]
    [InlineData("test.user@example")]
    [InlineData("user-name-123")]
    public async Task Validate_LoginWithSpecialChars_ShouldPass(string login)
    {
        // Arrange
        _mockUserRepository.Setup(x => x.IsUniqueLoginAsync(login))
            .ReturnsAsync(true);
        var command = CreateCommandWithLogin(login);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue($"Login '{login}' with special chars should be valid");
    }

    #endregion

    #region FullName Validation Tests

    [Fact]
    public async Task Validate_ValidFullName_ShouldPass()
    {
        // Arrange
        var command = CreateCommandWithFullName("John Doe");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_NullFullName_ShouldFail()
    {
        // Arrange
        var command = CreateCommandWithFullName(null!);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "FullName");
    }

    [Fact]
    public async Task Validate_EmptyFullName_ShouldFail()
    {
        // Arrange
        var command = CreateCommandWithFullName("");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "FullName");
    }

    [Theory]
    [InlineData("José García")]
    [InlineData("María López")]
    [InlineData("Jean-Luc Picard")]
    public async Task Validate_FullNameWithSpecialChars_ShouldPass(string fullName)
    {
        // Arrange
        var command = CreateCommandWithFullName(fullName);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue($"FullName '{fullName}' with special chars should be valid");
    }

    #endregion

    #region CellPhone Validation Tests

    [Fact]
    public async Task Validate_ValidCellPhone_ShouldPass()
    {
        // Arrange
        var command = CreateCommandWithCellPhone("+1234567890");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_NullCellPhone_ShouldFail()
    {
        // Arrange
        var command = CreateCommandWithCellPhone(null!);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "CellPhone");
    }

    [Fact]
    public async Task Validate_EmptyCellPhone_ShouldFail()
    {
        // Arrange
        var command = CreateCommandWithCellPhone("");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "CellPhone");
    }

    [Theory]
    [InlineData("+54 11 1234-5678")]
    [InlineData("+1 (555) 123-4567")]
    [InlineData("0034 612 345 678")]
    public async Task Validate_CellPhoneWithFormat_ShouldPass(string cellPhone)
    {
        // Arrange
        var command = CreateCommandWithCellPhone(cellPhone);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue($"CellPhone '{cellPhone}' should be valid");
    }

    #endregion

    #region StoreName Validation Tests

    [Fact]
    public async Task Validate_ValidStoreName_ShouldPass()
    {
        // Arrange
        var command = CreateCommandWithStoreName("My Awesome Store");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_NullStoreName_ShouldFail()
    {
        // Arrange
        var command = CreateCommandWithStoreName(null!);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "StoreName");
    }

    [Fact]
    public async Task Validate_EmptyStoreName_ShouldFail()
    {
        // Arrange
        var command = CreateCommandWithStoreName("");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "StoreName");
    }

    #endregion

    #region Email Validation Tests

    [Theory]
    [InlineData("user@example.com")]
    [InlineData("test.user+tag@example.co.uk")]
    [InlineData("name@subdomain.domain.com")]
    public async Task Validate_ValidEmail_ShouldPass(string email)
    {
        // Arrange
        var command = CreateCommandWithEmail(email);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue($"Email '{email}' should be valid");
    }

    [Theory]
    [InlineData("@domain.com")]           // No local part
    [InlineData("user@")]                 // No domain
    [InlineData("user")]                  // No @
    [InlineData("user@@domain.com")]     // Double @
    public async Task Validate_InvalidEmail_ShouldFail(string email)
    {
        // Arrange
        var command = CreateCommandWithEmail(email);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse($"Email '{email}' should be invalid");
        result.Errors.Should().Contain(e => e.PropertyName == "Email");
    }

    [Fact]
    public async Task Validate_NullEmail_ShouldPass()
    {
        // Arrange - Email is optional
        var command = CreateCommandWithEmail(null);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue("Email is optional");
    }

    [Fact]
    public async Task Validate_EmptyEmail_ShouldPass_OptionalField()
    {
        // Arrange - Empty email is treated as null (optional field)
        // The validator uses When(!string.IsNullOrEmpty) so empty string skips validation
        var command = CreateCommandWithEmail("");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue("Empty email is optional and skipped by When() condition");
    }

    #endregion

    #region Code (ReSeller) Validation Tests

    [Fact]
    public async Task Validate_NullCode_ShouldPass()
    {
        // Arrange - Code is optional
        var command = CreateCommandWithCode(null);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue("Code is optional");
    }

    [Fact]
    public async Task Validate_EmptyCode_ShouldPass()
    {
        // Arrange - Empty code is valid (optional field)
        var command = CreateCommandWithCode("");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue("Empty code is treated as null");
    }

    [Theory]
    [InlineData("RESELLER123")]
    [InlineData("CODE-ABC-123")]
    [InlineData("simplecode")]
    public async Task Validate_ValidCode_ShouldPass(string code)
    {
        // Arrange - Code format validation happens in handler, not validator
        var command = CreateCommandWithCode(code);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue($"Code '{code}' should be valid in validator");
    }

    #endregion

    #region Complete Valid Command Tests

    [Fact]
    public async Task Validate_AllValidFields_ShouldPass()
    {
        // Arrange
        var command = new RegisterCommand(
            Login: "newuser123",
            Password: "SecurePass1!",
            FullName: "John Doe",
            CellPhone: "+1234567890",
            Email: "john@example.com",
            StoreName: "John's Store",
            Code: "RESELLER123");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue();
        result.Errors.Should().BeEmpty();
    }

    [Fact]
    public async Task Validate_ValidCommandWithoutOptionalFields_ShouldPass()
    {
        // Arrange - Only required fields
        var command = new RegisterCommand(
            Login: "minimaluser",
            Password: "SecurePass1!",
            FullName: "Jane Doe",
            CellPhone: "+0987654321",
            Email: null,
            StoreName: "Minimal Store",
            Code: null);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue();
    }

    #endregion

    #region Multiple Validation Errors Tests

    [Fact]
    public async Task Validate_MultipleErrors_ShouldReturnAllErrors()
    {
        // Arrange - Multiple invalid fields
        var command = new RegisterCommand(
            Login: "",
            Password: "",
            FullName: "",
            CellPhone: "",
            Email: "invalid-email",
            StoreName: "",
            Code: null);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().HaveCountGreaterOrEqualTo(4);
    }

    #endregion

    #region Helper Methods

    private RegisterCommand CreateCommandWithLogin(string login)
    {
        return new RegisterCommand(
            Login: login,
            Password: "ValidPass1!",
            FullName: "Test User",
            CellPhone: "+1234567890",
            Email: "test@example.com",
            StoreName: "Test Store",
            Code: null);
    }

    private RegisterCommand CreateCommandWithFullName(string fullName)
    {
        return new RegisterCommand(
            Login: "testuser",
            Password: "ValidPass1!",
            FullName: fullName,
            CellPhone: "+1234567890",
            Email: "test@example.com",
            StoreName: "Test Store",
            Code: null);
    }

    private RegisterCommand CreateCommandWithCellPhone(string cellPhone)
    {
        return new RegisterCommand(
            Login: "testuser",
            Password: "ValidPass1!",
            FullName: "Test User",
            CellPhone: cellPhone,
            Email: "test@example.com",
            StoreName: "Test Store",
            Code: null);
    }

    private RegisterCommand CreateCommandWithStoreName(string storeName)
    {
        return new RegisterCommand(
            Login: "testuser",
            Password: "ValidPass1!",
            FullName: "Test User",
            CellPhone: "+1234567890",
            Email: "test@example.com",
            StoreName: storeName,
            Code: null);
    }

    private RegisterCommand CreateCommandWithEmail(string? email)
    {
        return new RegisterCommand(
            Login: "testuser",
            Password: "ValidPass1!",
            FullName: "Test User",
            CellPhone: "+1234567890",
            Email: email,
            StoreName: "Test Store",
            Code: null);
    }

    private RegisterCommand CreateCommandWithCode(string? code)
    {
        return new RegisterCommand(
            Login: "testuser",
            Password: "ValidPass1!",
            FullName: "Test User",
            CellPhone: "+1234567890",
            Email: "test@example.com",
            StoreName: "Test Store",
            Code: code);
    }

    #endregion
}
