using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.ProductSalesCommissions;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Commands.UpsertProductSalesCommission
{
    public sealed record UpsertProductSalesCommissionCommand(
        Guid ProductId,
        SalesCommissionType Type,
        decimal Value,
        Currency Currency) : ICommand<bool>;

    /// <summary>
    /// Configura la comisión de UN producto de la tienda actual. Es Owner-only y la puerta de
    /// módulo vive en el controlador (`GestoresVentasAdmin`). El producto debe pertenecer a la
    /// tienda de la sesión; un id de otra tienda es 404.
    ///
    /// La configuración vive en `ProductSalesCommission` (tabla propia), nunca en `Product`.
    /// </summary>
    public class UpsertProductSalesCommissionCommandHandler
        : ICommandHandler<UpsertProductSalesCommissionCommand, bool>
    {
        private readonly IApplicationUnitOfWork _unitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IProductRepository _productRepository;
        private readonly IProductSalesCommissionRepository _commissionRepository;

        public UpsertProductSalesCommissionCommandHandler(
            IApplicationUnitOfWork unitOfWork,
            IHttpContextService httpContextService,
            IProductRepository productRepository,
            IProductSalesCommissionRepository commissionRepository)
        {
            _unitOfWork = unitOfWork;
            _httpContextService = httpContextService;
            _productRepository = productRepository;
            _commissionRepository = commissionRepository;
        }

        public async Task<ResponseResult<bool>> Handle(
            UpsertProductSalesCommissionCommand request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsOwnerAdmin)
                throw new ApiException("Solo el Owner puede configurar comisiones.", HttpStatusCode.Forbidden);

            Guid storeId = _httpContextService.StoreId.ToGuid();
            Guid tenantId = _httpContextService.TenantId.ToGuid();
            if (storeId == Guid.Empty || tenantId == Guid.Empty)
                throw new ApiException("Tienda no seleccionada.", HttpStatusCode.BadRequest);

            if (request.Value < 0)
                throw new ApiException("La comisión no puede ser negativa.", HttpStatusCode.BadRequest);
            if (request.Type == SalesCommissionType.Percentage && request.Value > 100)
                throw new ApiException("El porcentaje de comisión no puede superar 100.", HttpStatusCode.BadRequest);

            if (!await _productRepository.BelongsToStoreAsync(storeId, request.ProductId))
                throw new ApiException("Producto no encontrado.", HttpStatusCode.NotFound);

            ProductSalesCommission? existing =
                await _commissionRepository.GetByProductIdAsync(request.ProductId);

            if (existing is null)
            {
                await _commissionRepository.AddAsync(ProductSalesCommission.Create(
                    storeId,
                    request.ProductId,
                    request.Type,
                    request.Value,
                    request.Currency,
                    tenantId));
            }
            else
            {
                existing.Type = request.Type;
                existing.Value = request.Value;
                existing.Currency = request.Currency;
                existing.IsActive = true;
                await _commissionRepository.UpdateAsync(existing);
            }

            return ResponseResult.Success(
                await _unitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
