using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.StoreCatalogImages;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Showcase.Commands.ReorderStoreCatalogImages
{
    /// <summary>
    /// Reordena UN conjunto del showcase. <paramref name="OrderedIds"/> es el orden FINAL completo, no
    /// un movimiento: es la misma forma que usa el reordenado de la galería de producto, y por el mismo
    /// motivo —mover "de la 2 a la 1" obliga al cliente a calcular el desplazamiento de todo lo demás—.
    ///
    /// La lista debe ser EXACTA: las mismas imágenes que hay ahora en ese conjunto, en el orden
    /// deseado. Un subconjunto movería esas imágenes y dejaría las demás con un orden que ya nadie
    /// eligió; una lista con repetidos pondría dos imágenes en la misma posición y sacaría otra del
    /// conjunto.
    ///
    /// NO lleva `StoreId`: la tienda es la del contexto.
    /// </summary>
    public sealed record ReorderStoreCatalogImagesCommand(
        StoreCatalogImageKind Kind,
        IReadOnlyList<Guid> OrderedIds) : ICommand<bool>;

    public class ReorderStoreCatalogImagesCommandHandler
        : ICommandHandler<ReorderStoreCatalogImagesCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreCatalogImageRepository _imageRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public ReorderStoreCatalogImagesCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreCatalogImageRepository imageRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _imageRepository = imageRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(ReorderStoreCatalogImagesCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            if (!Enum.IsDefined(request.Kind))
                throw new ApiException(
                    _localizer["ShowcaseImageKindInvalid", request.Kind],
                    HttpStatusCode.BadRequest);

            IList<StoreCatalogImage> current = (await _imageRepository.GetByStoreIdAsync(storeId))
                .Where(image => image.Kind == request.Kind)
                .ToList();

            // `null` desde el JSON es lo mismo que una lista vacía. Y una lista vacía NO es un reordenado: es
            // una petición que no trae nada que hacer. Aceptarla devolvería un 200 y creería que
            // ordenó cuando en realidad el cliente se olvidó de mandar los ids —el mismo motivo por el
            // que la marca rechaza un PUT sin cambios—.
            IReadOnlyList<Guid> orderedIds = request.OrderedIds ?? [];

            if (orderedIds.Count == 0)
                throw new ApiException(_localizer["ShowcaseOrderMismatch"], HttpStatusCode.BadRequest);

            // La lista tiene que ser EXACTAMENTE el conjunto de ids que hay ahora. Esto cubre de una vez
            // los tres fallos posibles y ninguno se aplica a medias:
            //   * un id de otra tienda del mismo tenant (el filtro global no acota por tienda),
            //   * un id del OTRO conjunto (mover un destacado dentro del carrusel lo sacaría de su bloque),
            //   * una lista incompleta, con repetidos o con ids inventados.
            bool sameSet = orderedIds.Count == current.Count
                && orderedIds.Distinct().Count() == orderedIds.Count
                && current.All(image => orderedIds.Contains(image.Id));

            if (!sameSet)
                throw new ApiException(_localizer["ShowcaseOrderMismatch"], HttpStatusCode.BadRequest);

            // Se reescribe el `OrderIndex` de TODAS, no solo el de las que cambian: si solo se tocara la
            // imagen movida, la que ocupaba su lugar se quedaría con el mismo índice y las dos quedarían
            // empatadas en el carrusel.
            for (int index = 0; index < orderedIds.Count; index++)
            {
                StoreCatalogImage image = current.First(i => i.Id == orderedIds[index]);
                image.OrderIndex = index;

                // `ApplicationDbContext` es NoTracking: mutar la fila cargada sin marcar no escribiría
                // NADA — sin error y sin aviso. Por eso el repositorio la marca explícitamente.
                await _imageRepository.UpdateAsync(image);
            }

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}