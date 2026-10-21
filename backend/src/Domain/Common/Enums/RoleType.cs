using System.ComponentModel;
using System.ComponentModel.DataAnnotations;

namespace Domain.Common.Enums
{
    public enum RoleType : int
    {
        [Display(Name = "Super Administrador", Description = "Este Role permitirá acceder a todas las funcionalidades en todos los tenants.")]
        SuperAdmin = 1,

        [Display(Name = "Administrador de tienda", Description = "Este Role permitirá acceder a todas las funcionalidades de la tienda.")]
        OwnerAdmin = 2,

        [Display(Name = "Usuario de tienda", Description = "Este Role permitirá acceder a las funcionalidades para un usuario de la tienda.")]
        StoreUser = 3,

        [Display(Name = "Comercializador del servicio", Description = "Este Role permitirá acceder a las funcionalidades para un usuario comercializador del servicio.")]
        ReSeller = 4,

        [Display(Name = "Gestor de ventas", Description = "Este Role permitirá acceder a sus pedidos, sus comisiones y al catálogo web de las tiendas de su Owner.")]
        GestorVentas = 5,
    }
}
