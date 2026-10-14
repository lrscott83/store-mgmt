import { describe, it, expect } from 'vitest';
import {
  HANDSHAKE_VERSION,
  encodeOfferPayload,
  decodeOfferPayload,
  encodeAnswerPayload,
  decodeAnswerPayload,
  type OfferPayload,
  type AnswerPayload,
} from '../handshake';

const offer: OfferPayload = {
  v: HANDSHAKE_VERSION,
  type: 'offer',
  sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n',
  code: '482913',
  salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
  file: { name: 'roster.smcabundle', size: 123_456, kind: 'roster' },
};

const answer: AnswerPayload = {
  v: HANDSHAKE_VERSION,
  type: 'answer',
  sdp: 'v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\n',
  proof: 'Zm9vYmFy',
};

describe('handshake payloads', () => {
  it('round-trips an offer payload', async () => {
    await expect(decodeOfferPayload(await encodeOfferPayload(offer))).resolves.toEqual(offer);
  });

  it('round-trips an answer payload', async () => {
    await expect(decodeAnswerPayload(await encodeAnswerPayload(answer))).resolves.toEqual(answer);
  });

  it('emits base45-safe text', async () => {
    expect(await encodeOfferPayload(offer)).toMatch(/^[0-9A-Z $%*+./:-]+$/);
  });

  it('rejects a payload with an unknown version', async () => {
    const encoded = await encodeOfferPayload({ ...offer, v: 99 });
    await expect(decodeOfferPayload(encoded)).rejects.toThrow(/version/i);
  });

  it('rejects an answer where an offer is expected', async () => {
    await expect(decodeOfferPayload(await encodeAnswerPayload(answer))).rejects.toThrow(/offer/i);
  });

  it('rejects an offer where an answer is expected', async () => {
    await expect(decodeAnswerPayload(await encodeOfferPayload(offer))).rejects.toThrow(/answer/i);
  });

  it('rejects malformed text', async () => {
    await expect(decodeOfferPayload('!!!!')).rejects.toBeTruthy();
  });
});
