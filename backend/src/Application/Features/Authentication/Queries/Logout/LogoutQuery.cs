using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Authentication;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Microsoft.EntityFrameworkCore;
using System.Net;

namespace Application.Features.Authentication.Queries.Logout
{
    public sealed record LogoutQuery() : IQuery<bool> {}

    public class LogoutQueryHandler : IQueryHandler<LogoutQuery, bool>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IJwtProvider _jwtProvider;
        public LogoutQueryHandler(IUserRepository userRepository, IHttpContextService httpContextService, IJwtProvider jwtProvider)
        {
            _userRepository = userRepository;
            _httpContextService = httpContextService;
            _jwtProvider = jwtProvider;
        }

        public async Task<ResponseResult<bool>> Handle(LogoutQuery request, CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(_httpContextService.UserExternalId))
                return ResponseResult.Success(true);

            var userId = _httpContextService.UserExternalId.ToGuid();
            var user = await _userRepository
                .Where(user => user.Id == userId)
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync();

            if (user is null)
                return ResponseResult.Failure<bool>(UserErrors.NotFound, (int)HttpStatusCode.NotFound);

            //_jwtProvider.GenerateToken(userId, user.Login);

            await _httpContextService.SignOutAsync();

            return ResponseResult.Success(true);
        }
    }
}
