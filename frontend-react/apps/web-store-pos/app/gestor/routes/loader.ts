import { redirect } from 'react-router';
import { authLoader } from '~/auth/routes/loaders';
import { resolveUserHomePath } from '~/shared/lib/auth/user-home';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

/**
 * Guard del portal del gestor (R3-GESTOR-ROUTE-GUARD). `authLoader` ya exige sesión válida y
 * aplica el gate de DEK; encima, este loader exige el rol Owner-level `GestorVentas`. Un
 * autenticado que no es gestor vuelve a SU home (no se le cierra la sesión): la ruta no es un
 * área prohibida, simplemente no es la suya.
 */
export async function gestorLoader(): Promise<Response | null> {
  const denied = await authLoader();
  if (denied) return denied;

  const { user } = useAuthStore.getState();
  if (!user) return redirect('/login');
  if (!user.isGestorVentas) return redirect(await resolveUserHomePath(user));

  return null;
}
