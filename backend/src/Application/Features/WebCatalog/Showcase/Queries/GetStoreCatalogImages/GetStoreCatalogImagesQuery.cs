using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.WebCatalog;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Common.Enums;
using Domain.Entities.StoreCatalogImages;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.WebCatalog.Showcase.Queries.GetStoreCatalogImages
{
    /// <summary>
    /// Lee las imágenes del SHOWCASE (carrusel e imágenes del día) de la tienda seleccionada, para la
    /// vista Catálogo Web (OwnerAdmin).
    ///
    /// Si la tienda todavía no tiene imágenes NO se devuelve un 404: se devuelven los dos conjuntos
    /// vacíos. Una tienda recién sincronizada tiene catálogo publicado y aún no ha subido nada, y un
    /// 404 obligaría al frontend a modelar "sin configurar" como un estado de error distinto del que
    /// ocurre cuando algo falla de verdad — igual que la marca (F8).
    ///
    /// Lectura EN SESIÓN (`GetByStoreIdAsync`), no la pública: el filtro global por tenant del
    /// `ApplicationDbContext` es lo que confina esta lectura a la tienda del contexto. El showcase se
    /// configura en la vista de gestión, no desde el catálogo anónimo.
    /// </summary>
    public sealed record GetStoreCatalogImagesQuery : IQuery<StoreCatalogImagesDto>;

    public class GetStoreCatalogImagesQueryHandler
        : IQueryHandler<GetStoreCatalogImagesQuery, StoreCatalogImagesDto>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreCatalogImageRepository _imageRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetStoreCatalogImagesQueryHandler(
            IHttpContextService httpContextService,
            IStoreCatalogImageRepository imageRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _imageRepository = imageRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreCatalogImagesDto>> Handle(
            GetStoreCatalogImagesQuery query, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            // Los dos conjuntos de una sola lectura: quien publica y quien gestiona necesitan ambos, y
            // partirlo en dos métodos duplicaría el filtro por tienda y el bypass público.
            IList<StoreCatalogImage> images = await _imageRepository.GetByStoreIdAsync(storeId);

            return ResponseResult.Success(new StoreCatalogImagesDto
            {
                Carousel = images
                    .Where(image => image.Kind == StoreCatalogImageKind.Carousel)
                    .Select(Map)
                    .ToList(),
                Daily = images
                    .Where(image => image.Kind == StoreCatalogImageKind.Daily)
                    .Select(Map)
                    .ToList(),
            });
        }

        /// <summary>
        /// El orden lo pone el repositorio (por conjunto y luego por `OrderIndex`); aquí solo se proyecta.
        /// Que el handler no reordene es lo que garantiza que la vista y el catálogo público muestren el
        /// carrusel en el mismo orden.
        /// </summary>
        private static StoreCatalogImageDto Map(StoreCatalogImage image) => new()
        {
            Id = image.Id,
            Kind = image.Kind,
            Key = image.Key,
            OrderIndex = image.OrderIndex,
            Caption = image.Caption,
            IsActive = image.IsActive,
        };
    }
}