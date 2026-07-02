import { redirect } from 'react-router';

// Matches Angular's wildcard route: { path: '**', redirectTo: '' }.
// Unknown paths redirect to the root, not a static 404 page.
// clientLoader (not loader) — SPA mode (ssr:false) rejects server `loader` exports.
export function clientLoader() {
  return redirect('/');
}

export default function CatchAll() {
  return null;
}
