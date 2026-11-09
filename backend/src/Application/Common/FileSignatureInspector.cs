namespace Application.Common
{
    /// <summary>
    /// Mira lo que el archivo ES, no lo que dice ser.
    ///
    /// La extensión y el `Content-Type` los elige quien sube: renombrar cualquier cosa a `.png` y
    /// declarar `image/png` bastaba para que el archivo entrara sin que nadie hubiera mirado un solo
    /// byte. Esto lee la CABECERA real —los primeros bytes, la "firma" del formato— y la compara con
    /// las firmas que el producto acepta.
    ///
    /// Solo se mira la cabecera: no se decodifica la imagen ni se abre el ZIP. Un archivo con la
    /// firma correcta y el cuerpo corrupto sigue pasando; el objetivo es que el formato sea el que
    /// dice ser, no validar la integridad del contenido.
    /// </summary>
    internal static class FileSignatureInspector
    {
        /// <summary>
        /// Bytes que hay que leer para distinguir todos los formatos aceptados. WebP es el que más
        /// pide: 12 (RIFF + tamaño + "WEBP"). PNG necesita 8 y un ZIP 4.
        /// </summary>
        public const int HeadLength = 12;

        /// <summary>JPEG: SOI (FF D8) seguido del inicio de un segmento (FF).</summary>
        private static readonly byte[] JpegSignature = { 0xFF, 0xD8, 0xFF };

        /// <summary>PNG: 8 bytes fijos, saltos de línea incluidos.</summary>
        private static readonly byte[] PngSignature = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

        /// <summary>WebP es un contenedor RIFF con la etiqueta "WEBP" en el byte 8.</summary>
        private static readonly byte[] RiffSignature = { 0x52, 0x49, 0x46, 0x46 };

        private static readonly byte[] WebpTag = { 0x57, 0x45, 0x42, 0x50 };

        /// <summary>
        /// Las tres formas en que un ZIP legítimo puede empezar: cabecera de fichero local,
        /// fin del directorio central (ZIP vacío) y archivo segmentado.
        /// </summary>
        private static readonly byte[][] ZipSignatures =
        {
            new byte[] { 0x50, 0x4B, 0x03, 0x04 },
            new byte[] { 0x50, 0x4B, 0x05, 0x06 },
            new byte[] { 0x50, 0x4B, 0x07, 0x08 },
        };

        /// <summary>¿La cabecera es la de un JPEG, un PNG o un WebP?</summary>
        public static bool IsAllowedImage(ReadOnlySpan<byte> head) =>
            StartsWith(head, JpegSignature) || StartsWith(head, PngSignature) || IsWebp(head);

        /// <summary>¿La cabecera es la de un archivo ZIP?</summary>
        public static bool IsZip(ReadOnlySpan<byte> head)
        {
            foreach (byte[] signature in ZipSignatures)
            {
                if (StartsWith(head, signature))
                    return true;
            }

            return false;
        }

        /// <summary>
        /// Lee la cabecera y devuelve TAMBIÉN el stream que hay que seguir usando. Quien llama
        /// necesita los bytes desde el principio para guardarlos, y no todo stream permite volver
        /// atrás: si se puede rebobinar se rebobina, y si no se copia a memoria —los límites de
        /// tamaño ya se comprobaron antes de llegar aquí— para no guardar un archivo al que le
        /// faltan los primeros bytes.
        /// </summary>
        public static (byte[] Head, Stream Content) ReadHead(Stream content)
        {
            if (content is null)
                return (Array.Empty<byte>(), Stream.Null);

            if (content.CanSeek)
            {
                long origin = content.Position;
                byte[] head = ReadUpTo(content, HeadLength);
                content.Position = origin;
                return (head, content);
            }

            byte[] bufferedHead = ReadUpTo(content, HeadLength);
            var buffer = new MemoryStream();
            buffer.Write(bufferedHead);
            content.CopyTo(buffer);
            buffer.Position = 0;
            return (bufferedHead, buffer);
        }

        /// <summary>
        /// Lee hasta <paramref name="count"/> bytes. Un archivo corto devuelve menos: nunca rellena
        /// con ceros, porque un relleno convertiría un "no lo sé" en un "sí" para las firmas que
        /// empiezan por 0x00.
        /// </summary>
        private static byte[] ReadUpTo(Stream content, int count)
        {
            byte[] buffer = new byte[count];
            int read = 0;
            while (read < count)
            {
                int chunk = content.Read(buffer, read, count - read);
                if (chunk <= 0)
                    break;

                read += chunk;
            }

            return read == count ? buffer : buffer[..read];
        }

        private static bool StartsWith(ReadOnlySpan<byte> head, ReadOnlySpan<byte> signature) =>
            head.Length >= signature.Length && head[..signature.Length].SequenceEqual(signature);

        private static bool IsWebp(ReadOnlySpan<byte> head) =>
            head.Length >= HeadLength && StartsWith(head, RiffSignature) && StartsWith(head[8..], WebpTag);
    }
}
