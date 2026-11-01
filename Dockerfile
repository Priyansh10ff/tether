# One image, two roles: `app` (Next.js dashboard + API) and `worker` (delivery loop).
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/node/package.json packages/node/
RUN npm ci --no-audit --no-fund

FROM node:26-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
# Build-time placeholders only; real values come from the environment at runtime.
RUN ADMIN_PASSWORD=build-placeholder-not-used SESSION_SECRET=build-placeholder-not-used-32-chars npm run build \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -S tether && adduser -S tether -G tether
COPY --from=build --chown=tether:tether /app/node_modules ./node_modules
COPY --from=build --chown=tether:tether /app/.next ./.next
COPY --from=build --chown=tether:tether /app/public ./public
COPY --chown=tether:tether package.json next.config.ts tsconfig.json drizzle.config.ts ./
COPY --chown=tether:tether drizzle ./drizzle
COPY --chown=tether:tether src ./src
COPY --chown=tether:tether packages ./packages
COPY --chown=tether:tether bin ./bin
USER tether
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["npm", "run", "start"]
