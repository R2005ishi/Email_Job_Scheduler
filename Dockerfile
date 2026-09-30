# One image for both the API and the worker.
#   API:    default command (runs migrations, then starts the server)
#   Worker: start command "node dist/worker.js"

FROM node:22-slim AS build
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY backend/package*.json backend/
RUN cd backend && npm ci
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci

COPY backend backend
COPY frontend frontend
RUN cd backend && npx prisma generate && npm run build
RUN cd frontend && npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/backend

COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/dist /app/frontend/dist

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
