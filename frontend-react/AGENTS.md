# AGENTS.md - Store Management Frontend (React)

## Project Overview

pnpm + Turborepo monorepo with a React 19 / React Router v7 SSR application for store point-of-sale management. Migration target from the Angular 21 frontend at `../frontend/`.

## Monorepo Structure

```
frontend-react/
├── apps/
│   └── web-store-pos          # Main POS app (@store-mgmt/web-store-pos)
├── packages/
│   ├── domain                 # Shared types and business logic (@store-mgmt/domain)
│   ├── web-common             # Shared UI, utilities, styles (@store-mgmt/web-common)
│   ├── eslint-config          # Shared ESLint v9 flat config (@store-mgmt/eslint-config)
│   └── typescript-config      # Shared tsconfig bases (@store-mgmt/typescript-config)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

Shared logic belongs in packages. Application code must never be duplicated across apps — extract to a shared package when reuse is needed. Every package must be independently buildable and type-checkable.

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | >= 22 |
| Package manager | pnpm | 10.33+ |
| Monorepo orchestrator | Turborepo | 2.8+ |
| Language | TypeScript (strict) | 5.8.3 |
| UI library | React | 19.x |
| Routing / SSR | React Router v7 (framework mode) | 7.15+ |
| Bundler | Vite | 6.x |
| CSS | Tailwind CSS v4 (Vite plugin) | 4.x |
| Linter | ESLint v9 (flat config) + Prettier | 9.x / 3.6+ |

## Build / Dev / Test Commands

```bash
# From monorepo root (frontend-react/)
pnpm dev                # Start all apps in dev mode
pnpm dev:local          # Dev with local env
pnpm build              # Production build (all apps + packages)
pnpm lint               # ESLint across all workspaces
pnpm typecheck          # TypeScript check across all workspaces
pnpm test               # Run tests across all workspaces
pnpm format             # Prettier format
pnpm clean              # Remove build artifacts

# From an app directory
pnpm dev                # Start dev server (port 3000)
pnpm build              # react-router build
pnpm start              # Serve production build
pnpm typecheck          # react-router typegen && tsc
```

## SSR and Routing

All apps use **Server-Side Rendering** via React Router v7 framework mode. Pages are rendered on the server before being sent to the client, leveraging **loaders** for data fetching and **actions** for mutations. Client-side hydration enables interactivity after initial load.

### Route configuration

Routes use the imperative `routes.ts` pattern with `@react-router/dev/routes` helpers:

```typescript
// app/routes.ts
import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('home/routes/index.tsx'),
  route('health', 'shared/routes/health.tsx'),
  route('*', 'shared/routes/$.tsx'),
] satisfies RouteConfig;
```

### Feature-based directory structure

```
app/
├── root.tsx                    # Layout shell, global styles, error boundary
├── routes.ts                   # Imperative route config
├── {feature}/
│   ├── routes/                 # Route modules (loaders, actions, components)
│   │   ├── index.tsx
│   │   └── $id.tsx
│   ├── components/             # Feature-specific UI components
│   └── lib/                    # Feature-specific logic (hooks, utils, types)
└── shared/
    ├── routes/                 # Cross-cutting routes (health, 404)
    ├── components/             # Shared UI components
    └── lib/                    # Shared hooks, utils, types
```

### Route module pattern

```typescript
// app/{feature}/routes/index.tsx
import type { Route } from './+types/index';

export async function loader({ request }: Route.LoaderArgs) {
  // Server-side data fetching
}

export async function action({ request }: Route.ActionArgs) {
  // Server-side mutation handling
}

export default function FeaturePage({ loaderData }: Route.ComponentProps) {
  // UI component
}
```

Route types are auto-generated into `.react-router/types/` via `react-router typegen`.

## Strict TypeScript

All code uses strict mode. No `any` types unless explicitly justified.

- Path alias: `~/*` maps to `./app/*`
- Target: ES2022
- Module resolution: bundler
- JSX: react-jsx

## Styling

Tailwind CSS v4 configured via the `@tailwindcss/vite` plugin — no `tailwind.config.js` file. The CSS entry point lives in `packages/web-common/styles.css` and is imported in `root.tsx`.

Design system uses a cyan/teal primary palette with Inter font. Use Tailwind utility classes. No component library is installed — build components from Tailwind primitives.

Sidebar/menu items are plain text labels only. NEVER add icons (including emojis) to menu items in `menu-config.ts` — the `MenuItem` interface intentionally has no `icon` property. Do not reintroduce one.

Mobile-first responsive design using Tailwind breakpoints.

## Environment Variables

Loaded from monorepo root. Allowed prefixes:

| Prefix | Purpose |
|--------|---------|
| `VITE_` | Client-side visible vars |
| `API_` | API endpoint configuration |
| `SESSION_` | Session management |
| `NODE_` | Node environment |
| `APP_` | App metadata (version) |

Turbo passes through: `NODE_ENV`, `APP_VERSION`, `API_URL`, `SESSION_SECRET`, `SESSION_DOMAIN`.

Secrets never committed. Use `.env.example` for documentation.

## Lazy Loading of Heavy Dependencies (MANDATORY)

Heavy libraries MUST be lazy loaded. They are NOT allowed in the initial bundle:

1. **Chart libraries** (ApexCharts, Chart.js, etc.) — only on dashboard routes
2. **Barcode scanner** (@zxing/browser, html5-qrcode) — only on sale/scanner routes
3. **PDF generation** (jspdf, html2canvas) — only on export routes

### How to enforce

- Use React Router's code-splitting via route-based lazy loading (automatic with route modules)
- For non-route libraries, use dynamic `import()`:

```typescript
const loadChartLib = () => import('some-chart-lib');
```

- Verify in Network tab: auth/login routes must NOT load these libraries

## Code Style

- No comments unless explicitly requested
- Imports order: React/React Router > External > Internal (use `~/` alias)
- Use interfaces over types for object shapes
- Use `readonly` for immutable properties
- Components: PascalCase files and exports
- Utilities/hooks: camelCase files, camelCase exports
- Constants: UPPER_SNAKE_CASE for config, camelCase for service constants
- SCSS/CSS: Tailwind utility classes preferred; custom CSS uses BEM-like naming

## Package Dependency Direction

```
web-store-pos ──▶ @store-mgmt/web-common
web-store-pos ──▶ @store-mgmt/domain
web-common ─────▶ @store-mgmt/domain
```

Circular dependencies between packages are prohibited. Dependency direction flows from apps to packages, never the reverse.

## Principles

- YAGNI: Do not add abstractions, config layers, or features beyond what is currently required
- Three similar lines are preferable to a premature abstraction
- Keep dependencies minimal — every new package must justify its inclusion
- Web apps never call database layers directly
- Each web app communicates only with its designated API via `API_URL`
