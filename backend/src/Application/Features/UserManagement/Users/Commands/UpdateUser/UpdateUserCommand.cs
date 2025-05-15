using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.UserManagement.Users.Commands.UpdateUser
{
    public sealed class UpdateUserCommand : ICommand<bool>
    {
        public Guid Id { get; set; }
        public string FullName { get; set; }
        public string? CellPhone { get; set; }
        public string? Email { get; set; }
        public bool IsActive { get; set; }

    }

    public class UpdateUserCommandHandler : ICommandHandler<UpdateUserCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IUserRepository _userRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateUserCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IUserRepository userRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateUserCommand request, CancellationToken cancellationToken)
        {
            User user = await _userRepository.GetByIdAsync(request.Id);
            user.FullName = request.FullName;
            user.CellPhone = request.CellPhone;
            user.Email = request.Email;
            if (_httpContextService.IsSuperAdminOrOwnerAdmin)
                user.IsActive = request.IsActive;
            await _userRepository.UpdateAsync(user);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
