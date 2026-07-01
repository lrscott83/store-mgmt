import { redirect } from 'react-router';

// Matches Angular's wildcard route: { path: '**', redirectTo: '' }.
// Unknown paths redirect to the root, not a static 404 page.
export function loader() {
  return redirect('/');
}

export default function CatchAll() {
  return null;
}
