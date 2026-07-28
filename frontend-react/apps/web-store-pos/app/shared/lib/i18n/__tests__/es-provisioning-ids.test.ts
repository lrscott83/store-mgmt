import { describe, it, expect } from 'vitest';
import messages from '../es';

// Design correction #5 — no plan task added these; the spec requires 4
// distinct provisioning failure messages plus an export label, and `es.ts`
// is the single catalog. A missing id renders the raw id on screen.
describe('es.ts — offline provisioning + roster export ids', () => {
  const requiredKeys = [
    'PROVISION.TITLE',
    'PROVISION.SUCCESS',
    'PROVISION.STORE_ID_LABEL',
    'PROVISION.MASTER_PASSWORD_LABEL',
    'PROVISION.FILE_LABEL',
    'PROVISION.SUBMIT',
    'PROVISION.ERROR_WRONG_PASSWORD',
    'PROVISION.ERROR_CORRUPT_FILE',
    'PROVISION.ERROR_EXPIRED',
    'PROVISION.ERROR_REPLAY',
    'USERS.EXPORT_ROSTER',
  ];

  it.each(requiredKeys)('defines a non-empty string for %s', (key) => {
    expect(typeof messages[key]).toBe('string');
    expect(messages[key].length).toBeGreaterThan(0);
  });
});
