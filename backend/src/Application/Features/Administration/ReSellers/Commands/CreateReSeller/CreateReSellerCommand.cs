using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.ReSellers;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.Administration.ReSellers.Commands.CreateReSeller
{
    public sealed record CreateReSellerCommand(string Login, string Password, string FullName, string Cellphone,
        string? Email, string? Description) : ICommand<bool>
    { }

    public class CreateReSellerCommandHandler : ICommandHandler<CreateReSellerCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IUserRepository _userRepository;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IHashPasswordService _hashPasswordService;
        private readonly ISystemConfigurationRepository _systemConfigurationRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly IOfflinePreHashProtector _preHashProtector;

        public CreateReSellerCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IUserRepository userRepository,
            IReSellerRepository reSellerRepository,
            IHttpContextService httpContextService,
            IHashPasswordService hashPasswordService,
            ISystemConfigurationRepository systemConfigurationRepository,
            IStringLocalizer<I18n> localizer,
            IUserRoleRepository userRoleRepository,
            IOfflinePreHashProtector preHashProtector)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _reSellerRepository = reSellerRepository;
            _localizer = localizer;
            _hashPasswordService = hashPasswordService;
            _systemConfigurationRepository = systemConfigurationRepository;
            _userRoleRepository = userRoleRepository;
            _preHashProtector = preHashProtector;
        }

        public async Task<ResponseResult<bool>> Handle(CreateReSellerCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            Guid tenantId = Guid.NewGuid();
            string password = _hashPasswordService.HashPassword(request.Password);
            var user = User.Create(request.Login, password, request.FullName, request.Cellphone, request.Email, tenantId);
            user.OfflinePasswordPreHash = _preHashProtector.Protect(request.Password, user.Id);
            await _userRepository.AddAsync(user);

            float defaultPercentDiscountPrice = await _systemConfigurationRepository.GetReSellerPercentDiscountPriceAsync();
            var reSeller = ReSeller.Create(user.Id, false, 0, defaultPercentDiscountPrice, tenantId, request.Description ?? "");
            await _reSellerRepository.AddAsync(reSeller);

            var userRole = UserRole.Create(user.Id, (int)RoleType.ReSeller, tenantId);
            await _userRoleRepository.AddAsync(userRole);

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
