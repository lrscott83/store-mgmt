using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Domain.Common.Enums
{
    /// <summary>
    /// currency-in-costs-and-prices (plan 2026-09-16): moneda de los precios y costos
    /// del negocio de la tienda (Order, OrderItem, Product, InventoryEntry,
    /// InventoryEntryCost). Espejo por VALOR del enum TS `Currency` del frontend —
    /// la serialización es el número, este orden queda CONGELADO desde el día 1.
    /// Default de toda entidad: CUP (ausente del campo = CUP).
    /// No aplica a los precios del cobro por el uso del sistema (plans/billing).
    /// </summary>
    public enum Currency : int
    {
        CUP = 0,
        USD = 1,
        EUR = 2,
        CLA = 3,
        MLC = 4,
        CAD = 5,
        MXN = 6
    }
}
