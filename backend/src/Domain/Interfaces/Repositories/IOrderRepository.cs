using Domain.Common.Repositories;
using Domain.Entities.Orders;

namespace Domain.Interfaces.Repositories
{
    /// <summary>
    /// Lecturas de los pedidos ONLINE (F2). La escritura es un alta nueva (el POS no escribe aquí,
    /// D14), así que este repositorio no añade comandos de actualización: los handlers de F5 llaman
    /// a `UpdateAsync` del genérico cuando cambian estado o pago.
    /// </summary>
    public interface IOrderRepository : IGenericRepository<Order, Guid>
    {
        /// <summary>
        /// ¿Existe ya ese código en ESTA tienda? Es la comprobación del generador de `Code`: el
        /// índice único `(StoreId, Code)` es la garantía de fondo, esta consulta es la de fondo
        /// limpio para poder REINTENTAR con otro código en vez de devolver 500 por colisión.
        /// </summary>
        Task<bool> CodeExistsAsync(Guid storeId, string code);

        /// <summary>Pedidos de la tienda, del más nuevo al más viejo (F5/F6).</summary>
        Task<IReadOnlyCollection<Order>> GetByStoreIdAsync(Guid storeId);

        /// <summary>
        /// Pedido por su código público DENTRO de la tienda, CON la sesión. null si ese código no
        /// existe en esa tienda.
        /// </summary>
        Task<Order?> GetByCodeAsync(Guid storeId, string code);

        /// <summary>
        /// Pedido por su código público para una LECTURA PÚBLICA (anónimo, sin sesión): salta el
        /// filtro global por tenant del <c>ApplicationDbContext</c>. null si ese código no existe en
        /// esa tienda.
        ///
        /// Existe separada de <see cref="GetByCodeAsync"/> y no la sustituye, por la misma razón
        /// que <c>StoreCatalogSettingsRepository.GetPublicByStoreIdAsync</c>: el filtro por tenant
        /// es lo que confina las lecturas AUTENTICADAS, y quitarle el bypass abriría esa puerta. Y
        /// una petición anónima NO tiene tenant en el contexto, así que la lectura de sesión
        /// devolvería VACÍA sin error ni aviso — el cliente perdería su pedido siempre.
        ///
        /// Seguro por construcción: no devuelve "cualquier pedido" sino el de UN <c>storeId</c>
        /// con UN código, y quien lo llama resolvió antes la tienda por un slug ÚNICO GLOBAL. El
        /// código además es corto y aleatorio, y el endpoint público exige además el teléfono.
        /// </summary>
        Task<Order?> GetPublicByCodeAsync(Guid storeId, string code);
    }
}