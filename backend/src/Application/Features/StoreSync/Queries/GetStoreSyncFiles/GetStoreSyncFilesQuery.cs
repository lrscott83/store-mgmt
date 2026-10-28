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
        private readonly IStoreRepository _storeRepository;

        public GetStoreSyncFilesQueryHandler(
            IHttpContextService httpContextService,
            IStoreSyncFileRepository fileRepository,
            IStoreRepository storeRepository)
        {
            _httpContextService = httpContextService;
            _fileRepository = fileRepository;
            _storeRepository = storeRepository;
        }

        public async Task<ResponseResult<IEnumerable<StoreSyncFileDto>>> Handle(
            GetStoreSyncFilesQuery query, CancellationToken cancellationToken)
        {
            // Mismo conjunto que usan las acciones (R3-3): lo que la lista muestra es exactamente
            // lo que el llamador puede descargar o borrar. Un llamador sin tiendas recibe una lista
            // vacía, no "todas".
            IReadOnlyCollection<Guid> storeIds = await StoreSyncStoreScope.ResolveStoreIdsAsync(
                _httpContextService, _storeRepository, cancellationToken);

            if (storeIds.Count == 0)
                return ResponseResult.Success<IEnumerable<StoreSyncFileDto>>([]);

            IReadOnlyList<StoreSyncFile> files =
                await _fileRepository.GetActiveOrderedByDateAsync(storeIds, cancellationToken);

            // Sin ficheros no se consulta la base por marcas: `IN ()` no es SQL válido y el
            // repositorio lo corta, pero ni siquiera hace falta llegar allí.
            if (files.Count == 0)
                return ResponseResult.Success<IEnumerable<StoreSyncFileDto>>([]);

            Guid userId = _httpContextService.UserExternalId.ToGuid();
            IReadOnlyList<StoreSyncFileDownload> downloads = await _fileRepository.GetDownloadsByUserAsync(
                userId, files.Select(file => file.Id).ToList(), cancellationToken);

            // Tolerante a duplicados a propósito: el índice único debería impedirlos, pero si alguna
            // fila histórica los tuviera, `ToDictionary` lanzaría y la lista respondería 500 para
            // siempre. Agrupar degrada a "una marca" en vez de tumbar la pantalla.
            Dictionary<Guid, StoreSyncFileDownload> marks = downloads
                .GroupBy(download => download.StoreSyncFileId)
                .ToDictionary(group => group.Key, group => group.First());

            return ResponseResult.Success<IEnumerable<StoreSyncFileDto>>(
                files.Select(file => StoreSyncFileMapper.Map(file, marks.GetValueOrDefault(file.Id))).ToList());
        }
    }
}
