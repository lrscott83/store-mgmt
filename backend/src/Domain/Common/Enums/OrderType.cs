using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Domain.Common.Enums
{
    public enum OrderType : int
    {
        Normal = 1,
        Mayorista = 2,
        Merma = 3,
        Otro = 100,

        /// <summary>
        /// Pedido creado desde el catálogo web (pedidos-whatsapp-persistencia, F2, D17).
        ///
        /// El backend NO guarda ventas del POS (D14): `Normal`/`Mayorista` los sigue escribiendo el
        /// POS en su almacén local, así que el valor 101 marca en la fila que este pedido vino del
        /// catálogo online y no de una venta del POS.
        /// </summary>
        WhatsApp = 101
    }
}
