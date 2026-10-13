using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Catalog;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.UpdateStoreCatalogSlug
{
    /// <summary>
    /// Fija el SLUG público (`/catalog/&lt;slug&gt;`) del catálogo web de UNA tienda.
    ///
    /// SuperAdmin only: la URL pública es una decisión de PLATAFORMA, no de la tienda, así que
    /// comparte la capacidad por-tienda de `catalog-template` y `module-pricing`.
    ///
    /// Escribe SOLO `Store.CatalogSlug`. El valor se NORMALIZA con <see cref="SlugNormalizer"/>, el
    /// mismo que usa el autogenerado: minúsculas, sin tildes ni ñ, alfabeto `[a-z0-9-]`, máximo 63.
    /// Un slug ya tomado por OTRA tienda se RECHAZA (409) — nunca se auto-sufija, porque el
    /// SuperAdmin eligió ese valor exacto y devolverle otro distinto sería mentirle. Guardar el
    /// slug que la tienda YA tiene es válido: no colisiona consigo misma.
    ///
    /// Como TODOS los endpoints públicos resuelven la tienda por esta columna
    /// (<c>StoreRepository.GetStoreByCatalogSlugAsync</c>), el valor nuevo aplica a todo el catálogo
    /// de inmediato —productos, detalle, media, showcase, marca, config de pedidos, estado y alta de
    /// pedido— y lo ÚNICO que cambia es la URL pública. Ninguna funcionalidad depende de que la URL
    /// siga siendo la vieja.
    /// </summary>
    public sealed record UpdateStoreCatalogSlugCommand(Guid StoreId, string Slug)
        : ICommand<StoreCatalogSlugDto>;

    internal sealed class UpdateStoreCatalogSlugCommandHandler
        : ICommandHandler<UpdateStoreCatalogSlugCommand, StoreCatalogSlugDto>
    {
        private readonly IApplicationUnitOfWork _unitOfWork;
        private readonly IStoreRepository _storeRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateStoreCatalogSlugCommandHandler(
            IApplicationUnitOfWork unitOfWork,
            IStoreRepository storeRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _unitOfWork = unitOfWork;
            _storeRepository = storeRepository;
            _httpContextService = httpContextService;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreCatalogSlugDto>> Handle(
            UpdateStoreCatalogSlugCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            Store? store = await _storeRepository.GetStoreByIdAsync(request.StoreId);
            if (store is null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            // Se normaliza, no se valida por formato: la entrada puede venir con mayúsculas, tildes
            // o espacios y aun así es inequívoca. El resultado SIEMPRE cumple el alfabeto del índice.
            string slug = SlugNormalizer.Normalize(request.Slug);

            IReadOnlyCollection<string> takenSlugs = await _storeRepository.GetCatalogSlugsAsync();
            bool takenByAnotherStore =
                takenSlugs.Contains(slug, StringComparer.Ordinal)
                && !string.Equals(store.CatalogSlug, slug, StringComparison.Ordinal);
            if (takenByAnotherStore)
                throw new ApiException(_localizer["CatalogSlugInUse"], HttpStatusCode.Conflict);

            store.CatalogSlug = slug;

            // NoTracking por defecto: hay que marcar la fila para que SaveChanges escriba de verdad.
            await _storeRepository.UpdateAsync(store);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(new StoreCatalogSlugDto
            {
                StoreId = request.StoreId,
                CatalogSlug = slug,
            });
        }
    }
}
