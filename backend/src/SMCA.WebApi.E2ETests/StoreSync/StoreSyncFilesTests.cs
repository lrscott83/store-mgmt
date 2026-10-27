using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Application.Abstractions.Authentication;
using Domain.Common.Constants;
using Domain.Common.Enums;
using Domain.Common.Limits;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.StoreRoleFeatures;
using Domain.Entities.Stores;
using Domain.Entities.StoreSyncFiles;
using Domain.Entities.StoreUsers;
using Domain.Entities.Tenants;
using Domain.Entities.UserRoles;
using Domain.Entities.Users;
using FluentAssertions;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SMCA.WebApi.E2ETests.Infrastructure;
using Xunit;

namespace SMCA.WebApi.E2ETests.StoreSync;

/// <summary>
/// Repositorio de ficheros de sincronización del POS (S1, S3, S4, S5, S6, S8, S9, S10, S13) contra
/// el servidor real y PostgreSQL real:
///
///   * el Owner sube UN ZIP por tienda y la lista dice de qué tienda es, cuándo se subió, quién lo
///     subió (nombre completo congelado) y cuántas descargas lleva;
///   * la descarga devuelve los MISMOS bytes, deja una marca por usuario y sube el contador en cada
///     bajada — la marca informa, no bloquea;
///   * el StoreUser solo ve y toca la tienda de su claim: el fichero de otra tienda responde 404,
///     igual que uno inexistente;
///   * 0 bytes es 400 y más de 50 MB es 413, sin dejar fila ni blob;
///   * el gate es por feature: Send para subir, Receive para descargar, cualquiera para listar;
///   * borrar da de baja la fila y borra el blob.
/// </summary>
[Collection("e2e")]
public sealed class StoreSyncFilesTests
{
    private const int SynchronizationModuleId = (int)ModuleType.Synchronization;
    private const int SendFeatureId = (int)FeatureType.Send;
    private const int ReceiveFeatureId = (int)FeatureType.Receive;
    private const string Password = "Password123";

    private readonly AppTestFactory _f;

    public StoreSyncFilesTests(WebAppFixture fixture) => _f = fixture.Factory;

    #region Contract shapes

    /// <summary>
    /// Forma del DTO en el cable, definida AQUÍ y no reutilizando la clase de Application: así el
    /// E2E fija el contrato JSON que consume el POS, no solo la clase que hoy lo produce.
    /// </summary>
    private sealed class SyncFileDto
    {
        public Guid Id { get; set; }
        public Guid StoreId { get; set; }
        public string StoreName { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public long SizeBytes { get; set; }
        public Guid UploadedByUserId { get; set; }
        public string UploadedByFullName { get; set; } = string.Empty;
        public DateTimeOffset CreatedAt { get; set; }
        public int DownloadCount { get; set; }
        public bool DownloadedByMe { get; set; }
        public DateTimeOffset? DownloadedByMeAt { get; set; }
    }

    private sealed class SyncFixture
    {
        public Guid TenantId { get; init; }
        public Guid OwnerUserId { get; init; }
        public string OwnerLogin { get; init; } = string.Empty;
        public Guid OwnerId { get; init; }
        public Guid StoreAId { get; init; }
        public string StoreAName { get; init; } = string.Empty;
        public Guid StoreBId { get; init; }
        public string StoreBName { get; init; } = string.Empty;
        public List<Guid> UserIds { get; } = new();
    }

    #endregion

    #region Seed / cleanup

    /// <summary>
    /// Owner con una o dos tiendas y el módulo de Sincronización contratado en cada una. El nombre
    /// de la tienda lleva un guid para que las aserciones no dependan de lo que haya en la base.
    /// </summary>
    private async Task<SyncFixture> SeedOwnerAsync(bool withSecondStore, Guid? tenantId = null)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Guid tenant = tenantId ?? DataUtils.DefaultTenant.Id;

