using Application.Abstractions.Authentication;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Results;
using Domain.Entities.Owners;
using Domain.Interfaces.Services.Authentication;
using System.Net;

namespace Application.Features.Authentication.Commands.Register
{
    public sealed record RegisterCommand(string Login, string Password, string FullName, string CellPhone, string? Email,
        string StoreName, string? Code)
        : ICommand<AuthDto>
    { }

    /// <summary>
    /// Now a thin adapter: it owns only what is genuinely the transport's business — the single
    /// SaveChanges and the JWT. Every step that builds an artifact lives in
    /// <see cref="IRegisterService"/>, shared with the Gestor owner-create flow.
    /// </summary>
    /// <remarks>
    /// <para>The catch around the service is LOAD-BEARING, not defensive boilerplate. The service
    /// reports failure as <see cref="ApiException"/> carrying the SAME AcctionCode this handler
    /// used to return. It has to be caught and rebuilt into a returned ResponseResult, because
    /// AuthController maps a returned failure through a switch whose default arm is also
    /// BadRequest (HTTP 400) — whereas an escaping ApiException is handled by the middleware,
    /// which sets the HTTP status from the exception (HTTP 500). Letting it escape would silently
    /// turn every register failure from 400 into 500.</para>
    /// </remarks>
    public class RegisterCommandHandler : ICommandHandler<RegisterCommand, AuthDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IRegisterService _registerService;
        private readonly IJwtProvider _jwtProvider;
        private readonly IAuthTokenConfig _authTokenConfig;

        public RegisterCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IRegisterService registerService,
            IJwtProvider jwtProvider,
            IAuthTokenConfig authTokenConfig)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _registerService = registerService;
            _jwtProvider = jwtProvider;
            _authTokenConfig = authTokenConfig;
        }

        public async Task<ResponseResult<AuthDto>> Handle(RegisterCommand request, CancellationToken cancellationToken)
        {
            Owner owner;
            try
            {
                // Unchanged from the pre-refactor behavior: the owner description is SYNTHESIZED
                // from the store name, ignoring any caller-supplied description.
                owner = await _registerService.RegisterAsync(
                    request.Login,
                    request.Password,
                    request.FullName,
                    request.CellPhone,
                    request.Email,
                    request.StoreName,
                    "Nombre de la tienda: " + request.StoreName,
                    request.Code,
                    cancellationToken);
            }
            catch (ApiException ex)
            {
                return ResponseResult.Failure<AuthDto>(
                    new Error(ex.AcctionCode, ex.Message),
                    (int)ex.StatusCode);
            }

            int changesSaved = await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            if (changesSaved <= 0)
                return ResponseResult.Failure<AuthDto>(
                    new Error("Register.FailedToSave", "Registration failed: changes could not be saved to database."),
                    (int)HttpStatusCode.InternalServerError);

            string token = _jwtProvider.GenerateToken(owner.User.Id, request.Login);
            var expiresAt = DateTime.UtcNow.AddDays(_authTokenConfig.TokenLifetimeDays);

            return ResponseResult.Success(new AuthDto(request.Login, token, expiresAt));
        }
    }
}