import { beforeEach, describe, expect, it } from 'vitest';
import { MessagesOfflineService } from '../messages-offline-service';
import type { SendMessagePayload } from '../messages-types';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const storeId = 's1';
const storageKey = `lizoft.store-messagesQueue-${storeId}`;

function payload(overrides: Partial<SendMessagePayload> = {}): SendMessagePayload {
  return {
    conversationId: 'c1',
    ownerId: 'u1',
    storeId,
    content: 'Hola',
    ...overrides,
  };
}

function v2Bundle(): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: 999_999_999_999,
    formatVersion: 2,
    storeId,
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: storeId,
        verifier: { hash: 'h', salt: 's', iterations: 210_000 },
        wrappedDek: 'ct',
        wrapSalt: 'salt',
        wrapIv: 'iv',
      },
    ],
  };
}

describe('messages-offline-service — at-rest encryption seam', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: an unprovisioned device writes/reads raw plain JSON', () => {
    const service = new MessagesOfflineService(storeId);
    service.enqueue(payload({ content: 'Sin cifrar' }));

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(false);
    expect(() => JSON.parse(raw!)).not.toThrow();
    expect(service.getQueue()).toHaveLength(1);
  });

  it('provisioned + unlocked write produces enc:v1: ciphertext that round-trips', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const service = new MessagesOfflineService(storeId);
    service.enqueue(payload({ content: 'Cifrado' }));

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    expect(service.getQueue()).toHaveLength(1);
    expect(service.getQueue()[0].content).toBe('Cifrado');
  });

  it('a provisioned-but-locked read never destroys existing ciphertext', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const service = new MessagesOfflineService(storeId);
    service.enqueue(payload());

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek();
    const lockedService = new MessagesOfflineService(storeId);
    expect(() => lockedService.getQueue()).toThrow(MissingDataKeyError);

    expect(localStorage.getItem(storageKey)).toBe(rawBefore);
  });

  it('a provisioned-but-locked enqueue throws and leaves ciphertext unchanged', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const service = new MessagesOfflineService(storeId);
    service.enqueue(payload());

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek();
    expect(() => service.enqueue(payload({ content: 'Nuevo' }))).toThrow(MissingDataKeyError);

    expect(localStorage.getItem(storageKey)).toBe(rawBefore);
  });
});
