# Multi-stage build for the web-store-pos React SPA served behind HAProxy on a
# dedicated subdomain. Stage 1 builds the static client from the pnpm monorepo;
# stage 2 serves it with nginx and proxies /api to the shared store-mgmt backend
# (same pattern as loadbalancer/nginx.conf, which serves the Angular frontend).

# --- Build stage --------------------------------------------------------------
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
COPY . .
# Build web-store-pos AND its workspace deps (domain, web-common) in
# dependency order — the `...` suffix selects the package plus its deps.
# @store-mgmt/domain resolves via exports -> dist/, so it must be compiled first
# or the app build fails with "Failed to resolve entry for @store-mgmt/domain".
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "@store-mgmt/web-store-pos..." build

# --- Serve stage --------------------------------------------------------------
FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web-store-pos/build/client /usr/share/nginx/html
EXPOSE 80
