using Application.Features.Administration.ReSellers.Commands.UpdateReSeller;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.Administration.ReSellers.Commands.UpdateReSeller
{
    public class UpdateReSellerCommandValidator : AbstractValidator<UpdateReSellerCommand>
    {
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public UpdateReSellerCommandValidator(IStringLocalizer<I18n> localizer, IReSellerRepository reSellerRepository)
        {
            _reSellerRepository = reSellerRepository;
            _localizer = localizer;

            RuleFor(x => x.Id)
             .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
             .MustAsync(ReSellerExists).WithMessage(_localizer["ReSellerNotFound", "{PropertyName}"]);

            RuleFor(x => x.FullName)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.CellPhone)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);

            RuleFor(x => x.DiscountPrice)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              //.NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .GreaterThanOrEqualTo(0).WithMessage(_localizer["GreaterThanOrEqualTo", "{PropertyName}", 0]);

            RuleFor(x => x.PercentDiscountPrice)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              //.NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .GreaterThanOrEqualTo(0).WithMessage(_localizer["GreaterThanOrEqualTo", "{PropertyName}", 0])
              .LessThanOrEqualTo(100).WithMessage(_localizer["LessThanOrEqualTo", "{PropertyName}", 100]);

            When(x => !string.IsNullOrEmpty(x.Email), () =>
            {
                RuleFor(x => x.Email).EmailAddress().WithMessage(_localizer["EmailFormatInvalid", "{PropertyName}"]);
            });
            _reSellerRepository = reSellerRepository;
        }

        private async Task<bool> ReSellerExists(Guid tenantId, CancellationToken cancellationToken)
        {
            return await _reSellerRepository.GetByIdAsync(tenantId) != null;
        }

        private async Task<bool> ReSellerExists(Guid? reSellerId, CancellationToken cancellationToken)
        {
            return await _reSellerRepository.GetByIdAsync(reSellerId.Value) != null;
        }
    }
}
