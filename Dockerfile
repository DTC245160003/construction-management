FROM node:24-bookworm-slim AS frontend
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim AS application
WORKDIR /app/backend
ENV NODE_ENV=production
ENV PDF_FONT_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
ENV FRONTEND_STATIC_DIR=/app/frontend/dist
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/scripts ./scripts
COPY --from=frontend --chown=node:node /web/dist /app/frontend/dist
USER node
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node","-e","fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENV PORT=10000
CMD ["node","src/server.js"]
