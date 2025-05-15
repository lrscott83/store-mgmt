using Application.Features.Administration.ReSellers.Commands.DeleteReSeller;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.Administration.ReSellers.Commands.DeleteReSeller
{
    public class DeleteReSellerCommandValidator : AbstractValidator<DeleteReSellerCommand>
    {
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public DeleteReSellerCommandValidator(IStringLocalizer<I18n> localizer, IReSellerRepository reSellerRepository)
        {
            _reSellerRepository = reSellerRepository;
            _localizer = localizer;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(ReSellerExists).WithMessage(_localizer["ReSellerNotFound", "{PropertyName}"]);

        }

        private async Task<bool> ReSellerExists(Guid reSellerId, CancellationToken cancellationToken)
        {
            return await _reSellerRepository.GetByIdAsync(reSellerId) != null;
        }

    }
}
