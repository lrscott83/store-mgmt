using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Reescribe la máquina de estados del pedido online a los cinco estados actuales
    /// (`Creado=0`, `Preparado=1`, `Transportando=2`, `Entregado=3`, `Cancelado=10`) y añade la
    /// razón de cancelación.
    ///
    /// El enum pierde `Accepted`, `Preparing`, `Ready` y sus valores numéricos, así que los pedidos
    /// que estuvieran en cualquiera de esos estados se quedan sin un valor que signifique lo mismo.
    /// La decisión es ponerlos TODOS en `Creado` (decisión del usuario, 2026-10-20): un pedido en un
    /// estado que ya no existe no se puede interpretar, y adivinarlo sería peor que volver al
    /// principio de la secuencia, donde alguien lo mira y lo vuelve a mover.
    ///
    /// `Entregado` y `Cancelado` sí sobreviven como concepto, pero sus valores también cambian
    /// (`Delivered` era 4 y `Cancelled` era 5), así que también se reescriben. Por eso el `UPDATE`
    /// no filtra: no hay una sola fila cuyo número actual siga significando lo que significaba.
    /// </summary>
    public partial class ReescrituraEstadosPedidosOnline : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CancellationReason",
                table: "Order",
                type: "text",
                nullable: true);

            // Toda fila existente vuelve al principio de la secuencia. Ver el resumen de la clase:
            // ningún valor anterior sobrevive con el mismo significado.
            migrationBuilder.Sql(@"UPDATE ""Order"" SET ""Status"" = 0;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // El estado anterior de cada fila no se puede reconstruir: el `Up` lo descartó. Deshacer
            // la migración devuelve el esquema, no los datos.
            migrationBuilder.DropColumn(
                name: "CancellationReason",
                table: "Order");
        }
    }
}
