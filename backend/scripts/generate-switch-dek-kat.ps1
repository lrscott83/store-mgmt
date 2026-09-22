param([string]$OutPath)

$ErrorActionPreference = 'Stop'

# --- C# script that mirrors StoreKeyWrapService/StoreDataKeyProvider exactly ---
$cs = @'
using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public static class WrapGen
{
    public static void Main(string[] args)
    {
        // HKDF-SHA256(masterSecret, storeId) — StoreDataKeyProvider.GetDek byte-for-byte.
        byte[] DeriveDek(string masterSecret, Guid storeId)
        {
            byte[] master = Encoding.UTF8.GetBytes(masterSecret);
            byte[] info = Encoding.UTF8.GetBytes(storeId.ToString("D"));
            return HKDF.DeriveKey(HashAlgorithmName.SHA256, master, 32, null, info);
        }

        // StoreKeyWrapService.WrapDek byte-for-byte: KEK = PBKDF2(UTF8(keyMaterialBase64Text)).
        Wrapped WrapDek(string keyMaterialBase64Text, byte[] dek)
        {
            byte[] wrapSalt = RandomNumberGenerator.GetBytes(16);
            byte[] wrapIv = RandomNumberGenerator.GetBytes(12);
            byte[] kek = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(keyMaterialBase64Text), wrapSalt, 210_000, HashAlgorithmName.SHA256, 32);
            byte[] ciphertext = new byte[dek.Length];
            byte[] tag = new byte[16];
            using var aesGcm = new AesGcm(kek, 16);
            aesGcm.Encrypt(wrapIv, dek, ciphertext, tag);
            byte[] wrapped = new byte[ciphertext.Length + tag.Length];
            Buffer.BlockCopy(ciphertext, 0, wrapped, 0, ciphertext.Length);
            Buffer.BlockCopy(tag, 0, wrapped, ciphertext.Length, tag.Length);
            return new Wrapped(Convert.ToBase64String(wrapped), Convert.ToBase64String(wrapSalt), Convert.ToBase64String(wrapIv));
        }

        string masterSecret = "kat-current-dek-kek-master-secret";
        Guid storeA = Guid.Parse("a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1");
        Guid storeB = Guid.Parse("b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2");
        byte[] currentDek = DeriveDek(masterSecret, storeA);
        byte[] targetDek = DeriveDek(masterSecret, storeB);
        Wrapped w = WrapDek(Convert.ToBase64String(currentDek), targetDek);

        var payload = new
        {
            masterSecret,
            storeA = storeA.ToString(),
            storeB = storeB.ToString(),
            currentDek = Convert.ToBase64String(currentDek),
            targetDek = Convert.ToBase64String(targetDek),
            wrappedDek = w.WrappedDek,
            wrapSalt = w.WrapSalt,
            wrapIv = w.WrapIv,
        };
        File.WriteAllText(args[0], JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine("KAT vector written: " + args[0]);
    }

    private sealed record Wrapped(string WrappedDek, string WrapSalt, string WrapIv);
}
'@

$dir = Join-Path $env:TEMP ("katgen-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null
Set-Content -Path (Join-Path $dir "Program.cs") -Value $cs -Encoding UTF8

$proj = Join-Path $dir "katgen.csproj"
@'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>disable</Nullable>
    <AssemblyName>katgen</AssemblyName>
    <RootNamespace>katgen</RootNamespace>
  </PropertyGroup>
</Project>
'@ | Set-Content -Path $proj -Encoding UTF8

Push-Location $dir
try {
  dotnet run --project $proj -- $OutPath | Out-Host
} finally {
  Pop-Location
  try { Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue } catch {}
}
