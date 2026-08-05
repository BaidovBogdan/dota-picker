FROM node:24-bookworm-slim AS server-dependencies
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

FROM server-dependencies AS server-build
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build

FROM node:24-bookworm-slim AS admin-dependencies
WORKDIR /app/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci

FROM admin-dependencies AS admin-build
COPY admin/index.html admin/tsconfig.json admin/tsconfig.app.json admin/tsconfig.node.json admin/vite.config.ts ./
COPY admin/src ./src
RUN npm run build

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=server-build /app/server/dist ./dist
COPY server/src/db/migrations ./dist/db/migrations
COPY --from=admin-build /app/admin/dist ./admin
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
