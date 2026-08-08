# The frontend is built once and then served by the backend, so the whole
# office — page, API and WebSocket — lives behind a single port. State lives
# in Postgres, so the image itself is disposable.

# --- build both halves ----------------------------------------------------
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile

COPY frontend/ frontend/
RUN pnpm --filter frontend build

# The server is TypeScript now, so it is compiled here and only the output
# is carried into the image below
COPY backend/ backend/
RUN pnpm --filter backend build

# --- the server -----------------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
RUN corepack enable && pnpm install --frozen-lockfile --prod --filter backend

COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist backend/public

USER node
EXPOSE 3001
# DATABASE_URL must be supplied at run time
CMD ["node", "backend/dist/main.js"]
