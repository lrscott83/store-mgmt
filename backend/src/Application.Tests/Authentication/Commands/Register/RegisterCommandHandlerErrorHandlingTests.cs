using Application.Exceptions;
using FluentAssertions;
using Moq;
using System.Net;
using Xunit;

namespace Application.Tests.Authentication.Commands.Register;

/// <summary>
/// Trimmed after the RegisterService extraction: the owner/null-user and reseller-code cases moved
/// to RegisterServiceRegistrationTests and RegisterServiceReSellerTests, because the service is what
/// builds the owner and the Gestor link. What stays here is the save — the handler's job.
/// </summary>
public class RegisterCommandHandlerErrorHandlingTests : RegisterCommandHandlerTestFixture
{
    /// <summary>
    /// BUG TEST: if SaveChanges fails, the error message should be meaningful, not generic.
    /// </summary>
    [Fact]
    public async Task Handle_ShouldReturnDescriptiveError_WhenSaveChangesFails()
    {
        MockUnitOfWork
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(0); // Save fails

        var handler = CreateHandler();
        var command = CreateValidCommand();

        var result = await handler.Handle(command, CancellationToken.None);

        result.Succeeded.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();

        var errorCode = result.Errors.FirstOrDefault()?.Code ?? "";
        errorCode.Should().NotBe("Register.Unknown",
            "Error code should not be generic 'Register.Unknown'. Should provide actionable information.");
    }

    /// <summary>
    /// REGRESSION TEST — added with the extraction.
    /// <para>
    /// The service reports failure by throwing <see cref="ApiException"/>. This handler MUST catch
    /// it and rebuild the identical <c>ResponseResult</c>. If it let the exception escape instead,
    /// the middleware would take over and set the HTTP status from the exception, while
    /// AuthController maps every RETURNED failure through a switch whose default arm is also
    /// BadRequest. Net effect: every register failure would silently change from HTTP 400 to
    /// HTTP 500, and no E2E covers it — AuthRegisterPlanTests only asserts the 201 happy path.
    /// </para>
    /// </summary>
    [Fact]
    public async Task Handle_WhenServiceThrows_ShouldRebuildTheSameFailureResponse()
    {
        SetupServiceFailure("Register.PlanLoadFailed", HttpStatusCode.InternalServerError,
            "Failed to load the default plan: boom");

        var handler = CreateHandler();
        var command = CreateValidCommand();

        var result = await handler.Handle(command, CancellationToken.None);

        // A RETURNED failure, not a propagated exception — that is what keeps AuthController in
        // charge of the status code.
        result.Succeeded.Should().BeFalse();
        result.Errors.Should().NotBeEmpty();
        result.Errors.First().Code.Should().Be("Register.PlanLoadFailed");
        result.Errors.First().Description.Should().Contain("Failed to load the default plan");
        result.ActionCode.Should().Be((int)HttpStatusCode.InternalServerError);
    }

    /// <summary>
    /// A failed service must NOT produce a token, and must not save: the save is the last step and
    /// only runs on success.
    /// </summary>
    [Fact]
    public async Task Handle_WhenServiceThrows_ShouldNotSaveAndNotGenerateToken()
    {
        SetupServiceFailure("Register.PlanLoadFailed", HttpStatusCode.InternalServerError);

        var handler = CreateHandler();
        var command = CreateValidCommand();

        await handler.Handle(command, CancellationToken.None);

        MockUnitOfWork.Verify(
            x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        MockJwtProvider.Verify(
            x => x.GenerateToken(It.IsAny<Guid>(), It.IsAny<string>()), Times.Never);
    }
}