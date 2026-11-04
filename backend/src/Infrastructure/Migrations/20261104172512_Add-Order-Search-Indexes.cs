using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <summary>
    /// Índices que sostienen las dos consultas del listado de pedidos: el ORDEN (`StoreId`, `Date`
    /// DESC) y la BÚSQUEDA (`LIKE '%term%'` sobre `Code`/`CustomerPhone`).
    ///
    /// El índice del orden lo genera EF desde la configuración de la entidad. Los dos de la búsqueda
    /// son SQL a mano porque EF no modela operadores de clase (`gin_trgm_ops`): un índice B-tree
    /// sobre `Code` no puede servir a un `LIKE '%…%'` con comodín a la izquierda, y sin `pg_trgm`
    /// el plan recorre la tabla entera de pedidos, que es la que más crece sin que nada la acote.
    ///
    /// `pg_trgm` NO se elimina en <see cref="Down"/>: es una extensión COMPARTIDA y otros objetos
    /// pueden depender de ella. Un rollback de esta migración deshace sus índices, no el motor.
    /// </summary>
    public partial class AddOrderSearchIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Order_StoreId_Date",
                table: "Order",
                columns: new[] { "StoreId", "Date" });

            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS pg_trgm;");

            migrationBuilder.Sql(
                "CREATE INDEX \"IX_Order_Code_Trgm\" ON \"Order\" USING gin (\"Code\" gin_trgm_ops);");

            migrationBuilder.Sql(
                "CREATE INDEX \"IX_Order_CustomerPhone_Trgm\" ON \"Order\" USING gin (\"CustomerPhone\" gin_trgm_ops);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Orden inverso al del `Up`: primero el último índice creado.
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Order_CustomerPhone_Trgm\";");
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Order_Code_Trgm\";");

            migrationBuilder.DropIndex(
                name: "IX_Order_StoreId_Date",
                table: "Order");
        }
    }
}
