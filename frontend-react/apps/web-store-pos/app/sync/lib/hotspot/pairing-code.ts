// Pairing authentication for the hotspot device-to-device transfer
// (plan docs/deploy/2026-09-09-device-to-device-file-transfer-plan.md §3.3).
//
// The emitter shows a 6-digit code on its screen and carries it in the QR
// handshake. Both peers derive a proof from that code plus a per-session salt
// and exchange it over the DTLS-protected channel BEFORE the data channel is
// used. A LAN attacker performing signaling MITM cannot produce the proof
// without the code, which only the two screens can see.
//
// PBKDF2 — not a bare hash — because a 6-digit code has only 10^6 candidates:
// a fast hash would let an attacker who captures one proof brute-force it
// instantly. PBKDF2 makes each candidate guess expensive.
import { pbkdf2Base64, sha256Base64 } from '~/shared/lib/offline/offline-crypto';

export const PAIRING_CODE_DIGITS = 6;
export const PAIRING_ITERATIONS = 210_000;

const PAIRING_SALT_BYTES = 16;
const MAX_UINT32 = 0x1_0000_0000;

/** Six decimal digits, uniformly random (rejection sampling — no modulo bias). */
export function generatePairingCode(): string {
  const codeSpace = 10 ** PAIRING_CODE_DIGITS;
  const limit = Math.floor(MAX_UINT32 / codeSpace) * codeSpace;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return String(value % codeSpace).padStart(PAIRING_CODE_DIGITS, '0');
}

/** Per-session public salt (not secret), carried with the handshake. */
export function generatePairingSalt(): string {
  const bytes = new Uint8Array(PAIRING_SALT_BYTES);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Proof that the caller knows the pairing code for this session salt. */
export async function pairingProof(code: string, saltBase64: string): Promise<string> {
  const preHash = await sha256Base64(code);
  return pbkdf2Base64(preHash, saltBase64, PAIRING_ITERATIONS);
}

/** True only when `proof` is the proof for `code` under this session salt. */
export async function verifyPairingProof(
  code: string,
  saltBase64: string,
  proof: string,
): Promise<boolean> {
  const expected = await pairingProof(code, saltBase64);
  return expected === proof;
}
