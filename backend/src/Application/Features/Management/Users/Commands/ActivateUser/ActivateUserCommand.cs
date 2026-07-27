using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Management.Users.Commands.ActivateUser
{
    public sealed record ActivateUserCommand(Guid Id, bool IsActive) : ICommand<bool> { }

    public class ActivateUserCommandHandler : ICommandHandler<ActivateUserCommand, bool>
    {
        private readonly IUserRepository _userRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public ActivateUserCommandHandler(
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


        public async Task<ResponseResult<bool>> Handle(ActivateUserCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            var user = await _userRepository.GetByIdAsync(request.Id);
            if (user is null)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);
            user.IsActive = true;
            await _userRepository.UpdateAsync(user);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
