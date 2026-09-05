# Build from the repository root: docker build -f server/Dockerfile .
# The server imports two shared files from src/lib, so the context must include them.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --omit=dev --workspace server

COPY server/src ./server/src
COPY src/lib/types.ts src/lib/sync.ts ./src/lib/

ENV PORT=8787
ENV DATABASE_PATH=/data/error-tracker.sqlite
# The process runs as the unprivileged node user, so the data directory must be writable by it.
# A named volume inherits this ownership on first mount; for a bind mount, chown the host directory to uid 1000.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8787

USER node
CMD ["node", "--no-warnings=ExperimentalWarning", "server/src/index.ts"]
