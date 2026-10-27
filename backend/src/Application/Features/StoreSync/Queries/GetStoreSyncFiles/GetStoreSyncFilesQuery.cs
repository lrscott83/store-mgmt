using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreSync;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.StoreSyncFiles;
using Domain.Interfaces.Repositories;

namespace Application.Features.StoreSync.Queries.GetStoreSyncFiles
{
    /// <summary>
    /// Lista los ficheros del repositorio, del más reciente al más antiguo (S3).
    ///
    /// El ÁMBITO (S5) se decide aquí, no en SQL: el filtro global por tenant ya confina la lectura
    /// a la instalación del llamador, y este handler añade el recorte por tienda cuando el
    /// llamador NO es Owner/ReSeller. Un Owner ve todas las tiendas de su tenant; un StoreUser, solo
    /// la suya.
    ///
    /// Las marcas de descarga se piden EN LOTE para todos los ficheros de la lista: una consulta
    /// por fila convertiría una pantalla con cien ficheros en cien viajes a la base.
    ///
    /// Una tienda sin ficheros devuelve una lista VACÍA, no un 404: el repositorio recién estrenado
    /// está vacío, y un 404 obligaría a la pantalla a tratar "sin subidas" como un error.
    /// </summary>
    public sealed record GetStoreSyncFilesQuery : IQuery<IEnumerable<StoreSyncFileDto>>;

    public class GetStoreSyncFilesQueryHandler
        : IQueryHandler<GetStoreSyncFilesQuery, IEnumerable<StoreSyncFileDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IStoreSyncFileRepository _fileRepository;

        public GetStoreSyncFilesQueryHandler(
            IHttpContextService httpContextService,
            IStoreSyncFileRepository fileRepository)
        {
            _httpContextService = httpContextService;
            _fileRepository = fileRepository;
        }

        public async Task<ResponseResult<IEnumerable<StoreSyncFileDto>>> Handle(
            GetStoreSyncFilesQuery query, CancellationToken cancellationToken)
        {
            Guid? storeFilter = StoreSyncStoreScope.StoreFilterFor(_httpContextService);

            IReadOnlyList<StoreSyncFile> files =
                await _fileRepository.GetActiveOrderedByDateAsync(storeFilter, cancellationToken);

            // Sin ficheros no se consulta la base por marcas: `IN ()` no es SQL válido y el
            // repositorio lo corta, pero ni siquiera hace falta llegar allí.
            if (files.Count == 0)
                return ResponseResult.Success<IEnumerable<StoreSyncFileDto>>([]);

            Guid userId = _httpContextService.UserExternalId.ToGuid();
            IReadOnlyList<StoreSyncFileDownload> downloads = await _fileRepository.GetDownloadsByUserAsync(
                userId, files.Select(file => file.Id).ToList(), cancellationToken);

            Dictionary<Guid, StoreSyncFileDownload> marks =
                downloads.ToDictionary(download => download.StoreSyncFileId);

            return ResponseResult.Success<IEnumerable<StoreSyncFileDto>>(
                files.Select(file => StoreSyncFileMapper.Map(file, marks.GetValueOrDefault(file.Id))).ToList());
        }
    }
}
