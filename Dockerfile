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

# Build client (-> client/dist) then server (-> server/dist).
# The client bundle stamps its own commit so a phone can report which build it
# is running. git isn't in this image, so Railway's SHA has to be handed in as
# a build arg — at runtime the server reads the same variable directly.
ARG RAILWAY_GIT_COMMIT_SHA
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "start"]
