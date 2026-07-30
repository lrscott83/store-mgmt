using Application.Features.Authentication.Commands.Login;
using FluentAssertions;

namespace Application.Tests.Authentication.Commands.Login;

/// <summary>
/// Tests for LoginCommandValidator.
/// These tests ensure the validator works correctly.
/// </summary>
public class LoginCommandValidatorTests
{
    private readonly LoginCommandValidator _validator;

    public LoginCommandValidatorTests()
    {
        _validator = new LoginCommandValidator();
    }

    #region Login Validation Tests

    [Fact]
    public async Task Validate_ValidLoginAndPassword_ShouldPass()
    {
        // Arrange
        var command = new LoginCommand("validuser@test.com", "Password123");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_EmptyLogin_ShouldFail()
    {
        // Arrange
        var command = new LoginCommand("", "password123");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Login");
    }

    [Fact]
    public async Task Validate_NullLogin_ShouldFail()
    {
        // Arrange
        var command = new LoginCommand(null!, "password123");

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_EmptyPassword_ShouldFail()
    {
        // Arrange
        var command = new LoginCommand("validuser@test.com", "");

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
        var command = new LoginCommand("validuser", null!);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse();
    }

    #endregion

    #region Password Security Tests

    /// <summary>
    /// SECURITY TEST: This test verifies that short passwords are rejected.
    /// 
    /// Current validator only checks NotNull/NotEmpty.
    /// It SHOULD also enforce minimum length (8 characters) for security.
    /// 
    /// This test SHOULD FAIL until password minimum length is added.
    /// </summary>
    [Theory]
    [InlineData("Abcdefg")]      // 7 chars - below minimum of 8
    [InlineData("Pass1!")]        // 6 chars - definitely too short
    [InlineData("Short")]         // 5 chars - way too short
    public async Task Validate_ShortPassword_ShouldFail_Security(string shortPassword)
    {
        // Arrange
        var command = new LoginCommand("validuser@test.com", shortPassword);

        // Act
        var result = await _validator.ValidateAsync(command);

        // Assert
        result.IsValid.Should().BeFalse(
            $"Password '{shortPassword}' ({shortPassword.Length} chars) should fail - too short for security");
        result.Errors.Should().Contain(e => e.PropertyName == "Password");
    }

    #endregion
}
