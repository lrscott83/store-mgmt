using Domain.Common.Entities;
using Domain.Entities.Owners;
using Domain.Entities.Users;

namespace Domain.Entities.SalesManagers
{
    /// <summary>
    /// Perfil de un gestor de ventas. Es OWNER-LEVEL: pertenece al Owner (coordinador), no a
    /// una tienda. El `User` asociado lleva el rol <c>RoleType.GestorVentas</c> y solo ve sus
    /// pedidos/comisiones y los catálogos de las tiendas de su Owner.
    ///
    /// Un User tiene como máximo un perfil de gestor (índice único en `UserId`).
    /// </summary>
    public sealed class SalesManager : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;

        public Guid OwnerId { get; set; }
        public Owner Owner { get; set; } = null!;

        public Guid TenantId { get; private set; }

        private SalesManager(Guid id, Guid userId, Guid ownerId, Guid tenantId) : base(id)
        {
            UserId = userId;
            OwnerId = ownerId;
            TenantId = tenantId;
        }

        public static SalesManager Create(Guid userId, Guid ownerId, Guid tenantId)
            => Create(Guid.NewGuid(), userId, ownerId, tenantId);

        public static SalesManager Create(Guid id, Guid userId, Guid ownerId, Guid tenantId)
        {
            if (id == Guid.Empty)
                throw new ArgumentException("El id del gestor es obligatorio.", nameof(id));
            if (userId == Guid.Empty)
                throw new ArgumentException("El usuario del gestor es obligatorio.", nameof(userId));
            if (ownerId == Guid.Empty)
                throw new ArgumentException("El Owner del gestor es obligatorio.", nameof(ownerId));
            if (tenantId == Guid.Empty)
                throw new ArgumentException("El tenant del gestor es obligatorio.", nameof(tenantId));

            return new SalesManager(id, userId, ownerId, tenantId);
        }
    }
}
