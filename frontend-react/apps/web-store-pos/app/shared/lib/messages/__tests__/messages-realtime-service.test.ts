import { describe, expect, it } from 'vitest';
import { resolveMessagesHubUrl } from '../messages-realtime-service';

const PAGE_ORIGIN = 'https://pos.example.com';

describe('resolveMessagesHubUrl (T9.3)', () => {
  it('maps the same-origin production base to the hub on the page origin', () => {
    expect(resolveMessagesHubUrl('/api', PAGE_ORIGIN)).toBe('https://pos.example.com/hubs/messages');
  });

  it('maps a cross-origin dev base to the hub on the API origin — never under the API path prefix', () => {
    // The regression this pins: `${API_URL}/hubs/messages` would produce
    // 'http://localhost:5019/api/hubs/messages', which no route serves. The hub
    // is mounted at the host root (nginx proxies /hubs, MapHub maps /hubs/messages).
    expect(resolveMessagesHubUrl('http://localhost:5019/api', PAGE_ORIGIN)).toBe(
      'http://localhost:5019/hubs/messages',
    );
  });

  it('keeps the API scheme, so a wss hub follows an https API', () => {
    expect(resolveMessagesHubUrl('https://api.example.com/api', PAGE_ORIGIN)).toBe(
      'https://api.example.com/hubs/messages',
    );
  });

  it('falls back to the same-origin hub path when API_URL is absent', () => {
    expect(resolveMessagesHubUrl(undefined, PAGE_ORIGIN)).toBe('/hubs/messages');
    expect(resolveMessagesHubUrl('', PAGE_ORIGIN)).toBe('/hubs/messages');
  });

  it('falls back to the same-origin hub path when API_URL is unparseable instead of throwing', () => {
    expect(resolveMessagesHubUrl('http://[', PAGE_ORIGIN)).toBe('/hubs/messages');
  });
});
