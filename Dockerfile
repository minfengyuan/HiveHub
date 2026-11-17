FROM node:24-bookworm-slim AS base
RUN npm install -g pnpm@10.34.0
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
FROM base AS api
WORKDIR /app/apps/api
ENV NODE_ENV=production
USER node
CMD ["sh", "-c", "pnpm migrate && exec pnpm exec tsx src/main.ts"]
FROM base AS web-build
RUN pnpm --filter @hivehub/web build
FROM nginx:stable-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
