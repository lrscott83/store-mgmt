using Application.Abstractions.HttpContext;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.Management.StoreUsers.Queries.GetStoreUserById
{
    public class GetStoreUserByIdQueryValidator : AbstractValidator<GetStoreUserByIdQuery>
    {
        private readonly IStoreUserRepository _storeUserRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;
        public GetStoreUserByIdQueryValidator(IStringLocalizer<I18n> localizer, IStoreUserRepository storeUserRepository,
            IHttpContextService httpContextService)
        {
            _storeUserRepository = storeUserRepository;
            _localizer = localizer;
            _httpContextService = httpContextService;

            RuleFor(x => x.StoreUserId)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(UserExists).WithMessage(_localizer["UserNotFound", "{PropertyName}"]);

        }

        private async Task<bool> UserExists(Guid storeUserId, CancellationToken cancellationToken)
        {
            return (_httpContextService.IsSuperAdmin
                ? await _storeUserRepository.GetStoreUserByIdIgnoreQueryFilterAsync(storeUserId)
                : await _storeUserRepository.GetStoreUserByIdAsync(storeUserId))
                != null;
        }
    }
}
