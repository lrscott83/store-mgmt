using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.ReSellers.Commands.UpdateReSeller
{
    public sealed class UpdateReSellerCommand : ICommand<bool>
    {
        public Guid Id { get; set; }
        public string FullName { get; set; }
        public string CellPhone { get; set; }
        public string? Email { get; set; }
        public float DiscountPrice { get; set; }
        public float PercentDiscountPrice { get; set; }
        public string Description { get; set; }
        public bool IsActive { get; set; }

    }

    public class UpdateReSellerCommandHandler : ICommandHandler<UpdateReSellerCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IUserRepository _userRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateReSellerCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IReSellerRepository reSellerRepository,
            IUserRepository userRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _reSellerRepository = reSellerRepository;
            _userRepository = userRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateReSellerCommand request, CancellationToken cancellationToken)
        {
            if (!(_httpContextService.IsSuperAdmin || _httpContextService.IsReSeller))
                throw new ApiException(_localizer["ReSellerNotFound"], HttpStatusCode.BadRequest);

            ReSeller reSeller = await _reSellerRepository.GetReSellerIncludingUserByIdAsync(request.Id);

            reSeller.User.FullName = request.FullName;
            reSeller.DiscountPrice = request.DiscountPrice;
            reSeller.PercentDiscountPrice = request.PercentDiscountPrice;
            reSeller.User.CellPhone = request.CellPhone;
            reSeller.User.Email = request.Email;
            reSeller.IsActive = request.IsActive;
            reSeller.Description = request.Description;
            await _userRepository.UpdateAsync(reSeller.User);
            await _reSellerRepository.UpdateAsync(reSeller);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
