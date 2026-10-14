import { describe, it, expect } from 'vitest';
import { toBase45, fromBase45, encodeSdp, decodeSdp } from '../sdp-codec';

const utf8 = (value: string) => new TextEncoder().encode(value);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

// RFC 9285 §4 known-answer vectors.
const RFC_9285_VECTORS: ReadonlyArray<readonly [plain: string, encoded: string]> = [
  ['AB', 'BB8'],
  ['Hello!!', '%69 VD92EX0'],
  ['base-45', 'UJCLQE7W581'],
  ['ietf!', 'QED8WEX0'],
];

describe('base45 — RFC 9285 known-answer vectors', () => {
  it.each(RFC_9285_VECTORS)('encodes %s as %s', (plain, encoded) => {
    expect(toBase45(utf8(plain))).toBe(encoded);
  });

  it.each(RFC_9285_VECTORS)('decodes %s back to %s', (plain, encoded) => {
    expect(text(fromBase45(encoded))).toBe(plain);
  });

  it('round-trips arbitrary byte values', () => {
    const bytes = Uint8Array.from([0, 1, 44, 45, 66, 200, 255]);
    expect(Array.from(fromBase45(toBase45(bytes)))).toEqual(Array.from(bytes));
  });

  it('ignores line noise introduced by copy/paste', () => {
    expect(text(fromBase45('BB8\n'))).toBe('AB');
  });

  it('throws on an invalid base45 character', () => {
    expect(() => fromBase45('AA!')).toThrow();
  });

  it('throws on an invalid base45 length', () => {
    expect(() => fromBase45('A')).toThrow();
  });
});

// A deliberately long, repetitive SDP of the shape the app will actually carry:
// every non-trickle candidate is present, so real offers look like this.
function buildSdp(): string {
  const candidates = Array.from({ length: 12 }, (_, i) =>
    [
      `a=candidate:${i} 1 udp 2113937151`,
      `1${i}3b2c4-d5e6-47a8-9b0c-1d2e3f405060.local 50${i}00 typ host generation 0`,
      'network-cost 999',
    ].join(' '),
  );
  return [
    'v=0',
    'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=extmap-allow-mixed',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    'a=ice-ufrag:8hhY',
    'a=ice-pwd:asd88fgpdd777uzjYhagZg',
    'a=ice-options:trickle',
    'a=fingerprint:sha-256 51:2F:4A:5C:DE:0B:81:37:5E:8C:C6:E7:3F:47:5E:8D:5E',
    'a=setup:actpass',
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    ...candidates,
  ].join('\r\n');
}

describe('encodeSdp / decodeSdp — deflate + base45 round-trip', () => {
  it('round-trips the SDP byte-for-byte (CRLF preserved)', async () => {
    const sdp = buildSdp();
    await expect(decodeSdp(await encodeSdp(sdp))).resolves.toBe(sdp);
  });

  it('emits only QR alphanumeric-safe characters', async () => {
    const encoded = await encodeSdp(buildSdp());
    expect(encoded).toMatch(/^[0-9A-Z $%*+./:-]+$/);
  });

  it('compresses: the encoded offer is shorter than the raw SDP', async () => {
    const sdp = buildSdp();
    const encoded = await encodeSdp(sdp);
    expect(encoded.length).toBeLessThan(sdp.length);
  });

  it('tolerates line noise injected by copy/paste', async () => {
    const sdp = buildSdp();
    const encoded = await encodeSdp(sdp);
    const mangled = `${encoded.slice(0, 7)}\n${encoded.slice(7)}`;
    await expect(decodeSdp(mangled)).resolves.toBe(sdp);
  });
});
