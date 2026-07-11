FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN npm install -g pnpm@9.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ai-ecommerce/server... build
RUN pnpm --filter @ai-ecommerce/server --prod deploy /prod/server

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /prod/server ./

EXPOSE 3000
CMD ["node", "dist/main.js"]
