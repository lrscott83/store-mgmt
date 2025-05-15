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
using System.Net;

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

        public UpdateUserPasswordCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IUserRepository userRepository,
            IHashPasswordService hashPasswordService,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _hashPasswordService = hashPasswordService;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateUserPasswordCommand request, CancellationToken cancellationToken)
        {
            User user = await _userRepository.GetByIdAsync(request.UserId);
            if (request.UserId == _httpContextService.UserExternalId.ToGuid())
            {
                string hashedPassword = _hashPasswordService.HashPassword(request.OldPassword);
                if (user.Password != hashedPassword)
                    return ResponseResult.Failure<bool>(UserErrors.InvalidPassword(user.Login), (int)HttpStatusCode.BadRequest);
            }
            else if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                return ResponseResult.Failure<bool>(UserErrors.InvalidPassword(user.Login), (int)HttpStatusCode.BadRequest);

            user.Password = request.NewPassword;
            await _userRepository.UpdateAsync(user);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
