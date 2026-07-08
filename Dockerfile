# Single-stage build for the YapStage monorepo. Railway auto-detects this
# over Railpack, which guarantees both client/dist and server/dist survive
# into the runtime image (Railpack's pruning can drop the client build).
FROM node:20-slim

WORKDIR /app

# Install with the lockfile first for layer caching. Workspace child
# package.json files are needed so `npm ci` can resolve the workspaces.
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci

# Build client (-> client/dist) then server (-> server/dist)
COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "start"]
