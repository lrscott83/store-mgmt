using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Common.Results;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.UserManagement.Users.Commands.UpdateUserPassword
{
    public sealed record UpdateUserPasswordCommand : ICommand<bool>
    {
        public Guid UserId { get; set; }
        public string OldPassword { get; set; }
        public string NewPassword { get; set; }

    }

    public class UpdateUserPasswordCommandHandler : ICommandHandler<UpdateUserPasswordCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IUserRepository _userRepository;
        private readonly IHashPasswordService _hashPasswordService;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IOfflinePreHashProtector _preHashProtector;

        public UpdateUserPasswordCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IUserRepository userRepository,
            IHashPasswordService hashPasswordService,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IOfflinePreHashProtector preHashProtector)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _hashPasswordService = hashPasswordService;
            _localizer = localizer;
            _preHashProtector = preHashProtector;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateUserPasswordCommand request, CancellationToken cancellationToken)
        {
            User? user = await _userRepository.GetByIdAsync(request.UserId);
            if (user is null)
                return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);

            if (request.UserId == _httpContextService.UserExternalId.ToGuid())
            {
                if (!_hashPasswordService.VerifyPassword(request.OldPassword, user.Password))
                    return ResponseResult.Failure<bool>(UserErrors.InvalidCredentials, 400);
            }
            else if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);

            if (!_httpContextService.IsSuperAdmin
                && user.TenantId != _httpContextService.TenantId.ToGuid())
                return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);

            user.OfflinePasswordPreHash = _preHashProtector.Protect(request.NewPassword, user.Id);
            user.Password = _hashPasswordService.HashPassword(request.NewPassword);
            await _userRepository.UpdateAsync(user);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
