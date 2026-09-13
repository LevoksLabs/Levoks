FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Dedicated long-running process; never run synchronization inside a web request.
FROM dependencies AS github-worker
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node src ./src
COPY --chown=node:node scripts/github-worker.ts ./scripts/github-worker.ts
COPY --chown=node:node tsconfig.json ./tsconfig.json
USER node
CMD ["node", "--import", "tsx", "scripts/github-worker.ts"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
