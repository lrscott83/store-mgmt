import { describe, it, expect } from 'vitest';
import { clientLoader } from '../$';

describe('CatchAll loader — matches Angular\'s wildcard redirect', () => {
  it('redirects unknown paths to "/" (Angular: { path: "**", redirectTo: "" })', async () => {
    const response = clientLoader();
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');
  });
});
