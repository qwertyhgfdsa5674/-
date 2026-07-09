FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN npm install -g corepack@latest && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ai-ecommerce/web build

FROM nginx:1.27-alpine AS runtime

COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html

EXPOSE 80
