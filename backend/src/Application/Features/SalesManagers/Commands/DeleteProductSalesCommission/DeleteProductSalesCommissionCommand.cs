using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.ProductSalesCommissions;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Commands.DeleteProductSalesCommission
{
    public sealed record DeleteProductSalesCommissionCommand(Guid ProductId) : ICommand<bool>;

    /// <summary>
    /// Quita la configuración de comisión de un producto. Es un borrado FÍSICO de una fila de
    /// configuración (no es un registro financiero): así el producto puede volver a configurarse
    /// sin chocar con el índice único de `ProductId`.
    /// </summary>
    public class DeleteProductSalesCommissionCommandHandler
        : ICommandHandler<DeleteProductSalesCommissionCommand, bool>
    {
        private readonly IApplicationUnitOfWork _unitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IProductRepository _productRepository;
        private readonly IProductSalesCommissionRepository _commissionRepository;

        public DeleteProductSalesCommissionCommandHandler(
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
            DeleteProductSalesCommissionCommand request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsOwnerAdmin)
                throw new ApiException("Solo el Owner puede configurar comisiones.", HttpStatusCode.Forbidden);

            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException("Tienda no seleccionada.", HttpStatusCode.BadRequest);

            if (!await _productRepository.BelongsToStoreAsync(storeId, request.ProductId))
                throw new ApiException("Producto no encontrado.", HttpStatusCode.NotFound);

            ProductSalesCommission? existing =
                await _commissionRepository.GetByProductIdAsync(request.ProductId);
            if (existing is null)
                throw new ApiException("Configuración de comisión no encontrada.", HttpStatusCode.NotFound);

            await _commissionRepository.HardDeleteAsync(existing);

            return ResponseResult.Success(
                await _unitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
