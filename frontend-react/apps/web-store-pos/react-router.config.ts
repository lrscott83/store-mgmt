import type { Config } from '@react-router/dev/config';

export default {
  // SPA mode (client-only), matching Angular. Auth state lives in a
  // client-side Zustand store hydrated from localStorage, which server
  // loaders cannot see — running loaders on the client avoids the
  // false "not authenticated" redirect to /login after login.
  ssr: false,
} satisfies Config;
