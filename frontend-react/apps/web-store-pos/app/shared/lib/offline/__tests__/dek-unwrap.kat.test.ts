import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unwrapDek, wrapDekWithPassword, DekUnwrapError, DEK_WRAP_ITERATIONS } from '../dek-unwrap';
import { pbkdf2Base64, sha256Base64 } from '../offline-crypto';
import { aesGcmDecrypt } from '../../storage/aes-gcm';
import { bytesFromBase64 } from '../../storage/base64';

// design D6 — single source of truth for both stacks: `docs/contracts/offline-roster-dek-kat.json`
// (provenance "dotnet-backend"). Reads via readFileSync, NOT a static import — Vitest's Vite root
// is `apps/web-store-pos` and a static import 8 levels above it risks fs.strict denial.
const katPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../'.repeat(8),
  'docs/contracts/offline-roster-dek-kat.json',
);
const kat = JSON.parse(readFileSync(katPath, 'utf-8')) as {
  password: string;
  passwordPreHash: string;
  wrapSalt: string;
  wrapIv: string;
  iterations: number;
  wrappedDek: string;
  expectedDek: string;
  storeId: string;
  masterSecret: string;
  _header: { provenance: string; backendCommitSha: string; dotnetVersion: string };
};

describe('dek-unwrap — known-answer vector (dotnet-backend, cross-stack)', () => {
  it('vector provenance is the real backend, not a node transcription', () => {
    expect(kat._header.provenance).toBe('dotnet-backend');
    expect(kat._header.backendCommitSha).toBeTruthy();
  });

  it('sha256Base64(password) independently reproduces the vector passwordPreHash', async () => {
    const preHash = await sha256Base64(kat.password);
    expect(preHash).toBe(kat.passwordPreHash);
  });

  it('unwrapDek(knownPassword, fixtureEntry) equals the vector expected 32-byte DEK', async () => {
    const dek = await unwrapDek(kat.password, {
      wrappedDek: kat.wrappedDek,
      wrapSalt: kat.wrapSalt,
      wrapIv: kat.wrapIv,
    });

    const expected = Uint8Array.from(atob(kat.expectedDek), (c) => c.charCodeAt(0));
    expect(Array.from(dek)).toEqual(Array.from(expected));
    expect(dek.length).toBe(32);
  });

  it('rejects with DekUnwrapError for a wrong password', async () => {
    await expect(
      unwrapDek('wrong password', {
        wrappedDek: kat.wrappedDek,
        wrapSalt: kat.wrapSalt,
        wrapIv: kat.wrapIv,
      }),
    ).rejects.toThrow(DekUnwrapError);
  });

  it('pins DEK_WRAP_ITERATIONS at 210_000 — the KAT fails if it drifts', async () => {
    expect(DEK_WRAP_ITERATIONS).toBe(210_000);
    expect(kat.iterations).toBe(210_000);
  });

  it('a different iteration count derives a different KEK and fails to unwrap the fixture (proves the constant is load-bearing)', async () => {
    // DEK_WRAP_ITERATIONS itself is a `const` (correctly not mutable at
    // runtime — see design §6, it must never be configurable). This
    // reproduces what an iteration-count drift would do: derive the KEK
    // with a DIFFERENT count than the one the fixture was wrapped under,
    // and confirm the mismatched KEK cannot open the fixture's wrappedDek.
    const driftedIterations = DEK_WRAP_ITERATIONS + 1;
    const preHash = await sha256Base64(kat.password);
    const driftedKekBase64 = await pbkdf2Base64(preHash, kat.wrapSalt, driftedIterations);
    const driftedKek = bytesFromBase64(driftedKekBase64);

    expect(() =>
      aesGcmDecrypt(driftedKek, bytesFromBase64(kat.wrapIv), bytesFromBase64(kat.wrappedDek)),
    ).toThrow();
  });
});

// design D3 / §7 — the client-minted (Q2) direction, added to the SAME
// module and the SAME KAT file so the mint and unwrap directions cannot
// drift apart. Existing assertions above are untouched.
describe('dek-unwrap — wrapDekWithPassword (D3, client mint direction)', () => {
  it('round trip: unwrapDek(pwd, await wrapDekWithPassword(pwd, dek)) returns dek byte-for-byte', async () => {
    const password = 'a fresh local password';
    const dek = crypto.getRandomValues(new Uint8Array(32));

    const entry = await wrapDekWithPassword(password, dek);
    const unwrapped = await unwrapDek(password, entry);

    expect(Array.from(unwrapped)).toEqual(Array.from(dek));
  });

  it('mint against the frozen KAT wrapSalt/wrapIv reproduces the KAT wrappedDek exactly', async () => {
    const expected = Uint8Array.from(atob(kat.expectedDek), (c) => c.charCodeAt(0));

    const entry = await wrapDekWithPassword(kat.password, expected, {
      wrapSalt: kat.wrapSalt,
      wrapIv: kat.wrapIv,
    });

    expect(entry.wrappedDek).toBe(kat.wrappedDek);
    expect(entry.wrapSalt).toBe(kat.wrapSalt);
    expect(entry.wrapIv).toBe(kat.wrapIv);
  });
});
