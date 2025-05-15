using Application.Abstractions.Authentication;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using System.Net;

namespace Application.Features.Authentication.Commands.Login
{
    public sealed record LoginCommand(string Login, string Password) : ICommand<AuthDto> { }

    public class LoginCommandHandler : ICommandHandler<LoginCommand, AuthDto>
    {
        private readonly IAuthenticationService _authenticationService;
        private readonly IJwtProvider _jwtProvider;

        public LoginCommandHandler(
            IAuthenticationService authenticationService, 
            IJwtProvider jwtProvider)
        {
            _authenticationService = authenticationService;
            _jwtProvider = jwtProvider;
        }

        public async Task<ResponseResult<AuthDto>> Handle(LoginCommand request, CancellationToken cancellationToken)
        {
            var authResult = await _authenticationService.IsValidUserAsync(request.Login, request.Password);
            if (!authResult.Succeeded || authResult.Data == default)
            {
                ResponseResult<AuthDto> responseResult = ResponseResult.Failure<AuthDto>(authResult.Errors, (int)HttpStatusCode.BadRequest);
                return responseResult;
            }

            string token = _jwtProvider.GenerateToken(authResult.Data, request.Login);
            return ResponseResult.Success(new AuthDto(request.Login, token, "", new DateTime()));
        }
    }
}
