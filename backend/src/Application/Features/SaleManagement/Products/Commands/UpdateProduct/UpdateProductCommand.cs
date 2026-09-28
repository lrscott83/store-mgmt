using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Products;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.ComponentModel.DataAnnotations;

namespace Application.Features.SaleManagement.Products.Commands.UpdateProduct
{
    public sealed class UpdateProductCommand : ICommand<bool>
    {
        public Guid Id { get; set; }
        public Guid CategoryId { get; set; }
        public string Name { get; set; }
        public decimal Price { get; set; }
        public bool AvailableToSale { get; set; }
        public bool DiscountFromInventory { get; set; }
        public string BusinessId { get; set; }
        public int Order { get; set; }
        public bool IsActive { get; set; }

        // --- Campos del catálogo web (plan 2026-09-27, se editan solo en la vista "Catálogo Web").
        // Son opcionales a propósito: el formulario de Productos no los envía (null = no tocar),
        // así ningún cambio de catálogo se pierde al editar el producto desde el catálogo de venta.

        /// <summary>Descripción del catálogo (texto plano, nunca HTML).</summary>
        public string? Description { get; set; }
        /// <summary>% de descuento escalado (1250 == 12.50 %).</summary>
        public int? PercentDiscountPrice { get; set; }
        /// <summary>Monto rebajado escalado (500 == 5.00).</summary>
        public int? DiscountPrice { get; set; }
        /// <summary>Marca "Nuevo" del catálogo.</summary>
        public bool? IsNew { get; set; }
        /// <summary>Clave de la imagen principal del catálogo.</summary>
        public string? Image { get; set; }
        /// <summary>true para limpiar la imagen principal (el resto de campos usan null = no tocar).</summary>
        public bool RemoveImage { get; set; }
    }

    public class UpdateProductCommandHandler : ICommandHandler<UpdateProductCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IProductRepository _productRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateProductCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IProductRepository productRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _productRepository = productRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateProductCommand request, CancellationToken cancellationToken)
        {
            Product product = await _productRepository.GetByIdAsync(request.Id);
            if (_productRepository.Where(s => s.Id != request.Id).Any(s => s.Name == request.Name))
                throw new ValidationException(_localizer["ProductAlreadyExists", request.Name]);

            product.Name = request.Name;
            product.CategoryId = request.CategoryId;
            product.Price = request.Price;
            product.AvailableToSale = request.AvailableToSale;
            product.DiscountFromInventory = request.DiscountFromInventory;
            product.BusinessId = request.BusinessId;
            product.Order = request.Order;
            product.IsActive = request.IsActive;

            // Catálogo web: solo se aplican los campos enviados (el formulario de Productos los omite).
            if (request.Description != null)
                product.Description = request.Description;
            if (request.PercentDiscountPrice.HasValue)
                product.PercentDiscountPrice = request.PercentDiscountPrice.Value;
            if (request.DiscountPrice.HasValue)
                product.DiscountPrice = request.DiscountPrice.Value;
            if (request.IsNew.HasValue)
                product.IsNew = request.IsNew.Value;
            if (request.RemoveImage)
                product.Image = null;
            else if (request.Image != null)
                product.Image = request.Image;

            await _productRepository.UpdateAsync(product);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
