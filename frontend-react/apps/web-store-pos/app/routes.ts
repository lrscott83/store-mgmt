import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  // Guest-only routes (no auth required)
  layout('auth/components/auth-layout.tsx', [
    route('login', 'auth/routes/login.tsx'),
    route('register', 'auth/routes/register.tsx'),
  ]),

  // Authenticated routes (require auth via authLoader)
  layout('shared/components/app-layout.tsx', { id: 'app-layout' }, [
    index('home/routes/index.tsx'),
  ]),

  // Utility routes
  route('health', 'shared/routes/health.tsx'),
  route('*', 'shared/routes/$.tsx'),
] satisfies RouteConfig;
