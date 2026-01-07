# Dockerfile per Formit MCP Server
# Ottimizzato per Raspberry Pi (ARM64)

FROM node:20-slim AS builder

WORKDIR /app

# Installa dipendenze per build native (@napi-rs/canvas)
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copia package files
COPY package*.json ./
COPY prisma ./prisma/

# Installa dipendenze (--legacy-peer-deps per conflitto zod v3/v4)
RUN npm ci --legacy-peer-deps

# Genera Prisma client
RUN npx prisma generate

# Copia sorgenti e compila
COPY tsconfig.json ./
COPY src ./src/

RUN npm run build

# ============================================
# Production stage
# ============================================
FROM node:20-slim AS production

WORKDIR /app

# Installa runtime dependencies per canvas + curl per healthcheck
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copia da builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Copia script di avvio
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Crea directory per database e uploads
RUN mkdir -p /app/data /app/uploads

# Variabili ambiente di default
ENV NODE_ENV=production
ENV MCP_HTTP_PORT=3007
ENV DATABASE_URL=file:/app/data/formit.db

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3007/health || exit 1

# Espone porta MCP
EXPOSE 3007

# Avvia con script che esegue migrazioni e poi il server
CMD ["./docker-entrypoint.sh"]

