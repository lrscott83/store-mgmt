using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Entities.Orders;
using Domain.Entities.Products;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Commands.CreateOnlineOrder
{
    /// <summary>
    /// Crea un pedido ONLINE desde el catálogo (F2, T7). Es el ÚNICO camino del backend que
    /// escribe en `Order`: antes de este comando no existía ninguno — el POS escribe sus ventas en
    /// su almacén local y nunca en el servidor (D14).
    ///
    /// El comando es deliberadamente ESCUETO: lleva QUIÉN pide, CÓMO se entrega y QUÉ productos
    /// (id + cantidad). NO lleva total, ni moneda, ni precio. Todo eso se lee del catálogo aquí, en
    /// servidor, y por eso el cliente no puede comprar a 1 CUP ni en la moneda que quiera.
    ///
    /// F3 lo hace PÚBLICO: lo llama el storefront sin sesión, así que la tienda se resuelve por
    /// <see cref="StoreSlug"/> (único global) y NO por el contexto. De ahí que este handler no
    /// dependa de `IHttpContextService`: el anónimo no tiene tienda ni tenant en el contexto, así
    /// que pedirlo ahí devolvería `Guid.Empty` y un pedido sin tenant.
    /// </summary>
    public sealed class CreateOnlineOrderCommand : ICommand<OnlineOrderCreatedDto>
    {
        // Límites de formato del pedido. Viven AQUÍ y no en `Domain/Common/Limits` porque son
        // longitudes de la ENTRADA de esta feature, no invariantes de una entidad de dominio.

        /// <summary>Slug de catálogo de la tienda. Viene de la ruta, no del cuerpo.</summary>
        public const int StoreSlugMaxLength = 63;

        /// <summary>Nombre de quien pide.</summary>
        public const int CustomerNameMaxLength = 200;

        /// <summary>Teléfono con prefijo internacional.</summary>
        public const int CustomerPhoneMaxLength = 32;

        /// <summary>Dirección de entrega (solo modality domicilio).</summary>
        public const int DeliveryAddressMaxLength = 512;

        /// <summary>Notas del pedido (D16: texto simple).</summary>
        public const int NotesMaxLength = 512;

        /// <summary>
        /// Slug de catálogo de la tienda (`Store.CatalogSlug`), lo fija el CONTROLADOR desde la
        /// ruta `/public/ordering/{storeSlug}/orders`. No está en el cuerpo del request porque el
        /// cuerpo es lo que el cliente controla y la tienda decide el catálogo: aceptar el slug del
        /// body dejaría que un pedido se guardara en otra tienda sin querer.
        /// </summary>
        public string StoreSlug { get; set; } = string.Empty;

        /// <summary>Modalidad por VALOR de `OrderDeliveryType` (Pickup / Delivery).</summary>
        public int DeliveryType { get; set; } = (int)OrderDeliveryType.Pickup;

        public string CustomerName { get; set; } = string.Empty;

        public string CustomerPhone { get; set; } = string.Empty;

        /// <summary>Obligatorio solo con <see cref="OrderDeliveryType.Delivery"/>.</summary>
        public string? DeliveryAddress { get; set; }

        /// <summary>Notas del pedido (D16: texto simple, sin estructura).</summary>
        public string? Notes { get; set; }

        /// <summary>Las líneas del carrito. El precio de cada una lo pone el catálogo.</summary>
        public List<CreateOnlineOrderLineRequest> Items { get; set; } = [];
    }

    /// <summary>Una línea del carrito: QUÉ producto y CUÁNTO. Nunca a qué precio.</summary>
    public sealed class CreateOnlineOrderLineRequest
    {
        public Guid ProductId { get; set; }
        public int Quantity { get; set; }
    }

    /// <summary>
    /// Lo que devuelve el alta: el código con el que la persona consulta y escribe por WhatsApp.
    ///
    /// `WhatsappNumber` viaja AQUÍ y no en el config público (decisión T2): el config lo lee
    /// cualquiera que abra el catálogo, así que publicarlo ahí haría el número rastreable con una
    /// simple petición; esta respuesta solo la recibe quien acaba de dejar sus datos de contacto
    /// para ese pedido. Viene TAL CUAL lo guardó la tienda —normalizarlo a solo dígitos es tarea
    /// del cliente que arma el enlace `wa.me`— y es `null` cuando la tienda no lo tiene
    /// configurado, que es lo que permite BLOQUEAR el envío en vez de abrir un chat vacío.
    /// </summary>
    public sealed record OnlineOrderCreatedDto(Guid Id, string Code, decimal Total, Currency Currency, string? WhatsappNumber);

    public class CreateOnlineOrderCommandHandler
        : ICommandHandler<CreateOnlineOrderCommand, OnlineOrderCreatedDto>
    {
        /// <summary>
        /// Alfabeto del código SIN vocales ni caracteres que se confunden al dictarlo por WhatsApp
        /// (0/O, 1/I). El código se LEE de viva voz: "AB12CD" se dicta; "ABOIZCD" no.
        /// </summary>
        private const string CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        private const int CodeLength = 6;

        /// <summary>
        /// Intentos para encontrar un código libre. El índice único `(StoreId, Code)` es la garantía
        /// de fondo; esto es solo para que una colisión casi imposible se resuelva reintentando en
        /// lugar de devolviendo un 500 al cliente.
        /// </summary>
        private const int MaxCodeAttempts = 8;

        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IStoreRepository _storeRepository;
        private readonly IProductRepository _productRepository;
        private readonly IOrderRepository _orderRepository;
        private readonly IStoreCatalogSettingsRepository _storeCatalogSettingsRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public CreateOnlineOrderCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IStoreRepository storeRepository,
            IProductRepository productRepository,
            IOrderRepository orderRepository,
            IStoreCatalogSettingsRepository storeCatalogSettingsRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _storeRepository = storeRepository;
            _productRepository = productRepository;
            _orderRepository = orderRepository;
            _storeCatalogSettingsRepository = storeCatalogSettingsRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<OnlineOrderCreatedDto>> Handle(CreateOnlineOrderCommand request,
            CancellationToken cancellationToken)
        {
            // El anónimo no tiene tienda en el contexto: se resuelve por slug, que es ÚNICO GLOBAL
            // y es lo único que acota la petición. Mismo 404 uniforme que el catálogo público: un
            // slug que no existe y una tienda sin catálogo publicado responden igual, para que el
            // anónimo no pueda usar el endpoint para averiguar qué tiendas existen.
            Store? store = string.IsNullOrWhiteSpace(request.StoreSlug)
                ? null
                : await _storeRepository.GetStoreByCatalogSlugAsync(request.StoreSlug.Trim().ToLowerInvariant());

            if (store == null || store.CatalogSlug == null)
                throw new ApiException(_localizer["CatalogStoreNotFound"], HttpStatusCode.NotFound);

            // El tenant sale de la TIENDA RESUELTA, no de la sesión: sin él el pedido quedaría sin
            // tenant y el filtro global no lo protegería de ninguna lectura posterior.
            Guid storeId = store.Id;
            Guid tenantId = store.TenantId;

            StoreCatalogSettings settings = await LoadEnabledSettingsAsync(storeId);
            OrderDeliveryType deliveryType = ResolveDeliveryType(request.DeliveryType, settings);
            ValidateDeliveryAddress(deliveryType, request.DeliveryAddress);

            IReadOnlyCollection<CreateOnlineOrderLineRequest> requestedLines = ValidateLines(request.Items);

            // --- El total y la moneda se LEEN del catálogo. Una sola consulta con todos los ids ---
            var requestedIds = requestedLines.Select(line => line.ProductId).Distinct().ToList();
            IList<Product> published = await _productRepository.GetPublishedByIdsAsync(storeId, requestedIds);

            Dictionary<Guid, Product> publishedById = published.ToDictionary(product => product.Id);
            var resolvedLines = new List<OrderLine>(requestedLines.Count);
            foreach (CreateOnlineOrderLineRequest line in requestedLines)
            {
                // Un producto que el catálogo ya no publica (desactivado, no en venta, categoría
                // sin slug) NO entra: aceptarlo guardaría un precio que ya no existe.
                if (!publishedById.TryGetValue(line.ProductId, out Product? product))
                    throw new ApiException(_localizer["OnlineOrderProductNotAvailable", line.ProductId], HttpStatusCode.BadRequest);

                resolvedLines.Add(new OrderLine(
                    product.Id,
                    product.Name,
                    line.Quantity,
                    // `FinalPrice` es el precio que el catálogo MUESTRA (con % y monto rebajado
                    // combinados, ver CatalogPricing): si el servidor calculara con `Price` crudo,
                    // el total persistido no coincidiría con el que la persona vio.
                    product.FinalPrice,
                    product.Currency));
            }

            EnsureSingleCurrency(resolvedLines);
            Currency currency = resolvedLines[0].Currency;

            decimal subtotal = resolvedLines.Sum(line => line.Price * line.Quantity);
            decimal deliveryFee = deliveryType == OrderDeliveryType.Delivery ? settings.DeliveryFee : 0m;
            decimal total = subtotal + deliveryFee;

            // El mínimo se mide sobre el total YA recalculado, con el envío dentro: si se midiera
            // solo sobre los productos, un pedido de 100 con 100 de envío sería rechazado aunque
            // llegue al mínimo de 150.
            if (total < settings.MinimumOrderAmount)
                throw new ApiException(
                    _localizer["OnlineOrderBelowMinimumAmount", total, settings.MinimumOrderAmount],
                    HttpStatusCode.BadRequest);

            string code = await GenerateUniqueCodeAsync(storeId);

            Order order = Order.CreateOnline(
                storeId,
                tenantId,
                code,
                deliveryType,
                request.CustomerName,
                request.CustomerPhone,
                total,
                currency,
                resolvedLines,
                // `Order.Description` es la vía del POS ("detalles de la venta"); el pedido online
                // tiene su propio campo `Notes`, así que aquí `Description` queda vacío en vez de
                // duplicar la nota en las dos columnas.
                description: null,
                // La dirección SOLO existe para domicilio: en recogida no se persiste ni la que
                // venga en el payload. La persona va a la tienda, así que guardar su dirección sería
                // guardar un dato que además puede ser de OTRA persona (el carrito es del cliente
                // anónimo, no del POS).
                deliveryAddress: deliveryType == OrderDeliveryType.Delivery ? request.DeliveryAddress : null,
                notes: request.Notes);

            // Alta nueva: `.AddAsync` marca la entidad como Added. `ApplicationDbContext` es
            // NoTracking, así que una entidad creada y mutada sin añadir NO se escribiría — sin
            // error y sin aviso. Por eso el alta es explícita.
            await _orderRepository.AddAsync(order);

            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(new OnlineOrderCreatedDto(
                order.Id,
                order.Code!,
                order.Total,
                order.Currency,
                // El número sale de la MISMA lectura de configuración que ya fijó el envío y el
                // mínimo: una consulta menos y ninguna posibilidad de que el enlace se arme con
                // un número de una versión distinta de la que el resto del pedido usó.
                settings.WhatsappNumber));
        }

        /// <summary>
        /// La tienda tiene que haber abierto los pedidos. `StoreCatalogSettings` nace DESACTIVADA
        /// (D7/F1) y publicar el catálogo NO publica los pedidos: son dos interruptores distintos
        /// y esta es la puerta del segundo.
        ///
        /// Lectura PÚBLICA (`GetPublicByStoreIdAsync`), no la de sesión: `StoreCatalogSettings` tiene
        /// filtro global por tenant y una petición ANÓNIMA no tiene tenant en el contexto, así que
        /// `GetByStoreIdAsync` devolvería VACÍA y todo pedido sería rechazado como "pedidos no
        /// habilitados" — sin error y sin aviso. Lo que acota el resultado es el `storeId`, que el
        /// slug ya resolvió y es único global.
        /// </summary>
        private async Task<StoreCatalogSettings> LoadEnabledSettingsAsync(Guid storeId)
        {
            StoreCatalogSettings? settings = await _storeCatalogSettingsRepository.GetPublicByStoreIdAsync(storeId);
            if (settings is null || !settings.Enabled)
                throw new ApiException(_localizer["OnlineOrdersNotEnabled", storeId], HttpStatusCode.BadRequest);

            return settings;
        }

        /// <summary>
        /// La modalidad la DECIDE la tienda (`PickupEnabled` / `DeliveryEnabled`), no el cliente: un
        /// valor fuera del enum o una modalidad cerrada se rechazan antes de tocar nada.
        /// </summary>
        private OrderDeliveryType ResolveDeliveryType(int deliveryTypeValue, StoreCatalogSettings settings)
        {
            if (!Enum.IsDefined(typeof(OrderDeliveryType), deliveryTypeValue))
                throw new ApiException(_localizer["OnlineOrderDeliveryTypeInvalid", deliveryTypeValue], HttpStatusCode.BadRequest);

            var deliveryType = (OrderDeliveryType)deliveryTypeValue;

            if (deliveryType == OrderDeliveryType.Delivery && !settings.DeliveryEnabled)
                throw new ApiException(_localizer["OnlineOrderDeliveryNotAllowed", nameof(settings.DeliveryEnabled)], HttpStatusCode.BadRequest);

            if (deliveryType == OrderDeliveryType.Pickup && !settings.PickupEnabled)
                throw new ApiException(_localizer["OnlineOrderPickupNotAllowed", nameof(settings.PickupEnabled)], HttpStatusCode.BadRequest);

            return deliveryType;
        }

        /// <summary>A domicilio sin dirección no hay a quién entregar.</summary>
        private void ValidateDeliveryAddress(OrderDeliveryType deliveryType, string? deliveryAddress)
        {
            if (deliveryType != OrderDeliveryType.Delivery || !string.IsNullOrWhiteSpace(deliveryAddress))
                return;

            throw new ApiException(_localizer["OnlineOrderDeliveryAddressRequired", nameof(CreateOnlineOrderCommand.DeliveryAddress)], HttpStatusCode.BadRequest);
        }

        /// <summary>Un carrito vacío no es un pedido, y una cantidad no positiva no es una línea.</summary>
        private IReadOnlyCollection<CreateOnlineOrderLineRequest> ValidateLines(List<CreateOnlineOrderLineRequest> items)
        {
            if (items is null || items.Count == 0)
                throw new ApiException(_localizer["OnlineOrderEmptyCart", nameof(CreateOnlineOrderCommand.Items)], HttpStatusCode.BadRequest);

            foreach (CreateOnlineOrderLineRequest line in items)
            {
                if (line.ProductId == Guid.Empty)
                    throw new ApiException(_localizer["IsRequired", nameof(CreateOnlineOrderLineRequest.ProductId)], HttpStatusCode.BadRequest);

                if (line.Quantity <= 0)
                    throw new ApiException(_localizer["OnlineOrderQuantityInvalid", line.Quantity], HttpStatusCode.BadRequest);
            }

            return items;
        }

        /// <summary>
        /// `Order.Currency` es UNA moneda para todo el pedido (y A3 eliminó la moneda configurable
        /// de la tienda). Un carrito con productos de dos monedas no se puede guardar: se rechaza
        /// en vez de elegir una y perder el resto del importe.
        /// </summary>
        private void EnsureSingleCurrency(IReadOnlyList<OrderLine> lines)
        {
            Currency currency = lines[0].Currency;
            if (lines.Any(line => line.Currency != currency))
                throw new ApiException(_localizer["OnlineOrderMixedCurrencies", currency], HttpStatusCode.BadRequest);
        }

        /// <summary>
        /// Código corto y único POR TIENDA. La consulta previa no es la garantía —lo es el índice
        /// único `(StoreId, Code)`— sino lo que permite reintentar sin fallar.
        /// </summary>
        private async Task<string> GenerateUniqueCodeAsync(Guid storeId)
        {
            for (int attempt = 0; attempt < MaxCodeAttempts; attempt++)
            {
                string code = GenerateCode();
                if (!await _orderRepository.CodeExistsAsync(storeId, code))
                    return code;
            }

            throw new ApiException(_localizer["OnlineOrderCodeGenerationFailed", storeId], HttpStatusCode.InternalServerError);
        }

        /// <summary>Código aleatorio del alfabito "dictable" de longitud <see cref="CodeLength"/>.</summary>
        private static string GenerateCode()
            => string.Create(CodeLength, CodeAlphabet,
                static (span, alphabet) =>
                {
                    for (int i = 0; i < span.Length; i++)
                        span[i] = alphabet[Random.Shared.Next(alphabet.Length)];
                });
    }
}