        string login = $"sync-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword(Password), "E2E Sync Owner", "0000000000", login, tenant);
        user.OfflinePasswordPreHash = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>()
            .Protect(Password, user.Id);
        db.Set<User>().Add(user);
        var owner = Owner.Create(user.Id, false, tenant, "E2E Sync owner");
        db.Set<Owner>().Add(owner);
        await db.SaveChangesAsync();

        string storeAName = $"Sync-A-{Guid.NewGuid():N}";
        Store storeA = await CreateStoreAsync(db, owner.Id, tenant, storeAName);

        Store? storeB = withSecondStore
            ? await CreateStoreAsync(db, owner.Id, tenant, $"Sync-B-{Guid.NewGuid():N}")
            : null;

        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.OwnerAdmin, tenant));
        user.SelectedStoreId = storeA.Id;
        await db.SaveChangesAsync();

        var fixture = new SyncFixture
        {
            TenantId = tenant,
            OwnerUserId = user.Id,
            OwnerLogin = login,
            OwnerId = owner.Id,
            StoreAId = storeA.Id,
            StoreAName = storeAName,
            StoreBId = storeB?.Id ?? Guid.Empty,
            StoreBName = storeB?.Name ?? string.Empty,
        };
        fixture.UserIds.Add(user.Id);
        return fixture;
    }

    private static async Task<Store> CreateStoreAsync(ApplicationDbContext db, Guid ownerId, Guid tenantId, string name)
    {
        var store = Store.Create(name, ownerId, true, tenantId, DateOnly.FromDateTime(DateTime.UtcNow),
            storePlanId: (int)StorePlanType.Superior);
        db.Set<Store>().Add(store);
        await db.SaveChangesAsync();

        db.Set<StoreModule>().Add(StoreModule.Create(
            store.Id, SynchronizationModuleId, 0, true, 0, 0, 0, tenantId));
        await db.SaveChangesAsync();
        return store;
    }

    /// <summary>
    /// StoreUser de UNA tienda con las features indicadas. El gate real de S9 consulta las filas de
    /// <c>StoreRoleFeature</c>, así que se siembran las que el test necesita y ninguna más.
    /// </summary>
    private async Task<(Guid UserId, string Login)> AddStoreUserAsync(
        SyncFixture fixture, Guid storeId, params int[] featureIds)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        string login = $"sync-su-{Guid.NewGuid():N}@test.com";
        var user = User.Create(login, DbTestHelpers.HashPassword(Password), "E2E Sync StoreUser",
            "0000000000", login, fixture.TenantId);
        user.OfflinePasswordPreHash = scope.ServiceProvider.GetRequiredService<IOfflinePreHashProtector>()
            .Protect(Password, user.Id);
        db.Set<User>().Add(user);
        db.Set<UserRole>().Add(UserRole.Create(user.Id, (int)RoleType.StoreUser, fixture.TenantId));
        db.Set<StoreUser>().Add(StoreUser.Create(user.Id, storeId, fixture.TenantId));
        foreach (int featureId in featureIds)
            db.Set<StoreRoleFeature>().Add(StoreRoleFeature.Create(storeId, (int)RoleType.StoreUser, featureId, fixture.TenantId));

        user.SelectedStoreId = storeId;
        await db.SaveChangesAsync();

        fixture.UserIds.Add(user.Id);
        return (user.Id, login);
    }

    /// <summary>
    /// Limpia todo lo que el test pudo dejar: marcas, filas, blobs, el grafo de las tiendas, el owner
    /// y los usuarios. Se ejecuta en <c>finally</c> incluso si una aserción falla, porque las FKs del
    /// modelo son Restrict y una fila suelta bloquearía el borrado de la tienda en la siguiente corrida.
    /// </summary>
    private async Task CleanupAsync(SyncFixture fixture)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        Guid[] storeIds = fixture.StoreBId == Guid.Empty
            ? [fixture.StoreAId]
            : [fixture.StoreAId, fixture.StoreBId];

        var files = await db.Set<StoreSyncFile>().IgnoreQueryFilters()
            .Where(file => storeIds.Contains(file.StoreId))
            .Select(file => new { file.Id, file.StorageKey })
            .ToListAsync();

        if (files.Count > 0)
        {
            Guid[] fileIds = files.Select(file => file.Id).ToArray();
            await db.Set<StoreSyncFileDownload>().IgnoreQueryFilters()
                .Where(download => fileIds.Contains(download.StoreSyncFileId))
                .ExecuteDeleteAsync();
            await db.Set<StoreSyncFile>().IgnoreQueryFilters()
                .Where(file => fileIds.Contains(file.Id))
                .ExecuteDeleteAsync();
        }

        foreach (var file in files)
            DeleteBlob(file.StorageKey);

        await db.Set<StoreRoleFeature>().IgnoreQueryFilters()
            .Where(feature => storeIds.Contains(feature.StoreId)).ExecuteDeleteAsync();
        await db.Set<StoreUser>().IgnoreQueryFilters()
            .Where(storeUser => storeIds.Contains(storeUser.StoreId)).ExecuteDeleteAsync();
        await db.Set<StoreModule>().IgnoreQueryFilters()
            .Where(module => storeIds.Contains(module.StoreId)).ExecuteDeleteAsync();
        await db.Set<Store>().IgnoreQueryFilters()
            .Where(store => storeIds.Contains(store.Id)).ExecuteDeleteAsync();
        await db.Set<Owner>().IgnoreQueryFilters()
            .Where(owner => owner.Id == fixture.OwnerId).ExecuteDeleteAsync();

        foreach (Guid userId in fixture.UserIds)
        {
            await db.Set<UserRole>().IgnoreQueryFilters()
                .Where(role => role.UserId == userId).ExecuteDeleteAsync();
            await db.Set<User>().IgnoreQueryFilters()
                .Where(user => user.Id == userId).ExecuteDeleteAsync();
        }
    }

    /// <summary>El almacenamiento resuelve la raíz contra el directorio de trabajo del proceso de test.</summary>
    private static void DeleteBlob(string storageKey)
    {
        string path = Path.Combine(
            Directory.GetCurrentDirectory(),
            "storage",
            "sync",
            storageKey.Replace('/', Path.DirectorySeparatorChar));

        if (File.Exists(path))
            File.Delete(path);
    }

    #endregion

    #region Helpers

    private HttpClient ClientFor(Guid userId, string login) => DbTestHelpers.AuthedClient(_f, userId, login);

    private static byte[] BackupBytes(string seed)
        => System.Text.Encoding.UTF8.GetBytes($"PK\u0003\u0004{seed}-{Guid.NewGuid():N}");

    /// <summary>Multipart como lo manda el POS: la tienda como campo y el ZIP como archivo.</summary>
    private static MultipartFormDataContent BuildUpload(Guid storeId, byte[] bytes,
        string fileName = "respaldo.zip", string contentType = "application/zip")
    {
        var form = new MultipartFormDataContent();
        form.Add(new StringContent(storeId.ToString()), "storeId");

        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", fileName);
        return form;
    }

    private static async Task<SyncFileDto> UploadAsync(HttpClient client, Guid storeId, byte[] bytes,
        string fileName = "respaldo.zip")
    {
        using var form = BuildUpload(storeId, bytes, fileName);
        var response = await client.PostAsync("/api/v1/sync/files", form);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ApiResponse<SyncFileDto>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    private static async Task<List<SyncFileDto>> ListAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/v1/sync/files");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<ApiResponse<List<SyncFileDto>>>(ApiResponse.Json);
        body!.Succeeded.Should().BeTrue();
        return body.Data!;
    }

    private async Task<T> QueryAsync<T>(Func<ApplicationDbContext, Task<T>> query)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await query(db);
    }

    #endregion

    #region Round trip (S1, S3, S4, S7, S8, S13)

    /// <summary>
    /// El recorrido completo: subida → lista → descarga → segunda descarga → borrado.
    ///
    /// Fija las cuatro reglas que el POS necesita de verdad: la lista dice tienda/usuario/fecha/
    /// descargas, la descarga devuelve los BYTES EXACTOS, la marca es una sola por usuario pero el
    /// contador cuenta cada bajada, y el borrado quita la fila del listado y el blob del disco.
    /// </summary>
    [Fact]
    public async Task Owner_round_trip_lists_downloads_twice_and_deletes()
    {
        var fixture = await SeedOwnerAsync(withSecondStore: false);
        try
        {
            var client = ClientFor(fixture.OwnerUserId, fixture.OwnerLogin);
            byte[] oldest = BackupBytes("centro");
            byte[] newest = BackupBytes("centro-2");

            var first = await UploadAsync(client, fixture.StoreAId, oldest, "respaldo-centro.zip");
            await Task.Delay(20);
            var second = await UploadAsync(client, fixture.StoreAId, newest, "respaldo-centro-2.zip");

            // S3: del más reciente al más antiguo, con la tienda y el nombre completo CONGELADOS.
            var listed = await ListAsync(client);
            listed.Select(file => file.Id).Should().Equal(second.Id, first.Id);

            var listedFirst = listed.Single(file => file.Id == first.Id);
            listedFirst.StoreId.Should().Be(fixture.StoreAId);
            listedFirst.StoreName.Should().Be(fixture.StoreAName);
            listedFirst.FileName.Should().Be("respaldo-centro.zip");
            listedFirst.SizeBytes.Should().Be(oldest.Length);
            listedFirst.UploadedByUserId.Should().Be(fixture.OwnerUserId);
            listedFirst.UploadedByFullName.Should().Be("E2E Sync Owner");
            listedFirst.CreatedAt.Should().BeAfter(DateTimeOffset.UtcNow.AddMinutes(-5));
            listedFirst.DownloadCount.Should().Be(0);
            listedFirst.DownloadedByMe.Should().BeFalse();
            listedFirst.DownloadedByMeAt.Should().BeNull();

            // S7/S13: los bytes vuelven TAL CUAL, servidos como ZIP y con el nombre original.
            var download = await client.GetAsync($"/api/v1/sync/files/{first.Id}/content");
            download.StatusCode.Should().Be(HttpStatusCode.OK);
            download.Content.Headers.ContentType!.MediaType.Should().Be("application/zip");
            (await download.Content.ReadAsByteArrayAsync()).Should().Equal(oldest);

            var afterFirstDownload = (await ListAsync(client)).Single(file => file.Id == first.Id);
            afterFirstDownload.DownloadCount.Should().Be(1);
            afterFirstDownload.DownloadedByMe.Should().BeTrue();
            afterFirstDownload.DownloadedByMeAt.Should().NotBeNull();
            DateTimeOffset? firstDownloadedAt = afterFirstDownload.DownloadedByMeAt;

            // S4: la marca NO bloquea. La segunda descarga se sirve igual, sube el contador y NO
            // duplica la marca; la fecha que muestra la pantalla sigue siendo la de la primera.
            var again = await client.GetAsync($"/api/v1/sync/files/{first.Id}/content");
            again.StatusCode.Should().Be(HttpStatusCode.OK);
            (await again.Content.ReadAsByteArrayAsync()).Should().Equal(oldest);

            var afterSecondDownload = (await ListAsync(client)).Single(file => file.Id == first.Id);
            afterSecondDownload.DownloadCount.Should().Be(2);
            afterSecondDownload.DownloadedByMe.Should().BeTrue();
            afterSecondDownload.DownloadedByMeAt.Should().Be(firstDownloadedAt);

            (await QueryAsync(db => db.Set<StoreSyncFileDownload>().IgnoreQueryFilters()
                .CountAsync(mark => mark.StoreSyncFileId == first.Id && mark.UserId == fixture.OwnerUserId)))
                .Should().Be(1, "la marca es por usuario, no un histórico de descargas");

            // El otro fichero sigue a cero: el contador es POR fichero.
            (await ListAsync(client)).Single(file => file.Id == second.Id).DownloadCount.Should().Be(0);

            // S8: borrar quita la fila del listado, da de baja la fila y borra el blob.
            var delete = await client.DeleteAsync($"/api/v1/sync/files/{first.Id}");
            delete.StatusCode.Should().Be(HttpStatusCode.OK);

            (await ListAsync(client)).Select(file => file.Id).Should().Equal(second.Id);

            var row = await QueryAsync(db => db.Set<StoreSyncFile>().IgnoreQueryFilters()
                .SingleAsync(file => file.Id == first.Id));
            row.IsActive.Should().BeFalse("la baja es lógica: conserva quién subió qué");

            (await client.GetAsync($"/api/v1/sync/files/{first.Id}/content")).StatusCode
                .Should().Be(HttpStatusCode.NotFound);
            File.Exists(Path.Combine(
                Directory.GetCurrentDirectory(), "storage", "sync",
                row.StorageKey.Replace('/', Path.DirectorySeparatorChar)))
                .Should().BeFalse("el borrado quita también el blob del disco");
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    #endregion

    #region Scope (S5, S6, S8)

    /// <summary>
    /// El StoreUser solo ve y toca SU tienda. El fichero de la otra tienda del mismo Owner responde
    /// 404 —no 403— tanto al descargar como al borrar o al intentar subir a ella.
    /// </summary>
    [Fact]
    public async Task StoreUser_is_confined_to_its_own_store()
    {
        var fixture = await SeedOwnerAsync(withSecondStore: true);
        try
        {
            var owner = ClientFor(fixture.OwnerUserId, fixture.OwnerLogin);
            var (storeUserId, storeUserLogin) = await AddStoreUserAsync(
                fixture, fixture.StoreAId, SendFeatureId, ReceiveFeatureId);
            var storeUser = ClientFor(storeUserId, storeUserLogin);

            var ownFile = await UploadAsync(owner, fixture.StoreAId, BackupBytes("a"), "propio.zip");
            var foreignFile = await UploadAsync(owner, fixture.StoreBId, BackupBytes("b"), "ajeno.zip");

            // S5: la lista del StoreUser trae SOLO la tienda A.
            var listed = await ListAsync(storeUser);
            listed.Select(file => file.Id).Should().Equal(ownFile.Id);

            // S7: puede descargar lo suyo…
            var ownDownload = await storeUser.GetAsync($"/api/v1/sync/files/{ownFile.Id}/content");
            ownDownload.StatusCode.Should().Be(HttpStatusCode.OK);

            // …y lo ajeno responde exactamente como inexistente.
            (await storeUser.GetAsync($"/api/v1/sync/files/{foreignFile.Id}/content")).StatusCode
                .Should().Be(HttpStatusCode.NotFound);
            (await storeUser.DeleteAsync($"/api/v1/sync/files/{foreignFile.Id}")).StatusCode
                .Should().Be(HttpStatusCode.NotFound);

            using (var foreignUpload = BuildUpload(fixture.StoreBId, BackupBytes("x"), "intruso.zip"))
                (await storeUser.PostAsync("/api/v1/sync/files", foreignUpload)).StatusCode
                    .Should().Be(HttpStatusCode.NotFound);

            // El fichero ajeno sigue existiendo e intacto: el 404 no borró nada.
            var ownerList = await ListAsync(owner);
            ownerList.Select(file => file.Id).Should().BeEquivalentTo(new[] { ownFile.Id, foreignFile.Id });
            ownerList.Single(file => file.Id == foreignFile.Id).DownloadCount.Should().Be(0);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    #endregion

    #region Tenant isolation

    /// <summary>
    /// Otro tenant no ve, no descarga, no borra y no puede subir sobre un fichero ajeno. Es el
    /// riesgo más caro del feature: el filtro global del DbContext es
    /// <c>IsSuperAdmin || TenantId == _context.TenantId</c>, así que un fallo aquí filtra backups
    /// de otra instalación y no se nota en ninguna otra prueba.
    /// </summary>
    [Fact]
    public async Task Another_tenant_cannot_see_download_delete_or_write_over_a_file()
    {
        var ownerA = await SeedOwnerAsync(withSecondStore: false);
        try
        {
            Guid tenantBId = Guid.NewGuid();
            using (var scope = _f.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Set<Tenant>().Add(Tenant.Create(tenantBId, $"XT-{tenantBId:N}", "e2e", DateTimeOffset.UtcNow));
                await db.SaveChangesAsync();
            }

            var ownerB = await SeedOwnerAsync(withSecondStore: false, tenantId: tenantBId);
            try
            {
                var clientA = ClientFor(ownerA.OwnerUserId, ownerA.OwnerLogin);
                var clientB = ClientFor(ownerB.OwnerUserId, ownerB.OwnerLogin);

                var fileA = await UploadAsync(clientA, ownerA.StoreAId, BackupBytes("a"), "de-a.zip");
                var fileB = await UploadAsync(clientB, ownerB.StoreAId, BackupBytes("b"), "de-b.zip");

                // S5: cada lista ve SOLO su instalación.
                (await ListAsync(clientA)).Select(file => file.Id).Should().Equal(fileA.Id);
                (await ListAsync(clientB)).Select(file => file.Id).Should().Equal(fileB.Id);

                // S6/S7/S8: lo ajeno responde igual que lo inexistente, nunca 403.
                (await clientB.GetAsync($"/api/v1/sync/files/{fileA.Id}/content")).StatusCode
                    .Should().Be(HttpStatusCode.NotFound);
                (await clientB.DeleteAsync($"/api/v1/sync/files/{fileA.Id}")).StatusCode
                    .Should().Be(HttpStatusCode.NotFound);

                using (var crossTenantUpload = BuildUpload(ownerA.StoreAId, BackupBytes("x"), "intruso.zip"))
                    (await clientB.PostAsync("/api/v1/sync/files", crossTenantUpload)).StatusCode
                        .Should().Be(HttpStatusCode.NotFound);

                // Nada de lo intentado dejó huella: el fichero de A sigue con contador 0.
                var stillThere = (await ListAsync(clientA)).Single();
                stillThere.Id.Should().Be(fileA.Id);
                stillThere.DownloadCount.Should().Be(0);
            }
            finally
            {
                await CleanupAsync(ownerB);
                await DeleteTenantAsync(tenantBId);
            }
        }
        finally
        {
            await CleanupAsync(ownerA);
        }
    }

    /// <summary>
    /// Borra el tenant de prueba. <see cref="CleanupAsync"/> no lo toca a propósito: el tenant por
    /// defecto lo comparten todas las demás pruebas de la suite.
    /// </summary>
    private async Task DeleteTenantAsync(Guid tenantId)
    {
        using var scope = _f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await db.Set<Tenant>().IgnoreQueryFilters()
            .Where(tenant => tenant.Id == tenantId)
            .ExecuteDeleteAsync();
    }

    #endregion

    #region Upload limits (S10)

    /// <summary>0 bytes es lo que deja un multipart sin archivo: 400 y ninguna fila.</summary>
    [Fact]
    public async Task Upload_rejects_an_empty_file_without_writing_anything()
    {
        var fixture = await SeedOwnerAsync(withSecondStore: false);
        try
        {
            var client = ClientFor(fixture.OwnerUserId, fixture.OwnerLogin);

            using var form = BuildUpload(fixture.StoreAId, []);
            var response = await client.PostAsync("/api/v1/sync/files", form);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await ListAsync(client)).Should().BeEmpty();
            (await QueryAsync(db => db.Set<StoreSyncFile>().IgnoreQueryFilters()
                .CountAsync(file => file.StoreId == fixture.StoreAId))).Should().Be(0);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    /// <summary>
    /// Más de 50 MB es 413 y el archivo no se escribe. Se envía 50 MB + 1, que sigue por debajo del
    /// límite del SOBRE (50 MB + 64 KB): así el 413 es la regla de negocio y no el rechazo del
    /// middleware por tamaño total del multipart.
    /// </summary>
    [Fact]
    public async Task Upload_rejects_a_file_over_fifty_megabytes_with_413()
    {
        var fixture = await SeedOwnerAsync(withSecondStore: false);
        try
        {
            var client = ClientFor(fixture.OwnerUserId, fixture.OwnerLogin);
            byte[] tooBig = new byte[StoreSyncFileLimits.MaxFileSizeInBytes + 1];

            using var form = BuildUpload(fixture.StoreAId, tooBig, "enorme.zip");
            var response = await client.PostAsync("/api/v1/sync/files", form);

            response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
            (await ListAsync(client)).Should().BeEmpty();
            (await QueryAsync(db => db.Set<StoreSyncFile>().IgnoreQueryFilters()
                .CountAsync(file => file.StoreId == fixture.StoreAId))).Should().Be(0);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    #endregion

    #region Feature gate (S9)

    /// <summary>
    /// El gate es POR FEATURE y por acción: con solo Send se puede listar y subir, pero descargar
    /// es 403; con solo Receive se puede listar y descargar, pero subir es 403. Listar acepta
    /// cualquiera de las dos.
    ///
    /// Las features de un StoreUser se guardan por (tienda, rol) en <c>StoreRoleFeature</c>, no por
    /// usuario: dos StoreUsers de la MISMA tienda comparten el mismo conjunto. Por eso cada uno
    /// vive en una tienda distinta — A solo Send, B solo Receive —; sembrar Send y Receive en la
    /// misma tienda le daría LAS DOS a ambos y el test no distinguiría nada.
    /// </summary>
    [Fact]
    public async Task Send_and_receive_features_gate_their_own_actions()
    {
        var fixture = await SeedOwnerAsync(withSecondStore: true);
        try
        {
            var owner = ClientFor(fixture.OwnerUserId, fixture.OwnerLogin);
            var storeAFile = await UploadAsync(owner, fixture.StoreAId, BackupBytes("gate-a"), "gate-a.zip");
            var storeBFile = await UploadAsync(owner, fixture.StoreBId, BackupBytes("gate-b"), "gate-b.zip");

            var (sendUserId, sendLogin) = await AddStoreUserAsync(fixture, fixture.StoreAId, SendFeatureId);
            var sendOnly = ClientFor(sendUserId, sendLogin);
            var (receiveUserId, receiveLogin) = await AddStoreUserAsync(fixture, fixture.StoreBId, ReceiveFeatureId);
            var receiveOnly = ClientFor(receiveUserId, receiveLogin);

            // Send: listar (Send OR Receive) y subir sí; descargar no.
            (await ListAsync(sendOnly)).Select(file => file.Id).Should().Equal(storeAFile.Id);
            var sent = await UploadAsync(sendOnly, fixture.StoreAId, BackupBytes("send"), "send.zip");
            (await sendOnly.GetAsync($"/api/v1/sync/files/{sent.Id}/content")).StatusCode
                .Should().Be(HttpStatusCode.Forbidden);

            // Receive: listar y descargar sí; subir no.
            (await ListAsync(receiveOnly)).Select(file => file.Id).Should().Equal(storeBFile.Id);
            (await receiveOnly.GetAsync($"/api/v1/sync/files/{storeBFile.Id}/content")).StatusCode
                .Should().Be(HttpStatusCode.OK);
            using (var upload = BuildUpload(fixture.StoreBId, BackupBytes("receive"), "receive.zip"))
                (await receiveOnly.PostAsync("/api/v1/sync/files", upload)).StatusCode
                    .Should().Be(HttpStatusCode.Forbidden);
        }
        finally
        {
            await CleanupAsync(fixture);
        }
    }

    #endregion
}
