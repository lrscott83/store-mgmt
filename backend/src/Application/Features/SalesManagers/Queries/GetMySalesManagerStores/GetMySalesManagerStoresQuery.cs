using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SalesManagers;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.SalesManagers;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Queries.GetMySalesManagerStores
{
    /// <summary>
    /// Catálogos web que el gestor puede abrir: tiendas activas de SU Owner, con catálogo
    /// publicado y con el módulo 21 activo (S3/D5). La pertenencia al Owner autoriza; el módulo
    /// solo evita ofrecer un catálogo donde el alta de pedido sería rechazada.
    /// </summary>
    public sealed record GetMySalesManagerStoresQuery : IQuery<List<SalesManagerCatalogDto>>;

    public class GetMySalesManagerStoresQueryHandler
        : IQueryHandler<GetMySalesManagerStoresQuery, List<SalesManagerCatalogDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly ISalesManagerRepository _salesManagerRepository;
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;

        public GetMySalesManagerStoresQueryHandler(
            IHttpContextService httpContextService,
            ISalesManagerRepository salesManagerRepository,
            IStoreRepository storeRepository,
            IStoreModuleRepository storeModuleRepository)
        {
            _httpContextService = httpContextService;
            _salesManagerRepository = salesManagerRepository;
            _storeRepository = storeRepository;
            _storeModuleRepository = storeModuleRepository;
        }

        public async Task<ResponseResult<List<SalesManagerCatalogDto>>> Handle(
            GetMySalesManagerStoresQuery request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsGestorVentas)
                throw new ApiException("Solo un gestor de ventas puede ver sus catálogos.", HttpStatusCode.Forbidden);

            Guid userId = _httpContextService.UserExternalId.ToGuid();
            SalesManager? manager = await _salesManagerRepository.GetByUserIdAsync(userId);
            if (manager is null)
                throw new ApiException("Gestor de ventas no encontrado.", HttpStatusCode.Forbidden);

            List<Store> stores = (await _storeRepository
                .GetActiveStoresWithCatalogByOwnerIdAsync(manager.OwnerId))
                .ToList();

            if (stores.Count == 0)
                return ResponseResult.Success(new List<SalesManagerCatalogDto>());

            // Una sola consulta para todas las tiendas: el gating por tienda en un bucle era N+1.
            IReadOnlyCollection<Guid> withModule =
                await _storeModuleRepository.GetStoreIdsWithActiveModuleAsync(
                    stores.Select(s => s.Id),
                    (int)ModuleType.GestoresVentas,
                    cancellationToken);

            List<SalesManagerCatalogDto> result = stores
                .Where(store => withModule.Contains(store.Id))
                .Select(store => new SalesManagerCatalogDto(
                    store.Id,
                    store.Name,
                    store.CatalogSlug!))
                .ToList();

            return ResponseResult.Success(result);
        }
    }
}
