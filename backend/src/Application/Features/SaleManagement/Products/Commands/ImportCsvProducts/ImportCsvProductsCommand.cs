using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SaleManagement;
using Application.Exceptions;
using Application.Features.SaleManagement.Products.Commands.CreateProducts;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.ProductCategories;
using Domain.Entities.Products;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections;
using System.Collections.Frozen;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.SaleManagement.Products.Commands.ImportCsvProducts
{
    public sealed record ImportCsvProductsCommand(IList<CsvProductDto> CsvProducts) : ICommand<bool>
    { }

    public class ImportCsvProductsCommandHandler : ICommandHandler<ImportCsvProductsCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IProductRepository _productRepository;
        private readonly IProductCategoryRepository _productCategoryRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public ImportCsvProductsCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IProductRepository productRepository,
            IProductCategoryRepository productCategoryRepository,
            IStoreRepository storeRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _productRepository = productRepository;
            _productCategoryRepository = productCategoryRepository;
            _storeRepository = storeRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(ImportCsvProductsCommand request, CancellationToken cancellationToken)
        {
            if (!string.IsNullOrEmpty(_httpContextService.StoreId))
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            Store store = await _storeRepository.GetByIdAsync(_httpContextService.StoreId.ToGuid());
            if (store == null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            Guid tenantId = _httpContextService.TenantId.ToGuid();
            HashSet<string> categoryNames = request.CsvProducts.Select(x => x.CategoryName).ToHashSet();
            List<ProductCategory> categories = await _productCategoryRepository.FindProductCategoriesByNames(categoryNames);
            IDictionary<string, ProductCategory> categoriesDictionary = new Dictionary<string, ProductCategory>();
            categories.ForEach(c => categoriesDictionary.Add(c.Name, c));
            int maxCategoryOrder = categories.Max(p => p.Order);

            IReadOnlyCollection<Product> allProducts = await _productRepository.GetAllAsync();
            IDictionary<Guid, List<Product>> categoryProductsDictionary = new Dictionary<Guid, List<Product>>();
            foreach (Product product in allProducts)
            {
                if (!categoryProductsDictionary.ContainsKey(product.CategoryId))
                {
                    categoryProductsDictionary.Add(product.CategoryId, new List<Product>());  
                }
                categoryProductsDictionary[product.CategoryId].Add(product);
            }

            IList<string> insertedProductNames = new List<string>();
            request.CsvProducts
                .Where(p => !string.IsNullOrEmpty(p.CategoryName) && !string.IsNullOrEmpty(p.ProductName) && p.Price >= 0).ToList()
                .ForEach(async p =>
                {
                    if (!categoriesDictionary.ContainsKey(p.CategoryName))
                    {
                        ProductCategory newCategory = ProductCategory.Create(store.Id, p.CategoryName, ++maxCategoryOrder, tenantId);
                        await _productCategoryRepository.AddAsync(newCategory);
                        categoriesDictionary.Add(p.ProductName, newCategory);
                        categoryProductsDictionary.Add(newCategory.Id, new List<Product>());
                    }

                    ProductCategory category = categoriesDictionary[p.CategoryName];
                    List<Product> products = categoryProductsDictionary[category.Id];
                    if (products.All(prod => prod.Name != p.ProductName))
                    {
                        int maxOrder = products.Max(p => p.Order);
                        Product product = Product.Create(p.ProductName, category.Id, p.Price, maxOrder + 1,
                            true, true, "", _httpContextService.TenantId.ToGuid());
                        await _productRepository.AddAsync(product);
                        categoryProductsDictionary[category.Id].Add(product);
                    }

                });

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
