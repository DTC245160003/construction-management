FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV API_ONLY=1

# The internal acceptance PDF embeds this font for Vietnamese text.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
ENV PDF_FONT_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node src ./src

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', {signal: AbortSignal.timeout(4000)}).then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "src/server.js"]
