using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.StoreCatalogImages;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Showcase.Commands.RemoveStoreCatalogImage
{
    /// <summary>
    /// Quita UNA imagen del showcase: borra la fila y el archivo del disco.
    ///
    /// El command lleva solo el `Id`, y por eso la PERTENENCIA se resuelve dentro del handler contra
    /// las imágenes de la tienda del contexto. Cargar por `Id` no serviría: el filtro global de
    /// `ApplicationDbContext` acota por TENANT, no por tienda, así que un dueño de otra tienda del
    /// mismo tenant podría quitar una imagen que no es suya.
    ///
    /// NO lleva `StoreId` por la misma razón que los demás comandos de gestión: la tienda es la del
    /// contexto, y aceptarla en el cuerpo abriría la puerta a la de otro.
    ///
    /// Quitar es BORRAR, no desactivar: la imagen desaparece del disco y de la base. La columna
    /// `IsActive` existe para "dejar de mostrarla sin perder el archivo", que no es lo que pide un
    /// "quitar" de la vista.
    /// </summary>
    public sealed record RemoveStoreCatalogImageCommand(Guid Id) : ICommand<bool>;

    public class RemoveStoreCatalogImageCommandHandler
        : ICommandHandler<RemoveStoreCatalogImageCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreCatalogImageRepository _imageRepository;
        private readonly ICatalogImageStorage _catalogImageStorage;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ILogger<RemoveStoreCatalogImageCommandHandler> _logger;

        public RemoveStoreCatalogImageCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStoreCatalogImageRepository imageRepository,
            ICatalogImageStorage catalogImageStorage,
            IStringLocalizer<I18n> localizer,
            ILogger<RemoveStoreCatalogImageCommandHandler> logger)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _imageRepository = imageRepository;
            _catalogImageStorage = catalogImageStorage;
            _localizer = localizer;
            _logger = logger;
        }

        public async Task<ResponseResult<bool>> Handle(RemoveStoreCatalogImageCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            // Se busca DENTRO de las imágenes de la tienda del contexto, y no por id: eso es lo que
            // convierte "es de mi tienda" en una condición y no en una promesa. Un id de otra tienda no
            // está en la lista, así que cae en el 404 de abajo.
            IList<StoreCatalogImage> images = await _imageRepository.GetByStoreIdAsync(storeId);
            StoreCatalogImage? image = images.FirstOrDefault(i => i.Id == request.Id);

            if (image == null)
                throw new ApiException(_localizer["ShowcaseImageNotFound"], HttpStatusCode.NotFound);

            await _imageRepository.DeleteAsync(image);

            bool saved = await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0;

            // El archivo se borra SOLO cuando la fila quedó eliminada: nunca al revés. Borrar el
            // archivo antes de confirmar la fila dejaría el carrusel del storefront pidiendo una imagen
            // que ya no existe.
            //
            // Y si el borrado del ARCHIVO falla, no se relanza: la fila es la fuente de verdad y la
            // operación ya está confirmada, así que un fallo de disco aquí es DEUDA DE DISCO, no un
            // error de la operación. Relanzar convertiría un 200 correcto en un fallo y el reintento
            // del dueño recibiría un 404 de una imagen que ya no existe. Se registra para que la deuda
            // sea rastreable y se limpia aparte.
            if (saved)
            {
                try
                {
                    await _catalogImageStorage.DeleteAsync(image.Key, cancellationToken);
                }
                catch (Exception exception)
                {
                    _logger.LogWarning(
                        exception,
                        "Fila de imagen de showcase {ShowcaseImageId} eliminada, pero su archivo no se pudo borrar: {ImageKey}. La fila es la fuente de verdad; el archivo queda como deuda de disco.",
                        image.Id,
                        image.Key);
                }
            }

            return ResponseResult.Success(saved);
        }
    }
}