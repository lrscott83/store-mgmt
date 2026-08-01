using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.UserManagement.Users.Commands.DeleteUser
{
    public sealed record DeleteUserCommand(Guid Id) : ICommand<bool> { }

    public class DeleteUserCommandHandler : ICommandHandler<DeleteUserCommand, bool>
    {
        private readonly IUserRepository _userRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public DeleteUserCommandHandler(
            IUserRepository userRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _userRepository = userRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _localizer = localizer;
        }


        public async Task<ResponseResult<bool>> Handle(DeleteUserCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden);

            if (request.Id == _httpContextService.UserExternalId.ToGuid())
                throw new ApiException(_localizer["CannotDeleteSelf"], HttpStatusCode.BadRequest);

            var user = await _userRepository.GetByIdAsync(request.Id);
            if (user is null)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.NotFound);
            user.IsActive = false;
            await _userRepository.UpdateAsync(user);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
