using Domain.Common.Enums;

namespace Domain.Common.Catalog
{
    /// <summary>
    /// Precio mayorista del catálogo web: la ÚNICA implementación de la regla de escalones.
    ///
    /// Es la misma regla que aplica la venta mayorista del POS (`sales/lib/wholesale.ts`:
    /// `resolveWholesalePrice`, `wholesaleUnits`, `getWholesaleMinPacks`), y vive aquí para que el
    /// catálogo público, el alta del pedido y cualquier reporte resuelvan el MISMO precio para el
    /// mismo número de paquetes. Dos fórmulas del mismo dinero divergen en cuanto una cambia.
    ///
    /// La regla, en las palabras del POS:
    ///   - un escalón aplica si `MinPacks &lt;= packs`;
    ///   - entre los que aplican gana el de `MinPacks` MÁS ALTO;
    ///   - el precio del escalón es POR UNIDAD dentro del paquete;
    ///   - el total de la línea es `packs × PackSize × UnitPrice`, a 2 decimales.
    /// </summary>
    public static class WholesalePricing
    {
        /// <summary>
        /// Config mayorista VÁLIDA: activada, con paquete de tamaño positivo y al menos un escalón.
        /// Sin esto el producto no se publica en modo mayorista y el precio es el minorista.
        /// </summary>
        public static bool HasConfig(bool wholesaleEnabled, int packSize, int tiersCount)
            => wholesaleEnabled && packSize > 0 && tiersCount > 0;

        /// <summary>
        /// Precio por unidad del escalón aplicable a <paramref name="packs"/> paquetes, o
        /// <c>null</c> si ningún escalón aplica (por debajo del primer rango).
        ///
        /// Devolver <c>null</c> —y no el precio minorista— es deliberado: el POS no vende por
        /// debajo del mínimo (el − saca la línea del carrito), así que un pedido por debajo del
        /// primer rango es un estado inválido, no una venta al detal.
        /// </summary>
        public static decimal? ResolveUnitPrice(IEnumerable<WholesaleTierPrice> tiers, int packs)
        {
            if (packs <= 0 || tiers is null) return null;

            decimal? unitPrice = null;
            int bestMinPacks = int.MinValue;
            foreach (WholesaleTierPrice tier in tiers)
            {
                if (tier.MinPacks > packs || tier.MinPacks < bestMinPacks) continue;
                bestMinPacks = tier.MinPacks;
                unitPrice = tier.PricePerUnit;
            }

            return unitPrice;
        }

        /// <summary>Unidades reales de una compra en paquetes.</summary>
        public static int Units(int packs, int packSize) => packs * packSize;

        /// <summary>Total de la línea: <c>packs × PackSize × UnitPrice</c>, a 2 decimales.</summary>
        public static decimal LineTotal(int packs, int packSize, decimal unitPrice)
            => decimal.Round(Units(packs, packSize) * unitPrice, 2, MidpointRounding.AwayFromZero);

        /// <summary>Menor <c>MinPacks</c> de la config: la cantidad vendible más pequeña. 0 sin escalones.</summary>
        public static int MinPacks(IEnumerable<WholesaleTierPrice> tiers)
        {
            int min = int.MaxValue;
            bool any = false;
            foreach (WholesaleTierPrice tier in tiers)
            {
                any = true;
                if (tier.MinPacks < min) min = tier.MinPacks;
            }
            return any ? min : 0;
        }
    }

    /// <summary>Un escalón reducido a lo que la regla de precio necesita.</summary>
    public readonly record struct WholesaleTierPrice(int MinPacks, decimal PricePerUnit, Currency Currency);
}
