using Application.Features.SaleManagement.Products.Commands.CreateProduct;
using Domain.Interfaces.Repositories;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.SaleManagement.Products.Commands.ImportCsvProducts
{
    public class ImportCsvProductsCommandValidator : AbstractValidator<ImportCsvProductsCommand>
    {
        private readonly IProductRepository _productRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;
        public ImportCsvProductsCommandValidator(IStringLocalizer<I18n> localizer, IProductRepository productRepository,
            IStoreRepository storeRepository)
        {
            _productRepository = productRepository;
            _localizer = localizer;
            _storeRepository = storeRepository;

            RuleFor(x => x.CsvProducts)
              .NotNull().WithMessage(_localizer["IsRequired", "{PropertyName}"])
              .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"]);
        }

        private async Task<bool> StoreExists(Guid storeId, CancellationToken cancellationToken)
        {
            return await _storeRepository.GetByIdAsync(storeId) != null;
        }

    }
}
