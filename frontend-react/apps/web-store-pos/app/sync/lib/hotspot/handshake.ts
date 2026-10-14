// Signaling envelope for the hotspot handshake (plan §3.2–3.3).
//
// The QR codes do not carry a bare SDP: they carry a small JSON envelope,
// deflate+base45-encoded by `sdp-codec`. The offer also carries the pairing
// code and the session salt (owner decision: the code travels in the QR, the
// receiver never types it); the answer echoes a proof so a mismatched pairing
// is detected before the data channel is used.
import { decodeSdp, encodeSdp } from './sdp-codec';

export const HANDSHAKE_VERSION = 1;

export interface OfferedFile {
  readonly name: string;
  readonly size: number;
  readonly kind: string;
}

export interface OfferPayload {
  readonly v: number;
  readonly type: 'offer';
  readonly sdp: string;
  readonly code: string;
  readonly salt: string;
  readonly file: OfferedFile;
}

export interface AnswerPayload {
  readonly v: number;
  readonly type: 'answer';
  readonly sdp: string;
  readonly proof: string;
}

export function encodeOfferPayload(payload: OfferPayload): Promise<string> {
  return encodeSdp(JSON.stringify(payload));
}

export function encodeAnswerPayload(payload: AnswerPayload): Promise<string> {
  return encodeSdp(JSON.stringify(payload));
}

export async function decodeOfferPayload(encoded: string): Promise<OfferPayload> {
  const parsed = await decodePayload(encoded);
  if (parsed.type !== 'offer') throw new Error('Expected an offer payload');
  if (!isOfferPayload(parsed)) throw new Error('Invalid offer payload');
  return parsed;
}

export async function decodeAnswerPayload(encoded: string): Promise<AnswerPayload> {
  const parsed = await decodePayload(encoded);
  if (parsed.type !== 'answer') throw new Error('Expected an answer payload');
  if (!isAnswerPayload(parsed)) throw new Error('Invalid answer payload');
  return parsed;
}

async function decodePayload(encoded: string): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await decodeSdp(encoded));
  } catch {
    throw new Error('Invalid handshake payload');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid handshake payload');
  const candidate = parsed as Record<string, unknown>;
  if (candidate.v !== HANDSHAKE_VERSION) throw new Error('Unsupported handshake version');
  if (typeof candidate.type !== 'string') throw new Error('Invalid handshake payload');
  return candidate;
}

function isOfferPayload(value: unknown): value is OfferPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.sdp !== 'string' ||
    typeof candidate.code !== 'string' ||
    typeof candidate.salt !== 'string'
  ) {
    return false;
  }
  const file = candidate.file;
  if (typeof file !== 'object' || file === null) return false;
  const candidateFile = file as Record<string, unknown>;
  return (
    typeof candidateFile.name === 'string' &&
    typeof candidateFile.size === 'number' &&
    typeof candidateFile.kind === 'string'
  );
}

function isAnswerPayload(value: unknown): value is AnswerPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.sdp === 'string' && typeof candidate.proof === 'string';
}
