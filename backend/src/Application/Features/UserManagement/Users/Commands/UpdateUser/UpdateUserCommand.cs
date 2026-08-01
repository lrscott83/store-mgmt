using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
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
        public bool? IsActive { get; set; }

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
            User? user = await _userRepository.GetByIdAsync(request.Id);
            if (user is null)
                return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);

            if (request.Id != _httpContextService.UserExternalId.ToGuid() && !_httpContextService.IsSuperAdminOrOwnerAdmin)
                return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);

            user.FullName = request.FullName;
            if (request.CellPhone is not null) user.CellPhone = request.CellPhone == "" ? null : request.CellPhone;
            if (request.Email is not null) user.Email = request.Email == "" ? null : request.Email;
            if (_httpContextService.IsSuperAdminOrOwnerAdmin && request.IsActive.HasValue)
                user.IsActive = request.IsActive.Value;

            // ApplicationDbContext defaults to QueryTrackingBehavior.NoTracking, so GetByIdAsync (FindAsync)
            // returns an UNTRACKED entity — UpdateAsync (Entry.State = Modified) is what attaches it.
            // Without it, SaveChangesAsync sees no changes and nothing persists. The full-column UPDATE is
            // safe because the entity carries fresh DB values; tri-state guards only mutate body fields.
            await _userRepository.UpdateAsync(user);

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
