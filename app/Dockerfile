# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS deps
WORKDIR /app/app

COPY app/package.json ./
RUN npm install --no-audit --no-fund

FROM node:20-bookworm-slim AS builder
WORKDIR /app/app

ARG NEXT_PUBLIC_BASE_URL=
ARG NEXT_PUBLIC_WEBAPP_URL=
ARG NEXT_PUBLIC_BOT_URL=
ARG NEXT_PUBLIC_BOT_USERNAME=
ARG NEXT_PUBLIC_SUPPORT_MANAGER=
ARG NEXT_PUBLIC_MARKETPLACE_TELEGRAM_ONLY=

ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="file:/tmp/build.db" \
    NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL} \
    NEXT_PUBLIC_WEBAPP_URL=${NEXT_PUBLIC_WEBAPP_URL} \
    NEXT_PUBLIC_BOT_URL=${NEXT_PUBLIC_BOT_URL} \
    NEXT_PUBLIC_BOT_USERNAME=${NEXT_PUBLIC_BOT_USERNAME} \
    NEXT_PUBLIC_SUPPORT_MANAGER=${NEXT_PUBLIC_SUPPORT_MANAGER} \
    NEXT_PUBLIC_MARKETPLACE_TELEGRAM_ONLY=${NEXT_PUBLIC_MARKETPLACE_TELEGRAM_ONLY} \
    NODE_OPTIONS="--max-old-space-size=1536"

COPY --from=deps /app/app/node_modules ./node_modules
COPY app/ ./

RUN npx prisma generate \
 && npx prisma db push --skip-generate \
 && npm run build \
 && npm prune --omit=dev \
 && npm install prisma@6.19.3 --omit=dev --no-audit --no-fund

FROM node:20-bookworm-slim AS runner
WORKDIR /app/app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Europe/Kyiv \
    DATABASE_URL="file:/app/database/ayn_marketplace.db"

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && ln -snf /usr/share/zoneinfo/Europe/Kyiv /etc/localtime \
 && echo Europe/Kyiv > /etc/timezone

COPY --from=builder /app/app/package.json ./
COPY --from=builder /app/app/node_modules ./node_modules
COPY --from=builder /app/app/.next ./.next
COPY --from=builder /app/app/public ./public
COPY --from=builder /app/app/prisma ./prisma
COPY --from=builder /app/app/next.config.ts ./
COPY --from=builder /app/app/lib/media/listingMediaConstants.ts ./lib/media/listingMediaConstants.ts
COPY docker/app-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
 && mkdir -p /app/database /app/app/public/listings/originals /app/app/public/avatars

EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
