using Application.Abstractions.Storage;
using FluentAssertions;
using Infrastructure.Storage;
using Microsoft.Extensions.Options;

namespace Application.Tests.Features.StoreSync.Storage;

/// <summary>
/// La escritura del blob es ATÓMICA (hallazgo R3-4 del review): se escribe a un temporal en la misma
/// carpeta y se renombra. Escribir directo al destino final deja, si la copia falla a mitad, un ZIP
/// TRUNCADO indistinguible de uno bueno para cualquiera que lo descargue después.
///
/// Estos tests usan el sistema de ficheros real sobre un directorio temporal: mockear el
/// almacenamiento probaría el handler, no la garantía.
/// </summary>
public sealed class StoreSyncFileStorageTests : IDisposable
{
    private readonly string _root = Path.Combine(
        Path.GetTempPath(), "store-sync-storage-tests", Guid.NewGuid().ToString("N"));

    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _storeId = Guid.NewGuid();
    private readonly Guid _fileId = Guid.NewGuid();

    public void Dispose()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    private StoreSyncFileStorage Storage() => new(
        Options.Create(new StoreSyncFileStorageOptions { SyncFileRoot = _root }));

    private Task<string> SaveAsync(Stream content) => Storage().SaveAsync(
        new StoreSyncFileUpload(content, "respaldo.zip", "application/zip", content.Length),
        _tenantId,
        _storeId,
        _fileId);

    [Fact]
    public async Task Save_writes_the_complete_file_under_the_expected_key()
    {
        string key = await SaveAsync(new MemoryStream([1, 2, 3, 4]));

        key.Should().Be($"{_tenantId:N}/{_storeId:N}/{_fileId:N}.zip");
        File.Exists(Path.Combine(_root, key.Replace('/', Path.DirectorySeparatorChar)))
            .Should().BeTrue();
    }

    /// <summary>
    /// Una copia que falla a mitad NO deja el fichero final: si quedara, cualquiera lo descargaría
    /// creyendo que está completo. Y el temporal tampoco sobrevive.
    /// </summary>
    [Fact]
    public async Task Save_when_the_copy_fails_leaves_no_file_and_no_temporary()
    {
        var failing = new FailsMidCopyStream([1, 2, 3, 4]);

        Func<Task> act = () => SaveAsync(failing);

        await act.Should().ThrowAsync<IOException>();

        // La carpeta puede existir (con el temporal ya borrado) o haberse limpiado entera: las dos
        // cosas son correctas. Lo que NO puede quedar es un fichero, ni el final ni un temporal.
        IEnumerable<string> leftovers = Directory.Exists(_root)
            ? Directory.GetFiles(_root, "*", SearchOption.AllDirectories)
            : [];

        leftovers.Should().BeEmpty("ni el destino final ni el temporal pueden sobrevivir a un fallo a mitad");
    }

    /// <summary>Un stream que entrega unos bytes y revienta, como un cliente que corta la subida.</summary>
    private sealed class FailsMidCopyStream(byte[] preamble) : Stream
    {
        private int _delivered;

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => preamble.Length;
        public override long Position
        {
            get => _delivered;
            set => throw new NotSupportedException();
        }

        public override void Flush() { }

        public override int Read(byte[] buffer, int offset, int count)
            => ReadAsync(buffer.AsMemory(offset, count), CancellationToken.None).AsTask().GetAwaiter().GetResult();

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (_delivered >= preamble.Length)
                throw new IOException("la subida se cortó a mitad");

            int chunk = Math.Min(buffer.Length, preamble.Length - _delivered);
            preamble.AsSpan(_delivered, chunk).CopyTo(buffer.Span);
            _delivered += chunk;
            return ValueTask.FromResult(chunk);
        }

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
