using Application.Abstractions.Messaging;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Entities.Orders;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Public.Queries.GetPublicOrderStatus
{
    /// <summary>
    /// Estado de UN pedido para quien lo pidió, sin cuenta y sin login (F3, T6). Es la vía de
    /// autoservicio: la persona consulta su código y ve por dónde va.
    ///
    /// Dos datos, y solo dos: el CÓDIGO (corto, aleatorio, único por tienda) y el TELÉFONO con el
    /// que pidió. El teléfono es un segundo factor débil —cualquiera que lo conozca lo pide— pero
    /// combinado con un código aleatorio de 6 caracteres es suficiente para que un anónimo no
    /// pueda recorrer los pedidos de una tienda probando códigos.
    ///
    /// 404 UNIFORME y deliberado: "código inexistente", "código de otra tienda" y "teléfono que no
    /// coincide" responden EXACTAMENTE igual que un slug inexistente. Distinguirlos convertiría el
    /// endpoint en un oráculo de qué códigos existen.
    ///
    /// OJO — filtro global por tenant: el pedido se lee con `GetPublicByCodeAsync`, la lectura
    /// PÚBLICA del repositorio, que salta ese filtro. Con la lectura de sesión (`GetByCodeAsync`)
    /// el anónimo no obtendría fila alguna y recibiría 404 para siempre, con el pedido created
    /// correctamente en la base.
    /// </summary>
    public sealed record GetPublicOrderStatusQuery(string StoreSlug, string Code, string Phone)
        : IQuery<PublicOrderStatusDto>;

    public class GetPublicOrderStatusQueryHandler
        : IQueryHandler<GetPublicOrderStatusQuery, PublicOrderStatusDto>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IOrderRepository _orderRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetPublicOrderStatusQueryHandler(
            IStoreRepository storeRepository,
            IOrderRepository orderRepository,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _orderRepository = orderRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<PublicOrderStatusDto>> Handle(
            GetPublicOrderStatusQuery query, CancellationToken cancellationToken)
        {
            Store? store = string.IsNullOrWhiteSpace(query.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(query.StoreSlug.Trim().ToLowerInvariant());

            if (store == null || store.CatalogSlug == null)
                throw new ApiException(_localizer["CatalogStoreNotFound"], HttpStatusCode.NotFound);

            // El código se guarda en MAYÚSCULAS (alfabeto dictable) pero lo dicta la persona, así
            // que llega como venga: sin normalizar, `ab12cd` no encontraría `AB12CD`.
            string code = (query.Code ?? string.Empty).Trim().ToUpperInvariant();

            Order? order = code.Length == 0
                ? null
                : await _orderRepository.GetPublicByCodeAsync(store.Id, code);

            // Un pedido que no existe y un teléfono que no coincide son el MISMO 404, con el mismo
            // mensaje. La persona real simplemente prueba otro par; un atacante que recorre
            // códigos no puede distinguir "no existe" de "existe pero no es mío".
            if (order == null || !PhoneMatches(order.CustomerPhone, query.Phone))
                throw new ApiException(_localizer["OnlineOrderStatusNotFound"], HttpStatusCode.NotFound);

            return ResponseResult.Success(new PublicOrderStatusDto
            {
                Code = order.Code!,
                Status = order.Status,
                PaymentStatus = order.PaymentStatus,
                DeliveryType = order.DeliveryType,
                Total = order.Total,
                Currency = order.Currency,
                // El snapshot tal como se guardó: si el catálogo cambia después, lo que ve quien
                // pidió es lo que pidió.
                Items =
                [
                    .. order.OrderItems
                        .OrderBy(item => item.OrderIndex)
                        .Select(item => new PublicOrderItemDto
                        {
                            Name = item.Name,
                            Quantity = item.Quantity,
                            Price = item.Price,
                        })
                ],
            });
        }

        /// <summary>
        /// El teléfono como segundo factor. Se comparan recortados y sin distinguir mayúsculas:
        /// quien lo escribió puede haber pegado un espacio al final o escriblo con otra capitalización
        /// (números de teléfono no llevan letras, así que la insensibilidad al caso no abre nada).
        /// Un teléfono vacío NUNCA coincide: sin teléfono no hay segunda prueba.
        /// </summary>
        private static bool PhoneMatches(string? orderPhone, string? requestPhone)
        {
            if (string.IsNullOrWhiteSpace(orderPhone) || string.IsNullOrWhiteSpace(requestPhone))
                return false;

            return string.Equals(orderPhone.Trim(), requestPhone.Trim(), StringComparison.OrdinalIgnoreCase);
        }
    }
}