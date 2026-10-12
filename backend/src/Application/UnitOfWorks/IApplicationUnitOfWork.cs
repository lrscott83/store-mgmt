using Microsoft.EntityFrameworkCore.Storage;

namespace Application.UnitOfWorks
{
    public interface IApplicationUnitOfWork
    {
        Task<int> SaveChangesAsync(CancellationToken cancellationToken);

        /// <summary>
        /// Abre una transacción EXPLÍCITA sobre el <c>DbContext</c> de la petición.
        ///
        /// Existe para las contadas operaciones que necesitan que dos pasos sean atómicos de verdad
        /// —comprobar y luego escribir— y no solo "seguidos": sin transacción, dos peticiones
        /// concurrentes leen el mismo estado y escriben las dos. El llamador es responsable de
        /// <c>CommitAsync</c> cuando todo salió bien; si no lo hace, el <c>Dispose</c> revierte.
        ///
        /// Usa el MISMO <c>DbContext</c> que <see cref="SaveChangesAsync"/>, así que todo lo que se
        /// añada o modifique entre la apertura y el commit viaja dentro de la transacción sin
        /// pasar el contexto por parámetro.
        /// </summary>
        Task<IDbContextTransaction> BeginTransactionAsync(CancellationToken cancellationToken);
    }
}
