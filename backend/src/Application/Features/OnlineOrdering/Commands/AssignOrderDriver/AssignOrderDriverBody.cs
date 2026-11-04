using System.Text.Json.Serialization;

namespace Application.Features.OnlineOrdering.Commands.AssignOrderDriver
{
    /// <summary>
    /// Cuerpo de `PATCH /api/v1/online-orders/{id}/driver`.
    ///
    /// Existe para distinguir "la propiedad NO vino" de "vino con null", que es justo lo que el
    /// comando no puede distinguir por sí solo: un <c>Guid?</c> vale <c>null</c> en los dos casos.
    /// Sin esa distinción, <c>{}</c> —el cuerpo de un cliente que olvidó el campo— desasignaba al
    /// repartidor y respondía 200, borrando una asignación que nadie pidió borrar.
    ///
    /// <see cref="JsonRequiredAttribute"/> convierte la AUSENCIA en un error de deserialización, así
    /// que ASP.NET responde 400 antes de llegar al handler; <c>{"driverId": null}</c> sí
    /// deserializa y sigue siendo la entrada VÁLIDA de desasignar. Por eso el comando conserva su
    /// forma <c>(Guid, Guid?)</c>: <c>null</c> es un valor legítimo de negocio, no un dato ausente,
    /// y el validador no puede rechazarlo.
    /// </summary>
    public sealed class AssignOrderDriverBody
    {
        /// <summary>
        /// Repartidor a asignar. <c>null</c> explícito desasigna; ausente es un 400.
        /// </summary>
        [JsonRequired]
        public Guid? DriverId { get; set; }
    }
}
