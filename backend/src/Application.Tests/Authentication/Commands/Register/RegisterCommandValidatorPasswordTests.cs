using Application.Features.Authentication.Commands.Login;
using Application.Features.Authentication.Commands.Register;
using Domain.Interfaces.Repositories;
using FluentAssertions;
using Microsoft.Extensions.Localization;
using Moq;
using Resources;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Tests for password validation requirements in RegisterCommand.
/// These tests verify security best practices for password handling.
/// </summary>
public class RegisterCommandValidatorPasswordTests
{
    private readonly Mock<IUserRepository> _mockUserRepository;
    private readonly Mock<IStringLocalizer<I18n>> _mockLocalizer;
    private readonly RegisterCommandValidator _validator;

    public RegisterCommandValidatorPasswordTests()
    {
        _mockUserRepository = new Mock<IUserRepository>();
        _mockLocalizer = new Mock<IStringLocalizer<I18n>>();
        
        // Setup default localizer behavior
        _mockLocalizer.Setup(x => x[It.IsAny<string>(), It.IsAny<object[]>()])
            .Returns(new LocalizedString("key", "Error message"));

        _mockUserRepository.Setup(x => x.IsUniqueLoginAsync(It.IsAny<string>()))
            .ReturnsAsync(true);

        _validator = new RegisterCommandValidator(_mockLocalizer.Object, _mockUserRepository.Object);
    }

    #region Password Minimum Length Tests

    [Theory]
    [InlineData("Abcdef1!")]        // Exactly 8 chars - should pass
    [InlineData("Abcdefg1!")]       // 9 chars - should pass
    [InlineData("Password123!")]     // 13 chars - should pass
    public async Task Validate_PasswordWithMinimumLength_ShouldPass(string password)
    {
        // Arrange
        var command = CreateCommandWithPassword(password);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue($"Password '{password}' with {password.Length} chars should meet minimum requirement");
    }

    [Theory]
    [InlineData("Abcdef!")]         // 7 chars - too short
    [InlineData("Pass1!")]           // 6 chars - too short
    [InlineData("A1!bcd")]           // 6 chars - too short
    [InlineData("Short1!")]         // 7 chars - too short
    public async Task Validate_PasswordShorterThan8Chars_ShouldFail(string password)
    {
        // Arrange
        var command = CreateCommandWithPassword(password);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse($"Password '{password}' with {password.Length} chars should FAIL minimum length requirement");
        result.Errors.Should().Contain(e => e.PropertyName == "Password");
    }

    [Fact]
    public async Task Validate_EmptyPassword_ShouldFail()
    {
        // Arrange
        var command = CreateCommandWithPassword("");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Password");
    }

    [Fact]
    public async Task Validate_NullPassword_ShouldFail()
    {
        // Arrange
        var command = CreateCommandWithPassword(null!);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Password");
    }

    #endregion

    #region Password Complexity Tests (Optional but recommended)

    [Fact]
    public async Task Validate_PasswordWithoutUppercase_ShouldFail()
    {
        // Arrange - password without uppercase letter
        var command = CreateCommandWithPassword("abcdefg1!");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert - Should fail because minimum 8 chars is not met
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Password");
    }

    #endregion

    private RegisterCommand CreateCommandWithPassword(string password)
    {
        return new RegisterCommand(
            Login: "testuser",
            Password: password,
            FullName: "Test User",
            CellPhone: "+1234567890",
            Email: "test@example.com",
            StoreName: "Test Store",
            Code: null);
    }
}
