using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.Administration.ReSellers.Commands.DeleteReSeller
{
    public sealed record DeleteReSellerCommand(Guid Id) : ICommand<bool> { }

    public class DeleteReSellerCommandHandler : ICommandHandler<DeleteReSellerCommand, bool>
    {
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public DeleteReSellerCommandHandler(
            IReSellerRepository reSellerRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _reSellerRepository = reSellerRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _localizer = localizer;
        }


        public async Task<ResponseResult<bool>> Handle(DeleteReSellerCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["ReSellerNotFound"], HttpStatusCode.BadRequest);

            var reSeller = await _reSellerRepository.GetByIdAsync(request.Id);
            await _reSellerRepository.DeleteAsync(reSeller);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
