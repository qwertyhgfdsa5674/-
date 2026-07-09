FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN npm install -g corepack@latest && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ai-ecommerce/server... build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

EXPOSE 3000
CMD ["node", "packages/server/dist/main.js"]
