# Poke comment server — Postgres-backed, SSE realtime.
FROM node:22-alpine

WORKDIR /app

# Install deps against the lockfile only (fast, cached layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
# PORT is read by the app; platforms usually inject their own.
EXPOSE 4000

# Boot-time ensureSchema() makes a separate migrate step optional, but running
# it explicitly keeps startup fast and surfaces schema errors early.
CMD ["node", "src/server.js"]
